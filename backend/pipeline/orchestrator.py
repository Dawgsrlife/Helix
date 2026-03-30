"""Async in-process pipeline orchestrator for generation/edit flows."""

from __future__ import annotations

import asyncio
import contextlib
import inspect
from dataclasses import dataclass
from collections.abc import Awaitable, Callable
from uuid import uuid4

from models.domain import CandidateScores, DesignSpec, LikelihoodScore
from pipeline.evo2_score import score_candidate
from pipeline.intent_parser import parse_intent
from pipeline.explanation import generate_explanation
from pipeline.retrieval import RetrievalResult, retrieve_context
from services.evo2 import Evo2MockService, Evo2Service
from services.mock_pdb import build_mock_pdb_from_dna
from services.regulatory_viz import build_regulatory_map
from services.structure import predict_structure
from config import settings, StructureMode
from ws.events import (
    CandidateSeedData,
    CandidateSeedEvent,
    CandidateStatusData,
    CandidateStatusEvent,
    CandidateScoredData,
    CandidateScoredEvent,
    ExplanationChunkData,
    ExplanationChunkEvent,
    GenerationTokenData,
    GenerationTokenEvent,
    IntentParsedData,
    IntentParsedEvent,
    PipelineManifestData,
    PipelineManifestEvent,
    PipelineCompleteData,
    PipelineCompleteEvent,
    RegulatoryMapReadyData,
    RegulatoryMapReadyEvent,
    RetrievalProgressData,
    RetrievalProgressEvent,
    StageStatusData,
    StageStatusEvent,
    StructureReadyData,
    StructureReadyEvent,
)
from ws.manager import WebSocketManager

DEFAULT_SEED = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"
CandidateUpdateCallback = Callable[[int, str], Awaitable[None] | None]
SpecUpdateCallback = Callable[[DesignSpec], Awaitable[None] | None]
STAGE_ORDER = ["intent", "retrieval", "generation", "scoring", "structure", "explanation", "complete"]
STAGE_RANK = {"pending": 0, "active": 1, "done": 2, "failed": 2}


@dataclass
class PipelineProfile:
    run_profile: str
    truth_mode: str
    candidate_workers: int
    retrieval_timeout: float
    generation_timeout: float
    scoring_timeout: float
    structure_timeout: float
    explanation_timeout: float
    use_structure_fallback: bool


@dataclass
class CandidateRuntime:
    id: int
    status: str = "queued"
    sequence: str = ""
    scores: dict[str, float] | None = None
    pdb_data: str | None = None
    regulatory_map: dict[str, object] | None = None
    confidence: float | None = None
    error: str | None = None

    @property
    def is_failed(self) -> bool:
        return self.status == "failed"

    @property
    def is_completed(self) -> bool:
        return self.status in {"structured", "failed"}

    def to_payload(self) -> dict[str, object]:
        return {
            "id": self.id,
            "status": self.status,
            "sequence": self.sequence,
            "scores": self.scores,
            "pdb_data": self.pdb_data,
            "regulatory_map": self.regulatory_map,
            "confidence": self.confidence,
            "error": self.error,
        }


class StageTracker:
    def __init__(self, manager: WebSocketManager, session_id: str) -> None:
        self.manager = manager
        self.session_id = session_id
        self.status_by_stage = {stage: "pending" for stage in STAGE_ORDER}
        self.progress_by_stage = {stage: 0.0 for stage in STAGE_ORDER}

    async def emit_initial(self) -> None:
        for stage in STAGE_ORDER:
            await self.set(stage, "pending", 0.0, force=True)

    async def set(self, stage: str, status: str, progress: float | None = None, force: bool = False) -> None:
        if stage not in self.status_by_stage:
            return
        current_status = self.status_by_stage[stage]
        current_rank = STAGE_RANK.get(current_status, 0)
        new_rank = STAGE_RANK.get(status, 0)
        if not force:
            if current_status in {"done", "failed"} and status in {"pending", "active"}:
                return
            if new_rank < current_rank:
                return
        self.status_by_stage[stage] = status
        if progress is not None:
            self.progress_by_stage[stage] = max(0.0, min(progress, 1.0))
        elif status == "done":
            self.progress_by_stage[stage] = 1.0
        elif status == "pending":
            self.progress_by_stage[stage] = 0.0

        await self.manager.send_event(
            self.session_id,
            StageStatusEvent(
                data=StageStatusData(
                    stage=stage,
                    status=status,
                    progress=round(self.progress_by_stage[stage], 4),
                )
            ).to_json(),
        )


# ---------------------------------------------------------------------------
# Shared helpers — extracted to eliminate copy-paste across pipelines
# ---------------------------------------------------------------------------


async def _score_with_fallback(
    service: Evo2Service,
    fallback_service: Evo2Service,
    sequence: str,
    target_tissues: list[str] | None,
    timeout: float,
) -> tuple[CandidateScores, list[LikelihoodScore]]:
    """Score a candidate, falling back to mock service on timeout or error."""
    try:
        async with asyncio.timeout(timeout):
            return await score_candidate(service, sequence, target_tissues=target_tissues)
    except Exception:
        return await score_candidate(fallback_service, sequence, target_tissues=target_tissues)


async def _emit_scored(
    manager: WebSocketManager,
    session_id: str,
    candidate_id: int,
    scores: CandidateScores,
    per_position: list[LikelihoodScore],
) -> dict[str, float]:
    """Emit scoring events and return the score dict."""
    score_dict = scores.to_dict()
    await manager.send_event(
        session_id,
        CandidateScoredEvent(
            data=CandidateScoredData(
                candidate_id=candidate_id,
                scores=score_dict,
                per_position_scores=[
                    {"position": x.position, "score": x.score} for x in per_position
                ],
            )
        ).to_json(),
    )
    await manager.send_event(
        session_id,
        CandidateStatusEvent(
            data=CandidateStatusData(candidate_id=candidate_id, status="scored")
        ).to_json(),
    )
    return score_dict


async def _resolve_structure(
    sequence: str,
    candidate_id: int,
    timeout: float,
    use_fallback: bool,
) -> tuple[str | None, float | None, str | None]:
    """Predict structure, returning (pdb_data, confidence, error_reason).

    Tries the configured structure mode, then falls back to mock PDB if allowed.
    """
    pdb_data: str | None = None
    confidence: float | None = None
    error: str | None = None

    try:
        async with asyncio.timeout(timeout):
            if settings.structure_mode == StructureMode.ESMFOLD:
                result = await predict_structure(sequence)
                if result is not None:
                    pdb_data = result.pdb_data
                    confidence = result.confidence
            elif settings.structure_mode == StructureMode.MOCK:
                pdb_data, confidence = build_mock_pdb_from_dna(
                    sequence, candidate_id=candidate_id
                )
    except TimeoutError:
        error = "structure_timeout"
    except Exception as exc:
        error = f"structure_error:{exc}"

    if pdb_data is None and use_fallback:
        pdb_data, confidence = build_mock_pdb_from_dna(
            sequence, candidate_id=candidate_id
        )
        error = None

    return pdb_data, confidence, error


async def _emit_structure(
    manager: WebSocketManager,
    session_id: str,
    candidate_id: int,
    sequence: str,
    pdb_data: str,
    confidence: float | None,
    spec: DesignSpec,
) -> dict[str, object] | None:
    """Emit structure + optional regulatory map events. Returns regulatory_map or None."""
    await manager.send_event(
        session_id,
        StructureReadyEvent(
            data=StructureReadyData(candidate_id=candidate_id, pdb_data=pdb_data, confidence=confidence)
        ).to_json(),
    )

    regulatory_map: dict[str, object] | None = None
    if not _uses_protein_structure(spec.design_type):
        regulatory_map = build_regulatory_map(sequence)
        await manager.send_event(
            session_id,
            RegulatoryMapReadyEvent(
                data=RegulatoryMapReadyData(
                    candidate_id=candidate_id,
                    regulatory_map=regulatory_map,
                )
            ).to_json(),
        )

    await manager.send_event(
        session_id,
        CandidateStatusEvent(
            data=CandidateStatusData(candidate_id=candidate_id, status="structured")
        ).to_json(),
    )
    return regulatory_map


# ---------------------------------------------------------------------------
# Profile configuration
# ---------------------------------------------------------------------------


def _profile(run_profile: str, truth_mode: str) -> PipelineProfile:
    use_structure_fallback = truth_mode != "real_only"
    if run_profile == "live":
        return PipelineProfile(
            run_profile="live",
            truth_mode=truth_mode,
            candidate_workers=3,
            retrieval_timeout=20.0,
            generation_timeout=25.0,
            scoring_timeout=20.0,
            structure_timeout=65.0,
            explanation_timeout=20.0,
            use_structure_fallback=use_structure_fallback,
        )
    return PipelineProfile(
        run_profile="demo",
        truth_mode=truth_mode,
        candidate_workers=4,
        retrieval_timeout=25.0,
        generation_timeout=8.0,
        scoring_timeout=8.0,
        structure_timeout=20.0,
        explanation_timeout=10.0,
        use_structure_fallback=use_structure_fallback,
    )


# ---------------------------------------------------------------------------
# Main generation pipeline
# ---------------------------------------------------------------------------


async def run_generation_pipeline(
    *,
    manager: WebSocketManager,
    service: Evo2Service,
    session_id: str,
    goal: str,
    n_tokens: int | None = None,
    n_candidates: int = 1,
    run_profile: str = "demo",
    truth_mode: str = "demo_fallback",
    seed_sequence: str = DEFAULT_SEED,
    on_candidate_ready: CandidateUpdateCallback | None = None,
    on_spec_ready: SpecUpdateCallback | None = None,
) -> None:
    candidate_count = max(1, min(int(n_candidates), 10))
    profile = _profile(run_profile, truth_mode)
    fallback_service = Evo2MockService()
    tracker = StageTracker(manager, session_id)
    runtime: dict[int, CandidateRuntime] = {cid: CandidateRuntime(id=cid) for cid in range(candidate_count)}
    runtime_lock = asyncio.Lock()
    candidate_seeds: dict[int, str] = {}
    first_explanation_task: asyncio.Task[None] | None = None
    first_explained_candidate_id: int | None = None
    finished_generation = 0
    finished_scoring = 0
    finished_structure = 0

    await manager.send_event(
        session_id,
        PipelineManifestEvent(
            data=PipelineManifestData(
                session_id=session_id,
                requested_candidates=candidate_count,
                candidate_ids=list(range(candidate_count)),
                run_profile=profile.run_profile,
                truth_mode=profile.truth_mode,
                candidate_seed_sequences={},
            )
        ).to_json(),
    )
    await tracker.emit_initial()

    for candidate_id in range(candidate_count):
        await manager.send_event(
            session_id,
            CandidateStatusEvent(
                data=CandidateStatusData(candidate_id=candidate_id, status="queued")
            ).to_json(),
        )

    await tracker.set("intent", "active", 0.05)
    spec = await _emit_intent(manager, session_id, goal)
    if on_spec_ready is not None:
        callback_result = on_spec_ready(spec)
        if inspect.isawaitable(callback_result):
            await callback_result
    await tracker.set("intent", "done", 1.0)

    await tracker.set("retrieval", "active", 0.05)
    retrieval_result = await _emit_retrieval(
        manager,
        session_id,
        spec,
        tracker=tracker,
        timeout_seconds=profile.retrieval_timeout,
        allow_demo_fallback=profile.truth_mode == "demo_fallback",
    )
    await tracker.set("retrieval", "done", 1.0)

    candidate_seeds, seed_source = _build_candidate_seeds(
        seed_sequence=seed_sequence,
        retrieval_result=retrieval_result,
        candidate_count=candidate_count,
        enforce_foldable=n_tokens is None,
    )
    for candidate_id, seeded_sequence in sorted(candidate_seeds.items()):
        await manager.send_event(
            session_id,
            CandidateSeedEvent(
                data=CandidateSeedData(
                    candidate_id=candidate_id,
                    sequence=seeded_sequence,
                    source=seed_source,
                )
            ).to_json(),
        )

    await tracker.set("generation", "active", 0.01)
    await tracker.set("scoring", "pending", 0.0)
    await tracker.set("structure", "pending", 0.0)
    await tracker.set("explanation", "pending", 0.0)
    await tracker.set("complete", "pending", 0.0)

    semaphore = asyncio.Semaphore(min(profile.candidate_workers, candidate_count))
    uses_protein_structure = _uses_protein_structure(spec.design_type)
    emit_regulatory_overlay = not uses_protein_structure
    target_sequence_length = _default_target_sequence_length(spec.design_type, profile.run_profile)

    async def _attempt_first_explanation(candidate: CandidateRuntime) -> None:
        nonlocal first_explanation_task, first_explained_candidate_id
        if first_explanation_task is not None:
            return
        if candidate.status != "structured" or not candidate.scores:
            return
        first_explained_candidate_id = candidate.id
        await tracker.set("explanation", "active", 0.2)
        first_explanation_task = asyncio.create_task(
            generate_explanation(
                sequence=candidate.sequence,
                scores=dict(candidate.scores),
                spec=spec,
                candidate_id=candidate.id,
                manager=manager,
                session_id=session_id,
            )
        )

    async def _mark_failed(candidate_id: int, sequence: str, reason: str, stage: str) -> CandidateRuntime:
        candidate = CandidateRuntime(id=candidate_id, status="failed", sequence=sequence, error=reason)
        await manager.send_event(
            session_id,
            CandidateStatusEvent(
                data=CandidateStatusData(candidate_id=candidate_id, status="failed", reason=reason)
            ).to_json(),
        )
        if stage in {"generation", "scoring", "structure"}:
            await tracker.set(stage, "active")
        return candidate

    async def _run_candidate(candidate_id: int) -> None:
        nonlocal finished_generation, finished_scoring, finished_structure
        async with semaphore:
            varied_seed = candidate_seeds[candidate_id]
            tokens_to_generate = (
                int(n_tokens)
                if n_tokens is not None
                else max(96, target_sequence_length - len(varied_seed))
            )
            temperature = min(1.0, 0.7 + (0.03 * candidate_id))
            generated = varied_seed
            await manager.send_event(
                session_id,
                CandidateStatusEvent(
                    data=CandidateStatusData(candidate_id=candidate_id, status="running")
                ).to_json(),
            )

            try:
                async with asyncio.timeout(profile.generation_timeout):
                    async for token in service.generate(
                        varied_seed,
                        n_tokens=tokens_to_generate,
                        temperature=temperature,
                    ):
                        position = len(generated)
                        generated += token
                        await manager.send_event(
                            session_id,
                            GenerationTokenEvent(
                                data=GenerationTokenData(candidate_id=candidate_id, token=token, position=position)
                            ).to_json(),
                        )
            except Exception:
                generated = await _fill_with_demo_tokens(
                    manager=manager,
                    session_id=session_id,
                    candidate_id=candidate_id,
                    generated=generated,
                    seed_length=len(varied_seed),
                    n_tokens=tokens_to_generate,
                    temperature=temperature,
                    fallback_service=fallback_service,
                )

            if on_candidate_ready is not None:
                callback_result = on_candidate_ready(candidate_id, generated)
                if inspect.isawaitable(callback_result):
                    await callback_result

            async with runtime_lock:
                finished_generation += 1
                await tracker.set("generation", "active", finished_generation / candidate_count)
                await tracker.set("scoring", "active", max(0.01, finished_scoring / candidate_count))

            # --- Score ---
            target_tissues = spec.tissue_specificity.high_expression if spec.tissue_specificity else None
            scores, per_position = await _score_with_fallback(
                service, fallback_service, generated, target_tissues, profile.scoring_timeout,
            )
            score_dict = await _emit_scored(manager, session_id, candidate_id, scores, per_position)

            async with runtime_lock:
                finished_scoring += 1
                await tracker.set("scoring", "active", finished_scoring / candidate_count)
                await tracker.set("structure", "active", max(0.01, finished_structure / candidate_count))

            # --- Structure ---
            pdb_data, confidence, structure_error = await _resolve_structure(
                generated, candidate_id, profile.structure_timeout, profile.use_structure_fallback,
            )

            if pdb_data is None:
                reason = structure_error or "structure_unavailable"
                candidate = await _mark_failed(candidate_id, generated, reason, "structure")
                runtime[candidate_id] = candidate
                async with runtime_lock:
                    finished_structure += 1
                    await tracker.set("structure", "active", finished_structure / candidate_count)
                return

            regulatory_map = await _emit_structure(
                manager, session_id, candidate_id, generated, pdb_data, confidence, spec,
            )

            candidate = CandidateRuntime(
                id=candidate_id,
                status="structured",
                sequence=generated,
                scores=score_dict,
                pdb_data=pdb_data,
                regulatory_map=regulatory_map,
                confidence=confidence,
                error=None,
            )
            runtime[candidate_id] = candidate
            await _attempt_first_explanation(candidate)

            async with runtime_lock:
                finished_structure += 1
                await tracker.set("structure", "active", finished_structure / candidate_count)

    tasks = [asyncio.create_task(_run_candidate(candidate_id)) for candidate_id in range(candidate_count)]
    await asyncio.gather(*tasks)
    await tracker.set("generation", "done", 1.0)
    await tracker.set("scoring", "done", 1.0)
    await tracker.set("structure", "done", 1.0)

    if first_explanation_task is not None:
        with contextlib.suppress(Exception):
            await asyncio.wait_for(first_explanation_task, timeout=profile.explanation_timeout)

    structured = [candidate for candidate in runtime.values() if candidate.status == "structured" and candidate.scores]
    if structured:
        top_candidate = max(structured, key=lambda c: float((c.scores or {}).get("combined", 0.0)))
        if (
            settings.structure_mode == StructureMode.ESMFOLD
            and top_candidate.pdb_data
            and _looks_like_mock_pdb(top_candidate.pdb_data)
        ):
            with contextlib.suppress(Exception):
                high_fidelity = await asyncio.wait_for(
                    predict_structure(top_candidate.sequence),
                    timeout=max(45.0, profile.structure_timeout * 2.5),
                )
                if high_fidelity is not None:
                    top_candidate.pdb_data = high_fidelity.pdb_data
                    top_candidate.confidence = high_fidelity.confidence
                    runtime[top_candidate.id] = top_candidate
                    await manager.send_event(
                        session_id,
                        StructureReadyEvent(
                            data=StructureReadyData(
                                candidate_id=top_candidate.id,
                                pdb_data=high_fidelity.pdb_data,
                                confidence=high_fidelity.confidence,
                            )
                        ).to_json(),
                    )
        if first_explained_candidate_id != top_candidate.id:
            await tracker.set("explanation", "active", 0.7)
            with contextlib.suppress(Exception):
                await asyncio.wait_for(
                    generate_explanation(
                        sequence=top_candidate.sequence,
                        scores=dict(top_candidate.scores or {}),
                        spec=spec,
                        candidate_id=top_candidate.id,
                        manager=manager,
                        session_id=session_id,
                    ),
                    timeout=profile.explanation_timeout,
                )
        await tracker.set("explanation", "done", 1.0)
    else:
        best = max(runtime.values(), key=lambda c: len(c.sequence))
        await tracker.set("explanation", "active", 0.5)
        await manager.send_event(
            session_id,
            ExplanationChunkEvent(
                data=ExplanationChunkData(
                    candidate_id=best.id,
                    text="No structurally validated candidate completed in this run.",
                )
            ).to_json(),
        )
        await tracker.set("explanation", "failed", 1.0)

    failed = sum(1 for candidate in runtime.values() if candidate.is_failed)
    completed = candidate_count - failed
    await tracker.set("complete", "done", 1.0)
    ordered_payload = [runtime[candidate_id].to_payload() for candidate_id in sorted(runtime.keys())]
    await manager.send_event(
        session_id,
        PipelineCompleteEvent(
            data=PipelineCompleteData(
                requested_candidates=candidate_count,
                completed_candidates=completed,
                failed_candidates=failed,
                candidates=ordered_payload,
            )
        ).to_json(),
    )


# ---------------------------------------------------------------------------
# Follow-up pipeline
# ---------------------------------------------------------------------------


async def run_followup_pipeline(
    *,
    manager: WebSocketManager,
    service: Evo2Service,
    session_id: str,
    message: str,
    candidate_id: int = 0,
    base_sequence: str = DEFAULT_SEED,
    run_profile: str = "demo",
    truth_mode: str = "demo_fallback",
    design_type_hint: str | None = None,
    on_candidate_ready: CandidateUpdateCallback | None = None,
    on_spec_ready: SpecUpdateCallback | None = None,
) -> list[str]:
    profile = _profile(run_profile, truth_mode)
    fallback_service = Evo2MockService()
    tracker = StageTracker(manager, session_id)
    await tracker.emit_initial()
    await tracker.set("intent", "active", 0.1)
    spec = await _emit_intent(manager, session_id, message)
    if design_type_hint and not any(
        token in message.lower()
        for token in ("coding", "protein", "peptide", "orf", "regulatory", "enhancer", "promoter")
    ):
        spec.design_type = design_type_hint
    if on_spec_ready is not None:
        callback_result = on_spec_ready(spec)
        if inspect.isawaitable(callback_result):
            await callback_result
    await tracker.set("intent", "done", 1.0)
    steps = ["intent_parse", "evo2_generation", "evo2_scoring"]

    await manager.send_event(
        session_id,
        CandidateStatusEvent(
            data=CandidateStatusData(candidate_id=candidate_id, status="running")
        ).to_json(),
    )

    await tracker.set("generation", "active", 0.2)
    base = base_sequence
    if "novel" in message.lower():
        base = _simple_mutate(base, 12, "G")
    if "tissue" in message.lower() and len(base) > 20:
        base = _simple_mutate(base, 20, "C")
    await tracker.set("generation", "done", 1.0)

    # --- Score ---
    await tracker.set("scoring", "active", 0.2)
    target_tissues = spec.tissue_specificity.high_expression if spec.tissue_specificity else None
    scores, per_position = await _score_with_fallback(
        service, fallback_service, base, target_tissues, profile.scoring_timeout,
    )
    await _emit_scored(manager, session_id, candidate_id, scores, per_position)
    await tracker.set("scoring", "done", 1.0)

    # --- Structure ---
    await tracker.set("structure", "active", 0.2)
    pdb_data, confidence, structure_error = await _resolve_structure(
        base, candidate_id, profile.structure_timeout, profile.use_structure_fallback,
    )

    if pdb_data is None:
        reason = structure_error or "structure_unavailable"
        await manager.send_event(
            session_id,
            CandidateStatusEvent(
                data=CandidateStatusData(
                    candidate_id=candidate_id,
                    status="failed",
                    reason=reason,
                )
            ).to_json(),
        )
        await tracker.set("structure", "failed", 1.0)
        await tracker.set("complete", "done", 1.0)
        await manager.send_event(
            session_id,
            PipelineCompleteEvent(
                data=PipelineCompleteData(
                    requested_candidates=1,
                    completed_candidates=0,
                    failed_candidates=1,
                    candidates=[
                        {
                            "id": candidate_id,
                            "status": "failed",
                            "sequence": base,
                            "scores": scores.to_dict(),
                            "pdb_data": None,
                            "regulatory_map": None,
                            "confidence": None,
                            "error": reason,
                        },
                    ],
                )
            ).to_json(),
        )
        return steps

    regulatory_map = await _emit_structure(
        manager, session_id, candidate_id, base, pdb_data, confidence, spec,
    )
    await tracker.set("structure", "done", 1.0)

    # --- Explanation ---
    await tracker.set("explanation", "active", 0.2)
    await manager.send_event(
        session_id,
        ExplanationChunkEvent(
            data=ExplanationChunkData(
                candidate_id=candidate_id,
                text="Applied follow-up constraints and recomputed candidate scores.",
            )
        ).to_json(),
    )
    await tracker.set("explanation", "done", 1.0)

    if on_candidate_ready is not None:
        callback_result = on_candidate_ready(candidate_id, base)
        if inspect.isawaitable(callback_result):
            await callback_result

    await tracker.set("complete", "done", 1.0)
    await manager.send_event(
        session_id,
        PipelineCompleteEvent(
            data=PipelineCompleteData(
                requested_candidates=1,
                completed_candidates=1,
                failed_candidates=0,
                candidates=[
                    {
                        "id": candidate_id,
                        "status": "structured",
                        "sequence": base,
                        "scores": scores.to_dict(),
                        "pdb_data": pdb_data,
                        "regulatory_map": regulatory_map,
                        "confidence": confidence,
                        "error": None,
                    },
                ]
            )
        ).to_json(),
    )
    return steps


# ---------------------------------------------------------------------------
# Intent & retrieval helpers
# ---------------------------------------------------------------------------


async def _emit_intent(manager: WebSocketManager, session_id: str, goal: str) -> DesignSpec:
    spec = await parse_intent(goal)
    event = IntentParsedEvent(data=IntentParsedData(spec=spec.to_dict()))
    await manager.send_event(session_id, event.to_json())
    return spec


async def _emit_retrieval(
    manager: WebSocketManager,
    session_id: str,
    spec: DesignSpec,
    tracker: StageTracker | None = None,
    timeout_seconds: float = 5.0,
    allow_demo_fallback: bool = False,
) -> RetrievalResult | None:
    import dataclasses

    result = None
    with contextlib.suppress(Exception):
        async with asyncio.timeout(timeout_seconds):
            result = await retrieve_context(spec)

    sources = [
        ("ncbi", result.ncbi if result is not None else None),
        ("pubmed", result.pubmed if result is not None else None),
        ("clinvar", result.clinvar if result is not None else None),
    ]
    completed = 0
    for source_name, source_result in sources:
        if source_result is not None:
            if hasattr(source_result, "__dataclass_fields__"):
                result_dict = dataclasses.asdict(source_result)
            elif hasattr(source_result, "model_dump"):
                result_dict = source_result.model_dump()
            else:
                result_dict = {}
            status = "complete"
        else:
            if allow_demo_fallback:
                result_dict = _build_retrieval_fallback(source_name, spec)
                status = "complete"
            else:
                result_dict = {}
                status = "failed"

        await manager.send_event(
            session_id,
            RetrievalProgressEvent(
                data=RetrievalProgressData(source=source_name, status=status, result=result_dict)
            ).to_json(),
        )
        if status == "complete":
            completed += 1
        if tracker is not None:
            await tracker.set("retrieval", "active", completed / len(sources))
    return result


def _build_retrieval_fallback(source_name: str, spec: DesignSpec) -> dict[str, object]:
    gene = spec.target_gene or "GENE"
    if source_name == "ncbi":
        return {
            "gene": gene,
            "organism": spec.organism,
            "chromosome": "demo_chr",
            "start": 0,
            "end": 420,
            "strand": "+",
            "summary": f"Demo fallback genomic context synthesized for {gene}.",
            "reference_accession": "DEMO_REFSEQ",
            "reference_sequence": (DEFAULT_SEED * 8)[:420],
            "fallback": True,
        }
    if source_name == "pubmed":
        return {
            "query": f"{gene} {spec.therapeutic_context or spec.design_type}",
            "count": 2,
            "papers": [
                {
                    "pmid": "DEMO-PMID-1",
                    "title": f"{gene} regulatory control in neural tissue (demo fallback)",
                    "year": 2024,
                    "journal": "Helix Demo Journal",
                    "authors": ["Fallback, A.", "Demo, B."],
                    "abstract": "Synthetic fallback context used when live literature retrieval is unavailable.",
                },
                {
                    "pmid": "DEMO-PMID-2",
                    "title": f"Sequence design constraints for {spec.design_type} (demo fallback)",
                    "year": 2023,
                    "journal": "Helix Methods",
                    "authors": ["Demo, C."],
                    "abstract": "Fallback evidence to preserve end-to-end demo continuity.",
                },
            ],
            "fallback": True,
        }
    return {
        "gene": gene,
        "variants": [],
        "pathogenic_count": 0,
        "benign_count": 0,
        "summary": f"No live ClinVar records available for {gene}; using safe empty fallback.",
        "fallback": True,
    }


# ---------------------------------------------------------------------------
# Generation helpers
# ---------------------------------------------------------------------------


async def _fill_with_demo_tokens(
    *,
    manager: WebSocketManager,
    session_id: str,
    candidate_id: int,
    generated: str,
    seed_length: int,
    n_tokens: int,
    temperature: float,
    fallback_service: Evo2MockService,
) -> str:
    emitted = max(0, len(generated) - seed_length)
    remaining = max(0, n_tokens - emitted)
    if remaining == 0:
        return generated

    async for token in fallback_service.generate(generated, n_tokens=remaining, temperature=temperature):
        position = len(generated)
        generated += token
        await manager.send_event(
            session_id,
            GenerationTokenEvent(
                data=GenerationTokenData(candidate_id=candidate_id, token=token, position=position)
            ).to_json(),
        )
    return generated


def _simple_mutate(sequence: str, position: int, new_base: str) -> str:
    if position < 0 or position >= len(sequence):
        return sequence
    return sequence[:position] + new_base + sequence[position + 1 :]


def _uses_protein_structure(design_type: str | None) -> bool:
    if not design_type:
        return False
    key = design_type.lower()
    return any(token in key for token in ("coding", "protein", "peptide", "orf"))


def _default_target_sequence_length(design_type: str | None, run_profile: str) -> int:
    if run_profile == "live":
        return 16000 if _uses_protein_structure(design_type) else 12000
    return 3200 if _uses_protein_structure(design_type) else 2200


def _select_context_seed(retrieval_result: RetrievalResult | None, fallback_seed: str) -> tuple[str, str]:
    if retrieval_result and retrieval_result.ncbi and retrieval_result.ncbi.reference_sequence:
        reference = retrieval_result.ncbi.reference_sequence
        if len(reference) >= 180:
            return reference[: min(260, len(reference))], "retrieval_context"
    return fallback_seed, "fallback_seed"


def _build_candidate_seeds(
    *,
    seed_sequence: str,
    retrieval_result: RetrievalResult | None,
    candidate_count: int,
    enforce_foldable: bool = True,
) -> tuple[dict[int, str], str]:
    base_seed, source = _select_context_seed(retrieval_result, seed_sequence)
    seeds: dict[int, str] = {}
    for cid in range(candidate_count):
        varied = _vary_seed(base_seed, cid)
        seeds[cid] = _ensure_foldable_seed(varied, cid) if enforce_foldable else varied
    return seeds, source


def _vary_seed(sequence: str, candidate_id: int) -> str:
    if candidate_id == 0 or not sequence:
        return sequence
    pos = (candidate_id * 7) % len(sequence)
    bases = ["A", "T", "C", "G"]
    new_base = bases[candidate_id % len(bases)]
    return _simple_mutate(sequence, pos, new_base)


def _ensure_foldable_seed(sequence: str, candidate_id: int, min_length_bp: int = 720) -> str:
    cleaned = "".join(base for base in sequence.upper() if base in {"A", "T", "C", "G"})
    if not cleaned:
        cleaned = DEFAULT_SEED
    if _longest_orf_bp(cleaned) >= 360 and len(cleaned) >= min_length_bp:
        return cleaned

    prefix = cleaned
    suffix = cleaned[-min(120, len(cleaned)) :] if len(cleaned) > 180 else ""
    scaffold_target = max(min_length_bp - len(prefix) - len(suffix), 120)
    scaffold = _coding_scaffold(candidate_id=candidate_id, target_bp=scaffold_target)
    seeded = f"{prefix}{scaffold}{suffix}"
    if len(seeded) < min_length_bp:
        seeded += _coding_scaffold(candidate_id=candidate_id + 17, target_bp=min_length_bp - len(seeded))
    return seeded


def _coding_scaffold(*, candidate_id: int, target_bp: int) -> str:
    codon_sets = [
        ["GCT", "CTG", "GAA", "AAG", "ACC", "TCT", "GGT", "CAG", "AAC", "ATC", "GAC", "TTC"],
        ["GCC", "TTG", "GAG", "AAA", "ACT", "AGC", "GGC", "CAA", "AAT", "ATT", "GAT", "TTT"],
        ["GCA", "CTA", "GAA", "AAG", "ACA", "TCC", "GGA", "CAG", "AAC", "ATC", "GAC", "TTC"],
        ["GCG", "CTC", "GAG", "AAA", "ACG", "TCG", "GGG", "CAA", "AAT", "ATT", "GAT", "TTT"],
    ]
    codons = codon_sets[candidate_id % len(codon_sets)]
    if target_bp <= 6:
        return "ATGTAA"

    body_bp = max(3, target_bp - 6)
    body_bp -= body_bp % 3
    body_codons = max(1, body_bp // 3)
    body = "".join(codons[i % len(codons)] for i in range(body_codons))
    return f"ATG{body}TAA"


def _longest_orf_bp(sequence: str) -> int:
    seq = sequence.upper()
    stops = {"TAA", "TAG", "TGA"}
    best = 0
    for frame in range(3):
        start_pos: int | None = None
        for i in range(frame, len(seq) - 2, 3):
            codon = seq[i : i + 3]
            if start_pos is None:
                if codon == "ATG":
                    start_pos = i
                continue
            if codon in stops:
                best = max(best, i + 3 - start_pos)
                start_pos = None
        if start_pos is not None:
            best = max(best, len(seq) - start_pos)
    return best


def _looks_like_mock_pdb(pdb_data: str) -> bool:
    header = "\n".join(pdb_data.splitlines()[:4]).lower()
    return "synthetic fallback" in header or "helix demo structure" in header


def create_session_id() -> str:
    return str(uuid4())

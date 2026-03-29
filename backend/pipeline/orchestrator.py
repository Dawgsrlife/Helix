"""Async in-process pipeline orchestrator for generation/edit flows."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Awaitable, Callable
from uuid import uuid4

from models.domain import DesignSpec
from pipeline.evo2_score import score_candidate
from pipeline.intent_parser import parse_intent
from pipeline.explanation import generate_explanation
from pipeline.retrieval import retrieve_context
from services.evo2 import Evo2Service
from services.structure import predict_structure
from config import settings, StructureMode
from ws.events import (
    CandidateScoredData,
    CandidateScoredEvent,
    ExplanationChunkData,
    ExplanationChunkEvent,
    GenerationTokenData,
    GenerationTokenEvent,
    IntentParsedData,
    IntentParsedEvent,
    PipelineCompleteData,
    PipelineCompleteEvent,
    RetrievalProgressData,
    RetrievalProgressEvent,
    StructureReadyData,
    StructureReadyEvent,
)
from ws.manager import WebSocketManager

DEFAULT_SEED = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"
CandidateUpdateCallback = Callable[[int, str], Awaitable[None] | None]


async def run_generation_pipeline(
    *,
    manager: WebSocketManager,
    service: Evo2Service,
    session_id: str,
    goal: str,
    n_tokens: int = 36,
    seed_sequence: str = DEFAULT_SEED,
    on_candidate_ready: CandidateUpdateCallback | None = None,
) -> None:
    spec = await _emit_intent(manager, session_id, goal)
    await _emit_retrieval(manager, session_id, spec)

    candidate_id = 0
    generated = seed_sequence
    async for token in service.generate(seed_sequence, n_tokens=n_tokens):
        position = len(generated)
        generated += token
        event = GenerationTokenEvent(
            data=GenerationTokenData(candidate_id=candidate_id, token=token, position=position)
        )
        await manager.send_event(session_id, event.to_json())

    scores, _ = await score_candidate(
        service,
        generated,
        target_tissues=spec.tissue_specificity.high_expression if spec.tissue_specificity else None,
    )
    await manager.send_event(
        session_id,
        CandidateScoredEvent(
            data=CandidateScoredData(
                candidate_id=candidate_id,
                scores=scores.to_dict(),
            )
        ).to_json(),
    )

    pdb_data = None
    confidence = 0.0
    if settings.structure_mode == StructureMode.ESMFOLD:
        result = await predict_structure(generated)
        if result is not None:
            pdb_data = result.pdb_data
            confidence = result.confidence

    if pdb_data is None:
        pdb_data = _mock_pdb(candidate_id)
        confidence = 0.73

    await manager.send_event(
        session_id,
        StructureReadyEvent(
            data=StructureReadyData(candidate_id=candidate_id, pdb_data=pdb_data, confidence=confidence)
        ).to_json(),
    )

    await generate_explanation(
        sequence=generated,
        scores=scores.to_dict(),
        spec=spec,
        manager=manager,
        session_id=session_id,
    )

    if on_candidate_ready is not None:
        callback_result = on_candidate_ready(candidate_id, generated)
        if inspect.isawaitable(callback_result):
            await callback_result

    await manager.send_event(
        session_id,
        PipelineCompleteEvent(
            data=PipelineCompleteData(
                candidates=[
                    {
                        "id": candidate_id,
                        "sequence": generated,
                        "scores": scores.to_dict(),
                        "pdb_data": pdb_data,
                    }
                ]
            )
        ).to_json(),
    )


async def run_followup_pipeline(
    *,
    manager: WebSocketManager,
    service: Evo2Service,
    session_id: str,
    message: str,
    candidate_id: int = 0,
    base_sequence: str = DEFAULT_SEED,
    on_candidate_ready: CandidateUpdateCallback | None = None,
) -> list[str]:
    spec = await _emit_intent(manager, session_id, message)
    steps = ["intent_parse", "evo2_generation", "evo2_scoring"]

    base = base_sequence
    if "novel" in message.lower():
        base = _simple_mutate(base, 12, "G")
    if "tissue" in message.lower() and len(base) > 20:
        base = _simple_mutate(base, 20, "C")

    scores, _ = await score_candidate(
        service,
        base,
        target_tissues=spec.tissue_specificity.high_expression if spec.tissue_specificity else None,
    )
    await manager.send_event(
        session_id,
        CandidateScoredEvent(
            data=CandidateScoredData(candidate_id=candidate_id, scores=scores.to_dict())
        ).to_json(),
    )

    await manager.send_event(
        session_id,
        ExplanationChunkEvent(
            data=ExplanationChunkData(text="Applied follow-up constraints and recomputed candidate scores.")
        ).to_json(),
    )

    if on_candidate_ready is not None:
        callback_result = on_candidate_ready(candidate_id, base)
        if inspect.isawaitable(callback_result):
            await callback_result

    await manager.send_event(
        session_id,
        PipelineCompleteEvent(
            data=PipelineCompleteData(
                candidates=[
                    {"id": candidate_id, "sequence": base, "scores": scores.to_dict()},
                ]
            )
        ).to_json(),
    )
    return steps


async def _emit_intent(manager: WebSocketManager, session_id: str, goal: str) -> DesignSpec:
    spec = await parse_intent(goal)
    event = IntentParsedEvent(data=IntentParsedData(spec=spec.to_dict()))
    await manager.send_event(session_id, event.to_json())
    return spec


async def _emit_retrieval(manager: WebSocketManager, session_id: str, spec: DesignSpec) -> None:
    import dataclasses

    result = await retrieve_context(spec)

    sources = [
        ("ncbi", result.ncbi),
        ("pubmed", result.pubmed),
        ("clinvar", result.clinvar),
    ]
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
            result_dict = {}
            status = "failed"

        await manager.send_event(
            session_id,
            RetrievalProgressEvent(
                data=RetrievalProgressData(source=source_name, status=status, result=result_dict)
            ).to_json(),
        )


def _simple_mutate(sequence: str, position: int, new_base: str) -> str:
    if position < 0 or position >= len(sequence):
        return sequence
    return sequence[:position] + new_base + sequence[position + 1 :]


def _mock_pdb(candidate_id: int) -> str:
    chain = "A"
    residue = "ALA"
    lines = [
        "HEADER    HELIX MOCK STRUCTURE",
        "TITLE     MOCK PDB FOR HELIX DEMO",
        f"REMARK    CANDIDATE {candidate_id}",
    ]
    for idx in range(1, 6):
        x = 10.0 + idx
        y = 5.0 + idx * 0.5
        z = 2.0 + idx * 0.25
        lines.append(
            f"ATOM  {idx:5d}  CA  {residue} {chain}{idx:4d}    {x:8.3f}{y:8.3f}{z:8.3f}  1.00 70.00           C"
        )
    lines.append("END")
    return "\n".join(lines)


def create_session_id() -> str:
    return str(uuid4())

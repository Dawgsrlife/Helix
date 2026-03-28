"""Async in-process pipeline orchestrator for generation/edit flows."""

from __future__ import annotations

import asyncio
from uuid import uuid4

from models.domain import Candidate, DesignSpec
from pipeline.evo2_score import score_candidate
from pipeline.intent_parser import parse_intent
from services.evo2 import Evo2Service
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


async def run_generation_pipeline(
    *,
    manager: WebSocketManager,
    service: Evo2Service,
    session_id: str,
    goal: str,
    n_tokens: int = 36,
) -> None:
    spec = await _emit_intent(manager, session_id, goal)
    await _emit_retrieval(manager, session_id, spec)

    candidate_id = 0
    generated = DEFAULT_SEED
    async for token in service.generate(DEFAULT_SEED, n_tokens=n_tokens):
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

    pdb_data = _mock_pdb(candidate_id)
    await manager.send_event(
        session_id,
        StructureReadyEvent(
            data=StructureReadyData(candidate_id=candidate_id, pdb_data=pdb_data, confidence=0.73)
        ).to_json(),
    )

    for chunk in [
        "Candidate preserves core promoter-like motifs.",
        "Predicted expression bias aligns with requested tissue profile.",
    ]:
        await manager.send_event(
            session_id,
            ExplanationChunkEvent(data=ExplanationChunkData(text=chunk)).to_json(),
        )
        await asyncio.sleep(0.03)

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
) -> list[str]:
    spec = await _emit_intent(manager, session_id, message)
    steps = ["intent_parse", "evo2_generation", "evo2_scoring"]

    base = DEFAULT_SEED
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
    target = spec.target_gene or "unknown_target"
    sources = (
        ("ncbi", {"target_gene": target, "variants": []}),
        ("pubmed", {"papers": [{"title": f"{target} regulatory context"}]}),
        ("clinvar", {"pathogenic_variants": []}),
    )
    for source, result in sources:
        await manager.send_event(
            session_id,
            RetrievalProgressEvent(
                data=RetrievalProgressData(source=source, status="complete", result=result)
            ).to_json(),
        )
        await asyncio.sleep(0.03)


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


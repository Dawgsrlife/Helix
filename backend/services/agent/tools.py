"""Agent tool implementations — each tool is a standalone async function.

Tools are registered in TOOL_REGISTRY and dispatched by name from the executor.
"""

from __future__ import annotations

import asyncio
from typing import Any

from models.domain import CandidateScores
from pipeline.evo2_score import rescore_mutation, score_candidate
from services.agent.parsing import BASES, apply_transform, band, objective_score
from services.agent.state import AgentCandidateUpdate, AgentToolCall, ToolExecution
from services.evo2 import Evo2Service
from services.session_store import SessionStore

MAX_VARIANTS_TO_EVAL = 48
MAX_OPTIMIZE_CONCURRENCY = 8
VARIANT_SCORE_TIMEOUT_SECONDS = 6.0


async def tool_explain(
    *,
    service: Evo2Service,
    candidate_id: int,
    sequence: str,
    **_kwargs: Any,
) -> ToolExecution:
    scores, per_position = await score_candidate(service, sequence)
    score_dict = scores.to_dict()
    note = (
        f"Candidate #{candidate_id} is {band(score_dict['combined'])}. "
        f"Functional {score_dict['functional']:.3f}, tissue {score_dict['tissue_specificity']:.3f}, "
        f"off-target {score_dict['off_target']:.3f}, novelty {score_dict['novelty']:.3f}."
    )
    return ToolExecution(
        call=AgentToolCall(tool="score_candidate", status="ok", summary="Scored active candidate."),
        note=note,
        candidate_update=AgentCandidateUpdate(
            candidate_id=candidate_id,
            sequence=sequence,
            scores=score_dict,
            per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
        ),
    )


async def tool_edit_base(
    *,
    service: Evo2Service,
    store: SessionStore,
    session_id: str,
    candidate_id: int,
    sequence: str,
    position: int,
    new_base: str,
    **_kwargs: Any,
) -> ToolExecution:
    new_base = new_base.upper()
    if new_base not in BASES:
        raise ValueError(f"invalid base '{new_base}'")
    if position < 0 or position >= len(sequence):
        raise ValueError(f"position {position} is out of range for sequence length {len(sequence)}")

    updated_scores, delta = await rescore_mutation(
        service, sequence=sequence, position=position, new_base=new_base,
    )
    mutated = sequence[:position] + new_base + sequence[position + 1:]
    await store.set_candidate_sequence(session_id, candidate_id, mutated)
    _, per_position = await score_candidate(service, mutated)

    score_dict = updated_scores.to_dict()
    impact = "benign" if abs(delta) < 0.001 else "moderate" if abs(delta) < 0.005 else "deleterious"
    note = (
        f"Applied edit on candidate #{candidate_id}: base {position}->{new_base}. "
        f"Delta likelihood {delta:.5f} ({impact}). New combined {score_dict['combined']:.3f}."
    )
    return ToolExecution(
        call=AgentToolCall(tool="edit_base", status="ok", summary=f"Mutated position {position} to {new_base}."),
        note=note,
        candidate_update=AgentCandidateUpdate(
            candidate_id=candidate_id,
            sequence=mutated,
            scores=score_dict,
            mutation={
                "position": position,
                "reference_base": sequence[position],
                "new_base": new_base,
                "delta_likelihood": delta,
                "predicted_impact": impact,
            },
            per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
        ),
    )


async def tool_optimize(
    *,
    service: Evo2Service,
    store: SessionStore,
    session_id: str,
    candidate_id: int,
    sequence: str,
    objective: str = "tissue_specificity",
    **_kwargs: Any,
) -> ToolExecution:
    objective = objective.strip().lower() or "tissue_specificity"
    if objective not in {"safety", "tissue_specificity", "functional", "novelty"}:
        objective = "tissue_specificity"

    baseline_scores, _ = await score_candidate(service, sequence)
    baseline = baseline_scores.to_dict()

    variant_specs: list[tuple[int, str]] = []
    for position, current in enumerate(sequence):
        for alt in BASES:
            if alt != current:
                variant_specs.append((position, alt))
    if len(variant_specs) > MAX_VARIANTS_TO_EVAL:
        step = max(1, len(variant_specs) // MAX_VARIANTS_TO_EVAL)
        variant_specs = variant_specs[::step][:MAX_VARIANTS_TO_EVAL]

    semaphore = asyncio.Semaphore(MAX_OPTIMIZE_CONCURRENCY)

    async def _score_variant(pos: int, alt: str) -> tuple[int, str, str, CandidateScores] | None:
        variant = sequence[:pos] + alt + sequence[pos + 1:]
        try:
            async with semaphore:
                scores, _ = await asyncio.wait_for(
                    score_candidate(service, variant),
                    timeout=VARIANT_SCORE_TIMEOUT_SECONDS,
                )
            return pos, alt, variant, scores
        except Exception:
            return None

    scored_rows = await asyncio.gather(*[_score_variant(p, a) for p, a in variant_specs])
    scored = [row for row in scored_rows if row is not None]
    if not scored:
        raise RuntimeError("optimization could not evaluate any variant")

    best_position, best_alt, best_variant, best_scores = max(
        scored, key=lambda row: objective_score(row[3], objective),
    )
    await store.set_candidate_sequence(session_id, candidate_id, best_variant)
    _, per_position = await score_candidate(service, best_variant)

    best = best_scores.to_dict()
    delta = best["combined"] - baseline["combined"]
    note = (
        f"Optimization objective '{objective}': evaluated {len(scored)} variants, "
        f"chose {best_position}->{best_alt}. Combined moved {baseline['combined']:.3f} -> {best['combined']:.3f} ({delta:+.3f})."
    )
    return ToolExecution(
        call=AgentToolCall(tool="optimize_candidate", status="ok", summary=f"Applied {best_position}->{best_alt}."),
        note=note,
        candidate_update=AgentCandidateUpdate(
            candidate_id=candidate_id,
            sequence=best_variant,
            scores=best,
            mutation={
                "position": best_position,
                "reference_base": sequence[best_position],
                "new_base": best_alt,
                "delta_combined": delta,
                "objective": objective,
            },
            per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
        ),
    )


async def tool_compare(
    *,
    service: Evo2Service,
    store: SessionStore,
    session_id: str,
    candidate_id: int,
    **_kwargs: Any,
) -> ToolExecution:
    pool = await store.list_candidate_sequences(session_id)
    if not pool:
        return ToolExecution(
            call=AgentToolCall(tool="compare_candidates", status="failed", summary="No candidates available."),
            note="No candidates are available yet in this session.",
            comparison=[],
        )

    async def _score(cid: int, seq: str) -> tuple[int, dict[str, float]]:
        scores, _ = await score_candidate(service, seq)
        return cid, scores.to_dict()

    scored = await asyncio.gather(*[_score(cid, seq) for cid, seq in sorted(pool.items())])
    ranked = sorted(scored, key=lambda row: row[1]["combined"], reverse=True)
    comparison = [
        {
            "candidate_id": cid,
            "combined": round(score["combined"], 4),
            "functional": round(score["functional"], 4),
            "tissue_specificity": round(score["tissue_specificity"], 4),
            "off_target": round(score["off_target"], 4),
            "novelty": round(score["novelty"], 4),
        }
        for cid, score in ranked[:8]
    ]
    top = comparison[0]
    active = next((row for row in comparison if row["candidate_id"] == candidate_id), None)
    active_suffix = (
        f" Active candidate #{candidate_id} is at {active['combined']:.3f}."
        if active is not None
        else ""
    )
    note = (
        f"Compared {len(scored)} candidates. Best is #{top['candidate_id']} (combined {top['combined']:.3f})."
        f"{active_suffix}"
    )
    return ToolExecution(
        call=AgentToolCall(tool="compare_candidates", status="ok", summary=f"Ranked {len(scored)} candidates."),
        note=note,
        comparison=comparison,
    )


async def tool_transform(
    *,
    service: Evo2Service,
    store: SessionStore,
    session_id: str,
    candidate_id: int,
    sequence: str,
    mode: str = "all_t",
    from_base: str | None = None,
    to_base: str | None = None,
    **_kwargs: Any,
) -> ToolExecution:
    original = sequence.upper()
    transformed = apply_transform(original, mode, from_base=from_base, to_base=to_base)
    changed_bases = sum(1 for before, after in zip(original, transformed, strict=True) if before != after)
    if transformed == original:
        note = f"Requested transform '{mode}' produced no sequence change."
    else:
        note = f"Applied transform '{mode}' to candidate #{candidate_id} ({changed_bases} bases changed)."

    await store.set_candidate_sequence(session_id, candidate_id, transformed)
    scores, per_position = await score_candidate(service, transformed)
    score_dict = scores.to_dict()
    note += f" New combined score {score_dict['combined']:.3f}."

    return ToolExecution(
        call=AgentToolCall(tool="transform_sequence", status="ok", summary=f"Applied {mode}."),
        note=note,
        candidate_update=AgentCandidateUpdate(
            candidate_id=candidate_id,
            sequence=transformed,
            scores=score_dict,
            mutation={"mode": mode},
            per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
        ),
    )


async def tool_restore(
    *,
    service: Evo2Service,
    store: SessionStore,
    session_id: str,
    candidate_id: int,
    sequence: str,
    restore_to: str,
    **_kwargs: Any,
) -> ToolExecution:
    restored = "".join(base for base in restore_to.upper() if base in BASES)
    if not restored:
        raise ValueError("restore_sequence requires a non-empty ATCG sequence")

    await store.set_candidate_sequence(session_id, candidate_id, restored)
    scores, per_position = await score_candidate(service, restored)
    score_dict = scores.to_dict()
    changed = sum(1 for before, after in zip(sequence, restored, strict=False) if before != after)
    note = (
        f"Restored candidate #{candidate_id} from memory snapshot "
        f"({changed} positions changed). New combined score {score_dict['combined']:.3f}."
    )
    return ToolExecution(
        call=AgentToolCall(tool="restore_sequence", status="ok", summary="Restored previous sequence."),
        note=note,
        candidate_update=AgentCandidateUpdate(
            candidate_id=candidate_id,
            sequence=restored,
            scores=score_dict,
            mutation={"mode": "restore_sequence", "changed_positions": changed},
            per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
        ),
    )

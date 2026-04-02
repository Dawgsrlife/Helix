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
MAX_HILL_CLIMB_ROUNDS = 5
VARIANTS_PER_ROUND = 16


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
    rounds: int | None = None,
    **_kwargs: Any,
) -> ToolExecution:
    """Multi-round hill-climbing optimizer.

    Instead of evaluating random single-base variants once, this optimizer:
    1. Samples VARIANTS_PER_ROUND positions, evaluates all 3 alternatives at each.
    2. Picks the best-improving mutation and applies it.
    3. Repeats up to MAX_HILL_CLIMB_ROUNDS times.
    4. Converges early if no round produces improvement.
    """
    objective = objective.strip().lower() or "tissue_specificity"
    if objective not in {"safety", "tissue_specificity", "functional", "novelty"}:
        objective = "tissue_specificity"

    max_rounds = min(rounds or MAX_HILL_CLIMB_ROUNDS, MAX_HILL_CLIMB_ROUNDS)

    baseline_scores, _ = await score_candidate(service, sequence)
    baseline = baseline_scores.to_dict()
    current_sequence = sequence
    current_obj_score = objective_score(baseline_scores, objective)

    mutations_applied: list[dict[str, object]] = []
    total_evaluated = 0

    for round_idx in range(max_rounds):
        # Sample variant positions — spread evenly across the sequence
        all_positions = list(range(len(current_sequence)))
        step = max(1, len(all_positions) // VARIANTS_PER_ROUND)
        sampled_positions = all_positions[::step][:VARIANTS_PER_ROUND]

        # Build variant specs: (position, alt_base)
        variant_specs: list[tuple[int, str]] = []
        for pos in sampled_positions:
            current_base = current_sequence[pos]
            for alt in BASES:
                if alt != current_base:
                    variant_specs.append((pos, alt))

        semaphore = asyncio.Semaphore(MAX_OPTIMIZE_CONCURRENCY)

        async def _score_variant(
            seq: str, pos: int, alt: str,
        ) -> tuple[int, str, str, CandidateScores] | None:
            variant = seq[:pos] + alt + seq[pos + 1:]
            try:
                async with semaphore:
                    scores, _ = await asyncio.wait_for(
                        score_candidate(service, variant),
                        timeout=VARIANT_SCORE_TIMEOUT_SECONDS,
                    )
                return pos, alt, variant, scores
            except Exception:
                return None

        scored_rows = await asyncio.gather(
            *[_score_variant(current_sequence, p, a) for p, a in variant_specs]
        )
        scored = [row for row in scored_rows if row is not None]
        total_evaluated += len(scored)

        if not scored:
            break  # No variants could be scored this round

        best_pos, best_alt, best_variant, best_scores = max(
            scored, key=lambda row: objective_score(row[3], objective),
        )
        round_obj_score = objective_score(best_scores, objective)

        # Only accept if strictly improving
        if round_obj_score <= current_obj_score:
            break  # Converged — no further improvement

        mutations_applied.append({
            "round": round_idx + 1,
            "position": best_pos,
            "ref_base": current_sequence[best_pos],
            "new_base": best_alt,
            "objective_delta": round(round_obj_score - current_obj_score, 5),
        })
        current_sequence = best_variant
        current_obj_score = round_obj_score

    # Re-score the final sequence for per-position data
    final_scores, per_position = await score_candidate(service, current_sequence)
    await store.set_candidate_sequence(session_id, candidate_id, current_sequence)

    final = final_scores.to_dict()
    total_delta = final["combined"] - baseline["combined"]
    rounds_used = len(mutations_applied)

    if rounds_used == 0:
        note = (
            f"Optimization '{objective}': evaluated {total_evaluated} variants across 1 round, "
            f"but found no improvement. Sequence unchanged at combined {baseline['combined']:.3f}."
        )
        summary = "No improving mutation found."
    else:
        note = (
            f"Hill-climbing optimization '{objective}': {rounds_used} round(s), "
            f"{total_evaluated} variants evaluated. "
            f"Combined {baseline['combined']:.3f} → {final['combined']:.3f} ({total_delta:+.3f}). "
            f"Applied {rounds_used} mutation(s)."
        )
        summary = f"Applied {rounds_used} mutation(s) over {rounds_used} round(s)."

    return ToolExecution(
        call=AgentToolCall(tool="optimize_candidate", status="ok", summary=summary),
        note=note,
        candidate_update=AgentCandidateUpdate(
            candidate_id=candidate_id,
            sequence=current_sequence,
            scores=final,
            mutation={
                "mode": "hill_climb",
                "objective": objective,
                "rounds_used": rounds_used,
                "total_evaluated": total_evaluated,
                "mutations": mutations_applied,
                "delta_combined": total_delta,
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


# ---------------------------------------------------------------------------
# Phase 5 tools — wiring existing services into the agentic copilot
# ---------------------------------------------------------------------------


async def tool_codon_optimize(
    *,
    service: Evo2Service,
    store: SessionStore,
    session_id: str,
    candidate_id: int,
    sequence: str,
    organism: str = "homo_sapiens",
    **_kwargs: Any,
) -> ToolExecution:
    """Optimize codon usage for a target organism, preserving amino acids."""
    from services.codon_optimization import optimize_codons

    organism = organism.strip().lower().replace(" ", "_") or "homo_sapiens"
    result = optimize_codons(sequence, organism=organism)
    optimized = result.optimized_sequence

    await store.set_candidate_sequence(session_id, candidate_id, optimized)
    scores, per_position = await score_candidate(service, optimized)
    score_dict = scores.to_dict()

    note = (
        f"Codon-optimized candidate #{candidate_id} for {result.organism}. "
        f"{result.codons_changed}/{result.total_codons} codons changed. "
        f"CAI {result.original_cai:.3f} → {result.optimized_cai:.3f}. "
        f"GC {result.gc_content_before:.1%} → {result.gc_content_after:.1%}. "
        f"New combined score {score_dict['combined']:.3f}."
    )
    return ToolExecution(
        call=AgentToolCall(
            tool="codon_optimize",
            status="ok",
            summary=f"Optimized codons for {result.organism} ({result.codons_changed} changed).",
        ),
        note=note,
        candidate_update=AgentCandidateUpdate(
            candidate_id=candidate_id,
            sequence=optimized,
            scores=score_dict,
            mutation={
                "scope": "transform",
                "mode": "codon_optimize",
                "organism": result.organism,
                "codons_changed": result.codons_changed,
                "total_codons": result.total_codons,
                "cai_before": result.original_cai,
                "cai_after": result.optimized_cai,
            },
            per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
        ),
    )


async def tool_offtarget_scan(
    *,
    service: Evo2Service,
    candidate_id: int,
    sequence: str,
    k: int = 12,
    **_kwargs: Any,
) -> ToolExecution:
    """Run local k-mer off-target scan and return risk summary."""
    from services.offtarget import scan_offtargets

    k = max(8, min(k, 20))
    result = scan_offtargets(sequence, k=k)

    high_risk = [h for h in result.hits if h.risk_level == "high"]
    medium_risk = [h for h in result.hits if h.risk_level == "medium"]

    if high_risk:
        risk_summary = f"{len(high_risk)} high-risk hit(s): " + ", ".join(
            f"{h.region_name} ({h.similarity_score:.2%})" for h in high_risk[:3]
        )
    elif medium_risk:
        risk_summary = f"{len(medium_risk)} medium-risk hit(s) found."
    else:
        risk_summary = "No significant off-target risks detected."

    note = (
        f"Off-target scan for candidate #{candidate_id} ({result.query_length} bp, k={k}): "
        f"{len(result.hits)} hit(s), repeat fraction {result.repeat_fraction:.2%}, "
        f"GC balance risk: {result.gc_balance_risk}. {risk_summary}"
    )

    # Return read-only result — no sequence mutation
    return ToolExecution(
        call=AgentToolCall(
            tool="offtarget_scan",
            status="ok",
            summary=f"{len(result.hits)} off-target hit(s), GC risk: {result.gc_balance_risk}.",
        ),
        note=note,
    )


async def tool_insert_bases(
    *,
    service: Evo2Service,
    store: SessionStore,
    session_id: str,
    candidate_id: int,
    sequence: str,
    position: int,
    bases: str,
    **_kwargs: Any,
) -> ToolExecution:
    """Insert one or more bases at a given position."""
    bases = "".join(b for b in bases.upper() if b in BASES)
    if not bases:
        raise ValueError("insert_bases requires at least one valid base (A, T, C, G)")
    if position < 0 or position > len(sequence):
        raise ValueError(f"position {position} is out of range [0, {len(sequence)}]")

    inserted = sequence[:position] + bases + sequence[position:]
    await store.set_candidate_sequence(session_id, candidate_id, inserted)
    scores, per_position = await score_candidate(service, inserted)
    score_dict = scores.to_dict()

    note = (
        f"Inserted {len(bases)} base(s) '{bases[:20]}{'...' if len(bases) > 20 else ''}' "
        f"at position {position} in candidate #{candidate_id}. "
        f"Length {len(sequence)} → {len(inserted)} bp. "
        f"New combined score {score_dict['combined']:.3f}."
    )
    return ToolExecution(
        call=AgentToolCall(
            tool="insert_bases",
            status="ok",
            summary=f"Inserted {len(bases)} base(s) at position {position}.",
        ),
        note=note,
        candidate_update=AgentCandidateUpdate(
            candidate_id=candidate_id,
            sequence=inserted,
            scores=score_dict,
            mutation={
                "scope": "insert",
                "position": position,
                "inserted_bases": bases,
                "inserted_length": len(bases),
            },
            per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
        ),
    )


async def tool_delete_bases(
    *,
    service: Evo2Service,
    store: SessionStore,
    session_id: str,
    candidate_id: int,
    sequence: str,
    start: int,
    end: int,
    **_kwargs: Any,
) -> ToolExecution:
    """Delete bases in a range [start, end) from the sequence."""
    if start < 0 or end > len(sequence) or start >= end:
        raise ValueError(
            f"invalid range [{start}, {end}) for sequence length {len(sequence)}. "
            f"Must satisfy 0 <= start < end <= {len(sequence)}."
        )

    deleted_bases = sequence[start:end]
    trimmed = sequence[:start] + sequence[end:]
    if not trimmed:
        raise ValueError("cannot delete all bases — sequence would be empty")

    await store.set_candidate_sequence(session_id, candidate_id, trimmed)
    scores, per_position = await score_candidate(service, trimmed)
    score_dict = scores.to_dict()

    note = (
        f"Deleted {end - start} base(s) from positions [{start}, {end}) in candidate #{candidate_id}. "
        f"Length {len(sequence)} → {len(trimmed)} bp. "
        f"New combined score {score_dict['combined']:.3f}."
    )
    return ToolExecution(
        call=AgentToolCall(
            tool="delete_bases",
            status="ok",
            summary=f"Deleted {end - start} base(s) from position {start}.",
        ),
        note=note,
        candidate_update=AgentCandidateUpdate(
            candidate_id=candidate_id,
            sequence=trimmed,
            scores=score_dict,
            mutation={
                "scope": "delete",
                "start": start,
                "end": end,
                "deleted_bases": deleted_bases,
                "deleted_length": end - start,
            },
            per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
        ),
    )


# Common restriction enzymes with their recognition sequences
_RESTRICTION_ENZYMES: dict[str, str] = {
    "EcoRI": "GAATTC",
    "BamHI": "GGATCC",
    "HindIII": "AAGCTT",
    "NotI": "GCGGCCGC",
    "XhoI": "CTCGAG",
    "NdeI": "CATATG",
    "SalI": "GTCGAC",
    "XbaI": "TCTAGA",
    "SpeI": "ACTAGT",
    "PstI": "CTGCAG",
    "KpnI": "GGTACC",
    "SacI": "GAGCTC",
    "NcoI": "CCATGG",
    "BglII": "AGATCT",
    "ClaI": "ATCGAT",
    "EcoRV": "GATATC",
    "SmaI": "CCCGGG",
    "ApaI": "GGGCCC",
    "MluI": "ACGCGT",
    "NheI": "GCTAGC",
}


async def tool_restriction_sites(
    *,
    candidate_id: int,
    sequence: str,
    enzymes: list[str] | None = None,
    **_kwargs: Any,
) -> ToolExecution:
    """Find restriction enzyme cut sites in the sequence."""
    from services.translation import find_motif

    target_enzymes = _RESTRICTION_ENZYMES
    if enzymes:
        # Filter to requested enzymes (case-insensitive match)
        requested = {e.lower(): e for e in enzymes}
        target_enzymes = {
            name: site for name, site in _RESTRICTION_ENZYMES.items()
            if name.lower() in requested
        }
        if not target_enzymes:
            raise ValueError(
                f"No recognized enzymes in {enzymes}. "
                f"Supported: {', '.join(sorted(_RESTRICTION_ENZYMES.keys()))}"
            )

    seq_upper = sequence.upper()
    found: list[dict[str, object]] = []
    for enzyme_name, recognition_site in sorted(target_enzymes.items()):
        positions = find_motif(seq_upper, recognition_site)
        if positions:
            found.append({
                "enzyme": enzyme_name,
                "recognition_site": recognition_site,
                "positions": positions,
                "count": len(positions),
            })

    if found:
        site_summary = ", ".join(
            f"{entry['enzyme']} ({entry['count']}×)" for entry in found[:5]
        )
        rest = f" (+{len(found) - 5} more)" if len(found) > 5 else ""
        summary = f"Found {len(found)} enzyme(s): {site_summary}{rest}"
    else:
        summary = f"No restriction sites found ({len(target_enzymes)} enzymes checked)."

    note = (
        f"Restriction site scan on candidate #{candidate_id} ({len(sequence)} bp): "
        f"{summary}"
    )

    return ToolExecution(
        call=AgentToolCall(
            tool="restriction_sites",
            status="ok",
            summary=summary,
        ),
        note=note,
    )

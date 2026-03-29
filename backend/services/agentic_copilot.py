"""Agentic chat copilot for Helix side panel.

This module provides a deterministic, tool-using copilot that can:
1. Explain the active candidate in plain language
2. Apply explicit base edits (e.g. "change base 42 to G")
3. Run single-step optimization edits (tissue specificity / safety / function)
4. Compare candidates currently available in the session

It intentionally avoids hidden magic so demo behavior is reliable.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass

from models.domain import CandidateScores
from pipeline.evo2_score import rescore_mutation, score_candidate
from services.evo2 import Evo2Service
from services.session_store import SessionStore

BASES = ("A", "T", "C", "G")
EDIT_RE = re.compile(
    r"(?:position|pos|base|bp)\s*(\d+)\D+(?:to|with|as|=)\s*([ATCG])\b",
    flags=re.IGNORECASE,
)


@dataclass(frozen=True)
class AgentToolCall:
    tool: str
    status: str
    summary: str

    def to_dict(self) -> dict[str, str]:
        return {"tool": self.tool, "status": self.status, "summary": self.summary}


@dataclass
class AgentCandidateUpdate:
    candidate_id: int
    sequence: str
    scores: dict[str, float]
    mutation: dict[str, object] | None = None
    per_position_scores: list[dict[str, float | int]] | None = None

    def to_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "candidate_id": self.candidate_id,
            "sequence": self.sequence,
            "scores": self.scores,
        }
        if self.mutation is not None:
            payload["mutation"] = self.mutation
        if self.per_position_scores is not None:
            payload["per_position_scores"] = self.per_position_scores
        return payload


@dataclass
class AgentChatResult:
    assistant_message: str
    tool_calls: list[AgentToolCall]
    candidate_update: AgentCandidateUpdate | None = None
    comparison: list[dict[str, object]] | None = None

    def to_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "assistant_message": self.assistant_message,
            "tool_calls": [tool.to_dict() for tool in self.tool_calls],
        }
        if self.candidate_update is not None:
            payload["candidate_update"] = self.candidate_update.to_dict()
        if self.comparison is not None:
            payload["comparison"] = self.comparison
        return payload


class AgenticCopilot:
    def __init__(self, *, session_store: SessionStore, evo2_service: Evo2Service) -> None:
        self._session_store = session_store
        self._service = evo2_service

    async def chat(self, *, session_id: str, candidate_id: int, message: str) -> AgentChatResult:
        prompt = message.strip()
        if not prompt:
            return AgentChatResult(
                assistant_message="Ask me to edit, compare, or explain a candidate.",
                tool_calls=[AgentToolCall(tool="validate_input", status="ok", summary="Message was empty.")],
            )

        sequence = await self._session_store.require_candidate_sequence(session_id, candidate_id)
        normalized = prompt.lower()

        explicit_edit = _parse_explicit_edit(prompt)
        if explicit_edit is not None:
            return await self._handle_explicit_edit(
                session_id=session_id,
                candidate_id=candidate_id,
                sequence=sequence,
                position=explicit_edit[0],
                new_base=explicit_edit[1],
            )

        if any(token in normalized for token in ("compare", "best candidate", "rank candidates", "which candidate")):
            return await self._handle_compare(session_id=session_id, active_candidate_id=candidate_id)

        if any(token in normalized for token in ("tissue-specific", "tissue specific", "safer", "off-target", "functional", "novel")):
            return await self._handle_optimize(
                session_id=session_id,
                candidate_id=candidate_id,
                sequence=sequence,
                objective=_objective_from_prompt(normalized),
            )

        return await self._handle_explain(candidate_id=candidate_id, sequence=sequence)

    async def _handle_explain(self, *, candidate_id: int, sequence: str) -> AgentChatResult:
        scores, per_position = await score_candidate(self._service, sequence)
        score_dict = scores.to_dict()

        assistant = (
            f"Candidate #{candidate_id} is currently { _band(score_dict['combined']) } overall. "
            f"Functional plausibility is {score_dict['functional']:.3f}, tissue fit is {score_dict['tissue_specificity']:.3f}, "
            f"off-target risk is {score_dict['off_target']:.3f}, and novelty is {score_dict['novelty']:.3f}. "
            "Ask me to mutate a position (for example: 'change base position 42 to G') or optimize for tissue specificity/safety."
        )
        return AgentChatResult(
            assistant_message=assistant,
            tool_calls=[AgentToolCall(tool="score_candidate", status="ok", summary="Scored active candidate.")],
            candidate_update=AgentCandidateUpdate(
                candidate_id=candidate_id,
                sequence=sequence,
                scores=score_dict,
                per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
            ),
        )

    async def _handle_explicit_edit(
        self,
        *,
        session_id: str,
        candidate_id: int,
        sequence: str,
        position: int,
        new_base: str,
    ) -> AgentChatResult:
        if position < 0 or position >= len(sequence):
            return AgentChatResult(
                assistant_message=f"Position {position} is out of range for candidate #{candidate_id} (length {len(sequence)}).",
                tool_calls=[AgentToolCall(tool="edit_base", status="failed", summary="Position out of range.")],
            )

        updated_scores, delta = await rescore_mutation(
            self._service,
            sequence=sequence,
            position=position,
            new_base=new_base,
        )
        mutated = sequence[:position] + new_base + sequence[position + 1 :]
        await self._session_store.set_candidate_sequence(session_id, candidate_id, mutated)
        _, per_position = await score_candidate(self._service, mutated)

        score_dict = updated_scores.to_dict()
        impact = "benign" if abs(delta) < 0.001 else "moderate" if abs(delta) < 0.005 else "deleterious"
        assistant = (
            f"Applied edit on candidate #{candidate_id}: base {position} -> {new_base}. "
            f"Delta likelihood {delta:.5f} ({impact}). New combined score is {score_dict['combined']:.3f}."
        )
        return AgentChatResult(
            assistant_message=assistant,
            tool_calls=[AgentToolCall(tool="edit_base", status="ok", summary=f"Mutated position {position} to {new_base}.")],
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

    async def _handle_optimize(
        self,
        *,
        session_id: str,
        candidate_id: int,
        sequence: str,
        objective: str,
    ) -> AgentChatResult:
        baseline_scores, _ = await score_candidate(self._service, sequence)
        baseline = baseline_scores.to_dict()

        candidates: list[tuple[str, int, str]] = []
        steps = max(1, len(sequence) // 10)
        for position in range(0, len(sequence), steps):
            current = sequence[position]
            for alt in BASES:
                if alt == current:
                    continue
                candidates.append((sequence[:position] + alt + sequence[position + 1 :], position, alt))
            if len(candidates) >= 36:
                break

        async def _score_variant(variant: str, pos: int, alt: str) -> tuple[str, int, str, CandidateScores]:
            scores, _ = await score_candidate(self._service, variant)
            return variant, pos, alt, scores

        scored = await asyncio.gather(*[_score_variant(v, p, b) for v, p, b in candidates])
        best_variant, best_pos, best_alt, best_scores = max(scored, key=lambda x: _objective_score(x[3], objective))
        await self._session_store.set_candidate_sequence(session_id, candidate_id, best_variant)
        _, per_position = await score_candidate(self._service, best_variant)

        best = best_scores.to_dict()
        delta = best["combined"] - baseline["combined"]
        assistant = (
            f"Optimization objective: {objective}. I tested {len(scored)} single-base variants and selected "
            f"position {best_pos} -> {best_alt}. Combined score moved from {baseline['combined']:.3f} to {best['combined']:.3f} "
            f"({delta:+.3f})."
        )
        return AgentChatResult(
            assistant_message=assistant,
            tool_calls=[
                AgentToolCall(tool="search_single_base_variants", status="ok", summary=f"Evaluated {len(scored)} variants."),
                AgentToolCall(tool="apply_variant", status="ok", summary=f"Applied position {best_pos} -> {best_alt}."),
            ],
            candidate_update=AgentCandidateUpdate(
                candidate_id=candidate_id,
                sequence=best_variant,
                scores=best,
                mutation={
                    "position": best_pos,
                    "reference_base": sequence[best_pos],
                    "new_base": best_alt,
                    "delta_combined": delta,
                    "objective": objective,
                },
                per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
            ),
        )

    async def _handle_compare(self, *, session_id: str, active_candidate_id: int) -> AgentChatResult:
        pool = await self._session_store.list_candidate_sequences(session_id)
        if not pool:
            return AgentChatResult(
                assistant_message="No candidates are available yet in this session.",
                tool_calls=[AgentToolCall(tool="list_candidates", status="failed", summary="No candidate sequences found.")],
            )

        async def _score(cid: int, seq: str) -> tuple[int, str, dict[str, float]]:
            scores, _ = await score_candidate(self._service, seq)
            return cid, seq, scores.to_dict()

        scored = await asyncio.gather(*[_score(cid, seq) for cid, seq in sorted(pool.items())])
        ranked = sorted(scored, key=lambda row: row[2]["combined"], reverse=True)
        comparison = [
            {
                "candidate_id": cid,
                "combined": round(score["combined"], 4),
                "functional": round(score["functional"], 4),
                "tissue_specificity": round(score["tissue_specificity"], 4),
                "off_target": round(score["off_target"], 4),
                "novelty": round(score["novelty"], 4),
            }
            for cid, _seq, score in ranked[:5]
        ]
        top = comparison[0]
        active = next((row for row in comparison if row["candidate_id"] == active_candidate_id), None)
        active_text = (
            f" Active candidate #{active_candidate_id} sits at combined {active['combined']:.3f}."
            if active is not None
            else ""
        )

        return AgentChatResult(
            assistant_message=(
                f"Compared {len(scored)} candidates. Best is #{top['candidate_id']} with combined {top['combined']:.3f}. "
                f"Functional {top['functional']:.3f}, tissue {top['tissue_specificity']:.3f}, off-target {top['off_target']:.3f}.{active_text}"
            ),
            tool_calls=[AgentToolCall(tool="compare_candidates", status="ok", summary=f"Ranked {len(scored)} candidates.")],
            comparison=comparison,
        )


def _parse_explicit_edit(message: str) -> tuple[int, str] | None:
    match = EDIT_RE.search(message)
    if match is None:
        return None
    return int(match.group(1)), match.group(2).upper()


def _objective_from_prompt(text: str) -> str:
    if "off-target" in text or "safer" in text or "safety" in text:
        return "safety"
    if "functional" in text or "plausibility" in text:
        return "functional"
    if "novel" in text:
        return "novelty"
    return "tissue_specificity"


def _objective_score(scores: CandidateScores, objective: str) -> float:
    if objective == "safety":
        return (1.0 - scores.off_target) * 0.7 + scores.functional * 0.2 + scores.tissue_specificity * 0.1
    if objective == "functional":
        return scores.functional * 0.7 + scores.tissue_specificity * 0.2 + (1.0 - scores.off_target) * 0.1
    if objective == "novelty":
        return scores.novelty * 0.7 + scores.functional * 0.2 + (1.0 - scores.off_target) * 0.1
    return scores.tissue_specificity * 0.7 + scores.functional * 0.2 + (1.0 - scores.off_target) * 0.1


def _band(value: float) -> str:
    if value >= 0.75:
        return "strong"
    if value >= 0.55:
        return "promising"
    if value >= 0.40:
        return "mixed"
    return "weak"

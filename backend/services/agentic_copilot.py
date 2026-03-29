"""LangGraph-powered agentic copilot for Helix side panel."""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from config import settings
from models.domain import CandidateScores
from pipeline.evo2_score import rescore_mutation, score_candidate
from services.evo2 import Evo2Service
from services.session_store import SessionStore
from services.translation import reverse_complement

BASES = ("A", "T", "C", "G")
MAX_VARIANTS_TO_EVAL = 180
EDIT_RE = re.compile(
    r"(?:position|pos|base|bp)\s*(\d+)\D+(?:to|with|as|=)\s*([ATCG])\b",
    flags=re.IGNORECASE,
)

PLANNER_PROMPT = """You are the planning brain for a genomic IDE assistant.
Return ONLY strict JSON with this exact shape:
{"actions":[{"tool":"<tool_name>","args":{...}}]}

Allowed tools:
1) explain_candidate
args: {}

2) edit_base
args: {"position": <int>, "new_base": "A|T|C|G"}

3) optimize_candidate
args: {"objective": "safety|tissue_specificity|functional|novelty"}

4) compare_candidates
args: {}

5) transform_sequence
args: {"mode": "all_t|all_a|all_c|all_g|reverse_complement|replace_base", "from_base": "A|T|C|G (only for replace_base)", "to_base": "A|T|C|G (only for replace_base)"}

Rules:
- If user asks for global sequence rewrite like "all Ts", use transform_sequence.
- If user asks to replace one base globally (e.g., "change all Gs to Cs"), use mode "replace_base".
- If user asks to compare or rank, include compare_candidates.
- If user asks specific base mutation, include edit_base.
- You may chain multiple actions in order.
- If uncertain, default to explain_candidate.
"""

RESPONDER_PROMPT = """You are Helix's genomic copilot.
Given executed tool traces and computed outcomes, produce a concise,
clear researcher-facing response (2-5 sentences).
Avoid fluff. Mention concrete outcomes and next best action."""


class CopilotState(TypedDict, total=False):
    session_id: str
    candidate_id: int
    message: str
    history: list[dict[str, str]]
    actions: list[dict[str, Any]]
    tool_calls: list[dict[str, str]]
    candidate_update: dict[str, Any] | None
    comparison: list[dict[str, Any]] | None
    execution_notes: list[str]
    assistant_message: str


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
    pdb_data: str | None = None
    confidence: float | None = None
    structure_model: str | None = None
    regulatory_map: dict[str, object] | None = None

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
        if self.pdb_data is not None:
            payload["pdb_data"] = self.pdb_data
        if self.confidence is not None:
            payload["confidence"] = self.confidence
        if self.structure_model is not None:
            payload["structure_model"] = self.structure_model
        if self.regulatory_map is not None:
            payload["regulatory_map"] = self.regulatory_map
        return payload


@dataclass
class AgentChatResult:
    assistant_message: str
    tool_calls: list[AgentToolCall]
    candidate_update: AgentCandidateUpdate | None = None
    comparison: list[dict[str, object]] | None = None


@dataclass
class _ToolExecution:
    call: AgentToolCall
    note: str
    candidate_update: AgentCandidateUpdate | None = None
    comparison: list[dict[str, object]] | None = None


class AgenticCopilot:
    def __init__(self, *, session_store: SessionStore, evo2_service: Evo2Service) -> None:
        self._session_store = session_store
        self._service = evo2_service
        self._planner_llm = self._build_llm(planner=True)
        self._responder_llm = self._build_llm(planner=False)
        self._graph = self._build_graph()

    async def chat(
        self,
        *,
        session_id: str,
        candidate_id: int,
        message: str,
        history: list[dict[str, str]] | None = None,
    ) -> AgentChatResult:
        state: CopilotState = {
            "session_id": session_id,
            "candidate_id": candidate_id,
            "message": message.strip(),
            "history": history or [],
            "actions": [],
            "tool_calls": [],
            "candidate_update": None,
            "comparison": None,
            "execution_notes": [],
            "assistant_message": "",
        }
        final = await self._graph.ainvoke(state)

        candidate_update = None
        if final.get("candidate_update"):
            update_payload = final["candidate_update"]
            candidate_update = AgentCandidateUpdate(
                candidate_id=int(update_payload["candidate_id"]),
                sequence=str(update_payload["sequence"]),
                scores=dict(update_payload["scores"]),
                mutation=update_payload.get("mutation"),
                per_position_scores=update_payload.get("per_position_scores"),
                pdb_data=update_payload.get("pdb_data"),
                confidence=update_payload.get("confidence"),
                structure_model=update_payload.get("structure_model"),
                regulatory_map=update_payload.get("regulatory_map"),
            )

        return AgentChatResult(
            assistant_message=str(final.get("assistant_message") or "I could not produce a response."),
            tool_calls=[AgentToolCall(**entry) for entry in final.get("tool_calls", [])],
            candidate_update=candidate_update,
            comparison=final.get("comparison"),
        )

    def _build_graph(self):
        graph = StateGraph(CopilotState)
        graph.add_node("plan", self._plan_node)
        graph.add_node("execute", self._execute_node)
        graph.add_node("respond", self._respond_node)
        graph.add_edge(START, "plan")
        graph.add_edge("plan", "execute")
        graph.add_edge("execute", "respond")
        graph.add_edge("respond", END)
        return graph.compile()

    def _build_llm(self, *, planner: bool):
        # Prefer Gemini when key is available.
        if settings.gemini_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI

                return ChatGoogleGenerativeAI(
                    model="gemini-2.5-flash",
                    temperature=0.1 if planner else 0.2,
                    google_api_key=settings.gemini_api_key,
                )
            except Exception:
                return None
        if settings.openai_api_key:
            try:
                from langchain_openai import ChatOpenAI

                return ChatOpenAI(
                    model="gpt-4o-mini",
                    temperature=0.1 if planner else 0.2,
                    api_key=settings.openai_api_key,
                )
            except Exception:
                return None
        return None

    async def _plan_node(self, state: CopilotState) -> dict[str, object]:
        message = state.get("message", "")
        if not message:
            return {"actions": [{"tool": "explain_candidate", "args": {}}]}

        # Deterministic intent parsing is the primary path for edit-like commands.
        # This keeps side-panel behavior reliable for demo-critical prompts
        # (e.g., "make all Ts", explicit base edits, ranking requests).
        deterministic = self._fallback_plan(message)
        if not _is_default_explain_plan(deterministic):
            return {"actions": deterministic}

        llm_actions = await self._plan_actions_with_llm(message)
        if llm_actions:
            return {"actions": llm_actions}
        return {"actions": deterministic}

    async def _execute_node(self, state: CopilotState) -> dict[str, object]:
        session_id = str(state["session_id"])
        candidate_id = int(state["candidate_id"])
        sequence = await self._session_store.require_candidate_sequence(session_id, candidate_id)
        actions = list(state.get("actions", []))
        if not actions:
            actions = [{"tool": "explain_candidate", "args": {}}]

        tool_calls: list[dict[str, str]] = []
        execution_notes: list[str] = []
        candidate_update: AgentCandidateUpdate | None = None
        comparison: list[dict[str, object]] | None = None

        for action in actions:
            tool = str(action.get("tool", "")).strip()
            args = action.get("args") or {}
            try:
                if tool == "edit_base":
                    result = await self._tool_edit_base(
                        session_id=session_id,
                        candidate_id=candidate_id,
                        sequence=sequence,
                        position=int(args.get("position")),
                        new_base=str(args.get("new_base", "")).upper(),
                    )
                elif tool == "optimize_candidate":
                    result = await self._tool_optimize(
                        session_id=session_id,
                        candidate_id=candidate_id,
                        sequence=sequence,
                        objective=str(args.get("objective", "tissue_specificity")),
                    )
                elif tool == "compare_candidates":
                    result = await self._tool_compare(session_id=session_id, active_candidate_id=candidate_id)
                elif tool == "transform_sequence":
                    result = await self._tool_transform(
                        session_id=session_id,
                        candidate_id=candidate_id,
                        sequence=sequence,
                        mode=str(args.get("mode", "all_t")),
                        from_base=str(args.get("from_base", "")).upper() or None,
                        to_base=str(args.get("to_base", "")).upper() or None,
                    )
                else:
                    result = await self._tool_explain(candidate_id=candidate_id, sequence=sequence)
            except Exception as exc:
                result = _ToolExecution(
                    call=AgentToolCall(tool=tool or "unknown_tool", status="failed", summary=str(exc)),
                    note=f"Tool {tool or 'unknown_tool'} failed: {exc}",
                )

            tool_calls.append(result.call.to_dict())
            execution_notes.append(result.note)
            if result.candidate_update is not None:
                candidate_update = _merge_candidate_updates(candidate_update, result.candidate_update)
                sequence = result.candidate_update.sequence
            if result.comparison is not None:
                comparison = result.comparison

        return {
            "tool_calls": tool_calls,
            "execution_notes": execution_notes,
            "candidate_update": candidate_update.to_dict() if candidate_update else None,
            "comparison": comparison,
        }

    async def _respond_node(self, state: CopilotState) -> dict[str, str]:
        notes = state.get("execution_notes", [])
        if not notes:
            return {"assistant_message": "No actions were executed."}

        # LLM summary when available; deterministic fallback otherwise.
        if self._responder_llm is not None:
            try:
                payload = json.dumps(
                    {
                        "user_message": state.get("message", ""),
                        "tool_calls": state.get("tool_calls", []),
                        "execution_notes": notes,
                    },
                    indent=2,
                )
                messages = [
                    SystemMessage(content=RESPONDER_PROMPT),
                    HumanMessage(content=payload),
                ]
                response = await asyncio.wait_for(self._responder_llm.ainvoke(messages), timeout=8.0)
                text = _message_to_text(response.content).strip()
                if text:
                    return {"assistant_message": text}
            except Exception:
                pass

        return {"assistant_message": notes[-1]}

    async def _tool_explain(self, *, candidate_id: int, sequence: str) -> _ToolExecution:
        scores, per_position = await score_candidate(self._service, sequence)
        score_dict = scores.to_dict()
        note = (
            f"Candidate #{candidate_id} is {_band(score_dict['combined'])}. "
            f"Functional {score_dict['functional']:.3f}, tissue {score_dict['tissue_specificity']:.3f}, "
            f"off-target {score_dict['off_target']:.3f}, novelty {score_dict['novelty']:.3f}."
        )
        return _ToolExecution(
            call=AgentToolCall(tool="score_candidate", status="ok", summary="Scored active candidate."),
            note=note,
            candidate_update=AgentCandidateUpdate(
                candidate_id=candidate_id,
                sequence=sequence,
                scores=score_dict,
                per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
            ),
        )

    async def _tool_edit_base(
        self,
        *,
        session_id: str,
        candidate_id: int,
        sequence: str,
        position: int,
        new_base: str,
    ) -> _ToolExecution:
        if new_base not in BASES:
            raise ValueError(f"invalid base '{new_base}'")
        if position < 0 or position >= len(sequence):
            raise ValueError(f"position {position} is out of range for sequence length {len(sequence)}")

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
        note = (
            f"Applied edit on candidate #{candidate_id}: base {position}->{new_base}. "
            f"Delta likelihood {delta:.5f} ({impact}). New combined {score_dict['combined']:.3f}."
        )
        return _ToolExecution(
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

    async def _tool_optimize(
        self,
        *,
        session_id: str,
        candidate_id: int,
        sequence: str,
        objective: str,
    ) -> _ToolExecution:
        objective = objective.strip().lower() or "tissue_specificity"
        if objective not in {"safety", "tissue_specificity", "functional", "novelty"}:
            objective = "tissue_specificity"

        baseline_scores, _ = await score_candidate(self._service, sequence)
        baseline = baseline_scores.to_dict()

        variant_specs: list[tuple[int, str]] = []
        for position, current in enumerate(sequence):
            for alt in BASES:
                if alt != current:
                    variant_specs.append((position, alt))
        if len(variant_specs) > MAX_VARIANTS_TO_EVAL:
            step = max(1, len(variant_specs) // MAX_VARIANTS_TO_EVAL)
            variant_specs = variant_specs[::step][:MAX_VARIANTS_TO_EVAL]

        async def _score_variant(position: int, alt: str) -> tuple[int, str, str, CandidateScores]:
            variant = sequence[:position] + alt + sequence[position + 1 :]
            scores, _ = await score_candidate(self._service, variant)
            return position, alt, variant, scores

        scored = await asyncio.gather(*[_score_variant(position, alt) for position, alt in variant_specs])
        best_position, best_alt, best_variant, best_scores = max(
            scored,
            key=lambda row: _objective_score(row[3], objective),
        )
        await self._session_store.set_candidate_sequence(session_id, candidate_id, best_variant)
        _, per_position = await score_candidate(self._service, best_variant)

        best = best_scores.to_dict()
        delta = best["combined"] - baseline["combined"]
        note = (
            f"Optimization objective '{objective}': evaluated {len(scored)} variants, "
            f"chose {best_position}->{best_alt}. Combined moved {baseline['combined']:.3f} -> {best['combined']:.3f} ({delta:+.3f})."
        )
        return _ToolExecution(
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

    async def _tool_compare(self, *, session_id: str, active_candidate_id: int) -> _ToolExecution:
        pool = await self._session_store.list_candidate_sequences(session_id)
        if not pool:
            return _ToolExecution(
                call=AgentToolCall(tool="compare_candidates", status="failed", summary="No candidates available."),
                note="No candidates are available yet in this session.",
                comparison=[],
            )

        async def _score(cid: int, seq: str) -> tuple[int, dict[str, float]]:
            scores, _ = await score_candidate(self._service, seq)
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
        active = next((row for row in comparison if row["candidate_id"] == active_candidate_id), None)
        active_suffix = (
            f" Active candidate #{active_candidate_id} is at {active['combined']:.3f}."
            if active is not None
            else ""
        )
        note = (
            f"Compared {len(scored)} candidates. Best is #{top['candidate_id']} (combined {top['combined']:.3f})."
            f"{active_suffix}"
        )
        return _ToolExecution(
            call=AgentToolCall(tool="compare_candidates", status="ok", summary=f"Ranked {len(scored)} candidates."),
            note=note,
            comparison=comparison,
        )

    async def _tool_transform(
        self,
        *,
        session_id: str,
        candidate_id: int,
        sequence: str,
        mode: str,
        from_base: str | None = None,
        to_base: str | None = None,
    ) -> _ToolExecution:
        transformed = _apply_transform(sequence, mode, from_base=from_base, to_base=to_base)
        if transformed == sequence:
            note = f"Requested transform '{mode}' produced no sequence change."
        else:
            note = f"Applied transform '{mode}' to candidate #{candidate_id}."

        await self._session_store.set_candidate_sequence(session_id, candidate_id, transformed)
        scores, per_position = await score_candidate(self._service, transformed)
        score_dict = scores.to_dict()
        note += f" New combined score {score_dict['combined']:.3f}."

        return _ToolExecution(
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

    async def _plan_actions_with_llm(self, message: str) -> list[dict[str, Any]] | None:
        if self._planner_llm is None:
            return None
        try:
            messages = [
                SystemMessage(content=PLANNER_PROMPT),
                HumanMessage(content=message),
            ]
            response = await asyncio.wait_for(self._planner_llm.ainvoke(messages), timeout=8.0)
            text = _message_to_text(response.content)
            payload = _extract_json_object(text)
            actions = payload.get("actions", [])
            if not isinstance(actions, list):
                return None
            normalized = [_normalize_action(entry) for entry in actions]
            normalized = [entry for entry in normalized if entry is not None]
            return normalized or None
        except Exception:
            return None

    def _fallback_plan(self, message: str) -> list[dict[str, Any]]:
        text = message.lower()
        actions: list[dict[str, Any]] = []

        explicit = _parse_explicit_edit(message)
        if explicit is not None:
            actions.append({"tool": "edit_base", "args": {"position": explicit[0], "new_base": explicit[1]}})
            if "explain" in text or "impact" in text:
                actions.append({"tool": "explain_candidate", "args": {}})

        replacement = _parse_base_replacement(text)
        if replacement is not None:
            from_base, to_base = replacement
            actions.append(
                {
                    "tool": "transform_sequence",
                    "args": {"mode": "replace_base", "from_base": from_base, "to_base": to_base},
                }
            )
            if "explain" in text or "impact" in text:
                actions.append({"tool": "explain_candidate", "args": {}})
        else:
            transform_mode = _parse_transform_mode(text)
            if transform_mode is not None:
                actions.append({"tool": "transform_sequence", "args": {"mode": transform_mode}})

        if any(token in text for token in ("compare", "rank", "best candidate", "which candidate")):
            actions.append({"tool": "compare_candidates", "args": {}})

        if any(token in text for token in ("tissue-specific", "tissue specific", "safer", "off-target", "novel", "functional")):
            actions.append({"tool": "optimize_candidate", "args": {"objective": _objective_from_prompt(text)}})

        if not actions:
            actions.append({"tool": "explain_candidate", "args": {}})
        return actions


def _extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        snippet = text[start : end + 1]
        try:
            parsed = json.loads(snippet)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _normalize_action(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    tool = str(entry.get("tool", "")).strip()
    args = entry.get("args", {})
    if not isinstance(args, dict):
        args = {}
    if tool not in {"explain_candidate", "edit_base", "optimize_candidate", "compare_candidates", "transform_sequence"}:
        return None
    return {"tool": tool, "args": args}


def _merge_candidate_updates(
    previous: AgentCandidateUpdate | None, current: AgentCandidateUpdate
) -> AgentCandidateUpdate:
    if previous is None:
        return current
    if current.mutation is None and previous.mutation is not None:
        current.mutation = previous.mutation
    if current.pdb_data is None and previous.pdb_data is not None:
        current.pdb_data = previous.pdb_data
    if current.confidence is None and previous.confidence is not None:
        current.confidence = previous.confidence
    if current.structure_model is None and previous.structure_model is not None:
        current.structure_model = previous.structure_model
    if current.regulatory_map is None and previous.regulatory_map is not None:
        current.regulatory_map = previous.regulatory_map
    return current


def _is_default_explain_plan(actions: list[dict[str, Any]]) -> bool:
    if len(actions) != 1:
        return False
    action = actions[0]
    return action.get("tool") == "explain_candidate"


def _message_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, str):
                chunks.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    chunks.append(text)
        return "\n".join(chunks)
    return str(content)


def _parse_explicit_edit(message: str) -> tuple[int, str] | None:
    match = EDIT_RE.search(message)
    if match is None:
        return None
    return int(match.group(1)), match.group(2).upper()


def _parse_transform_mode(text: str) -> str | None:
    if "reverse complement" in text:
        return "reverse_complement"
    if re.search(r"\ball\s+t(?:s|'s)?\b", text) or "all thymine" in text:
        return "all_t"
    if re.search(r"\ball\s+a(?:s|'s)?\b", text) or "all adenine" in text:
        return "all_a"
    if re.search(r"\ball\s+c(?:s|'s)?\b", text) or "all cytosine" in text:
        return "all_c"
    if re.search(r"\ball\s+g(?:s|'s)?\b", text) or "all guanine" in text:
        return "all_g"
    return None


def _parse_base_replacement(text: str) -> tuple[str, str] | None:
    match = re.search(
        r"(?:change|replace|convert|swap|turn)\s+all\s+([atcg])(?:'s|s)?\s+(?:to|with|into)\s+([atcg])(?:'s|s)?",
        text,
        flags=re.IGNORECASE,
    )
    if match is None:
        return None
    from_base = match.group(1).upper()
    to_base = match.group(2).upper()
    if from_base == to_base:
        return None
    return from_base, to_base


def _apply_transform(
    sequence: str,
    mode: str,
    *,
    from_base: str | None = None,
    to_base: str | None = None,
) -> str:
    mode = mode.strip().lower()
    if mode == "all_t":
        return "T" * len(sequence)
    if mode == "all_a":
        return "A" * len(sequence)
    if mode == "all_c":
        return "C" * len(sequence)
    if mode == "all_g":
        return "G" * len(sequence)
    if mode == "reverse_complement":
        return reverse_complement(sequence)
    if mode == "replace_base":
        if from_base not in BASES or to_base not in BASES:
            return sequence
        if from_base == to_base:
            return sequence
        return sequence.replace(from_base, to_base)
    return sequence


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

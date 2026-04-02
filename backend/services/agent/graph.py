"""LangGraph state machine for the agentic copilot.

Graph: plan → execute → reflect →(continue|finish)→ respond
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
from typing import Any

from langgraph.graph import END, START, StateGraph

from config import settings
from pipeline.evo2_score import score_candidate
from services.agent.memory import AgentMemory
from services.agent.parsing import BASES, message_to_text
from services.agent.planner import (
    deterministic_plan,
    is_default_explain_plan,
    plan_with_claude,
    plan_with_gemini,
    plan_with_json_llm,
)
from services.agent.state import (
    MAX_AGENT_ITERATIONS,
    AgentCandidateUpdate,
    AgentChatResult,
    AgentToolCall,
    CopilotState,
    ToolExecution,
    merge_candidate_updates,
    trim_history,
)
from services.agent import tools as agent_tools
from services.evo2 import Evo2MockService, Evo2Service
from services.session_store import SessionStore

logger = logging.getLogger(__name__)

RESPONDER_PROMPT = """You are Helix's genomic copilot.
Given executed tool traces and computed outcomes, produce a concise,
clear researcher-facing response (2-5 sentences).
Avoid fluff. Mention concrete outcomes and next best action."""


class AgenticCopilot:
    """Facade for the agentic copilot — manages graph, memory, and tool dispatch."""

    def __init__(self, *, session_store: SessionStore, evo2_service: Evo2Service) -> None:
        self._session_store = session_store
        self._service = evo2_service
        self._memory = AgentMemory(session_store)
        self._responder_llm = self._build_responder_llm()
        self._graph = self._build_graph()

    async def clear_session_memory(self, *, session_id: str) -> None:
        await self._memory.clear_session(session_id)

    async def chat(
        self,
        *,
        session_id: str,
        candidate_id: int,
        message: str,
        history: list[dict[str, str]] | None = None,
    ) -> AgentChatResult:
        memory_entries = await self._memory.snapshot(session_id, candidate_id)
        candidate_snapshot = await self._candidate_snapshot(session_id=session_id, candidate_id=candidate_id)
        state: CopilotState = {
            "session_id": session_id,
            "candidate_id": candidate_id,
            "message": message.strip(),
            "history": trim_history(history or []),
            "actions": [],
            "tool_calls": [],
            "candidate_update": None,
            "comparison": None,
            "execution_notes": [],
            "assistant_message": "",
            "iteration": 0,
            "should_continue": True,
            "reasoning_steps": [],
            "memory_entries": memory_entries,
            "candidate_snapshot": candidate_snapshot,
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

        result = AgentChatResult(
            assistant_message=str(final.get("assistant_message") or "I could not produce a response."),
            tool_calls=[AgentToolCall(**entry) for entry in final.get("tool_calls", [])],
            candidate_update=candidate_update,
            comparison=final.get("comparison"),
            iterations=int(final.get("iteration", 1)),
            reasoning_steps=final.get("reasoning_steps"),
        )
        await self._memory.remember_turn(
            session_id=session_id,
            candidate_id=candidate_id,
            user_message=message.strip(),
            candidate_update=candidate_update,
            tool_calls=[call.to_dict() for call in result.tool_calls],
            assistant_message=result.assistant_message,
        )
        return result

    # -------------------------------------------------------------------------
    # Graph construction
    # -------------------------------------------------------------------------

    def _build_graph(self):
        graph = StateGraph(CopilotState)
        graph.add_node("plan", self._plan_node)
        graph.add_node("execute", self._execute_node)
        graph.add_node("reflect", self._reflect_node)
        graph.add_node("respond", self._respond_node)
        graph.add_edge(START, "plan")
        graph.add_edge("plan", "execute")
        graph.add_edge("execute", "reflect")
        graph.add_conditional_edges(
            "reflect",
            self._should_continue,
            {"continue": "plan", "finish": "respond"},
        )
        graph.add_edge("respond", END)
        return graph.compile()

    @staticmethod
    def _should_continue(state: CopilotState) -> str:
        if state.get("should_continue") and state.get("iteration", 0) < MAX_AGENT_ITERATIONS:
            return "continue"
        return "finish"

    # -------------------------------------------------------------------------
    # Graph nodes
    # -------------------------------------------------------------------------

    async def _plan_node(self, state: CopilotState) -> dict[str, object]:
        iteration = state.get("iteration", 0)
        reasoning = list(state.get("reasoning_steps", []))
        message = state.get("message", "")
        history = state.get("history", [])
        memory_entries = state.get("memory_entries", [])
        candidate_snapshot = state.get("candidate_snapshot", {})

        if not message:
            reasoning.append(f"[iter {iteration}] No message provided, defaulting to explain_candidate")
            return {
                "actions": [{"tool": "explain_candidate", "args": {}}],
                "iteration": iteration,
                "reasoning_steps": reasoning,
            }

        reasoning.append(f"[iter {iteration}] Planning actions for: {message[:80]}...")

        # 1. Deterministic fast path — reliable for demo-critical commands
        det_plan = deterministic_plan(message, memory_entries=memory_entries)
        if not is_default_explain_plan(det_plan):
            tool_names = [a["tool"] for a in det_plan]
            reasoning.append(f"[iter {iteration}] Deterministic plan: {', '.join(tool_names)}")
            return {"actions": det_plan, "reasoning_steps": reasoning}

        # 2. Gemini function calling — primary LLM
        gemini_actions = await plan_with_gemini(
            message, history=history, memory_entries=memory_entries, candidate_snapshot=candidate_snapshot,
        )
        if gemini_actions:
            tool_names = [a["tool"] for a in gemini_actions]
            reasoning.append(f"[iter {iteration}] Gemini function-calling plan: {', '.join(tool_names)}")
            return {"actions": gemini_actions, "reasoning_steps": reasoning}

        # 3. Claude native tool_use — fallback LLM
        claude_actions = await plan_with_claude(
            message, history=history, memory_entries=memory_entries, candidate_snapshot=candidate_snapshot,
        )
        if claude_actions:
            tool_names = [a["tool"] for a in claude_actions]
            reasoning.append(f"[iter {iteration}] Claude tool_use plan: {', '.join(tool_names)}")
            return {"actions": claude_actions, "reasoning_steps": reasoning}

        # 4. JSON-mode LLM fallback (Gemini JSON or OpenAI)
        json_actions = await plan_with_json_llm(
            message, history=history, memory_entries=memory_entries, candidate_snapshot=candidate_snapshot,
        )
        if json_actions:
            tool_names = [a["tool"] for a in json_actions]
            reasoning.append(f"[iter {iteration}] LLM JSON plan: {', '.join(tool_names)}")
            return {"actions": json_actions, "reasoning_steps": reasoning}

        reasoning.append(f"[iter {iteration}] Fallback plan: explain_candidate")
        return {"actions": det_plan, "reasoning_steps": reasoning}

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
            tool_name = str(action.get("tool", "")).strip()
            args = action.get("args") or {}

            result = await self._dispatch_tool(
                tool_name, args, session_id=session_id, candidate_id=candidate_id, sequence=sequence,
            )

            tool_calls.append(result.call.to_dict())
            execution_notes.append(result.note)
            if result.candidate_update is not None:
                candidate_update = merge_candidate_updates(candidate_update, result.candidate_update)
                sequence = result.candidate_update.sequence
            if result.comparison is not None:
                comparison = result.comparison

            # On failure, fall back to scoring so the response always has useful data
            if result.call.status == "failed":
                fallback = await self._fallback_score(candidate_id, sequence)
                tool_calls.append(fallback.call.to_dict())
                execution_notes.append(f"Recovered via fallback scoring after {tool_name} failure. {fallback.note}")
                if fallback.candidate_update is not None:
                    candidate_update = merge_candidate_updates(candidate_update, fallback.candidate_update)
                    sequence = fallback.candidate_update.sequence

        return {
            "tool_calls": tool_calls,
            "execution_notes": execution_notes,
            "candidate_update": candidate_update.to_dict() if candidate_update else None,
            "comparison": comparison,
        }

    async def _reflect_node(self, state: CopilotState) -> dict[str, object]:
        iteration = state.get("iteration", 0) + 1
        reasoning = list(state.get("reasoning_steps", []))
        tool_calls = state.get("tool_calls", [])

        failed_tools = [tc for tc in tool_calls if tc.get("status") == "failed"]
        has_failures = len(failed_tools) > 0

        update = state.get("candidate_update")
        combined_score = None
        if update and isinstance(update, dict):
            combined_score = update.get("scores", {}).get("combined")

        should_continue = False

        if has_failures and iteration < MAX_AGENT_ITERATIONS:
            reasoning.append(
                f"[reflect iter {iteration}] {len(failed_tools)} tool(s) failed. Re-planning to recover."
            )
            should_continue = True
        elif combined_score is not None and combined_score < 0.4 and iteration < MAX_AGENT_ITERATIONS:
            reasoning.append(
                f"[reflect iter {iteration}] Combined score {combined_score:.3f} is weak (<0.4). "
                f"Attempting optimization pass."
            )
            should_continue = True
            message = state.get("message", "")
            if "optimize" not in message.lower() and "safer" not in message.lower():
                return {
                    "iteration": iteration,
                    "should_continue": should_continue,
                    "reasoning_steps": reasoning,
                    "message": f"{message} (auto-optimize: improve combined score)",
                }
        else:
            reasoning.append(
                f"[reflect iter {iteration}] "
                + (f"Score {combined_score:.3f}. " if combined_score is not None else "")
                + f"Satisfied after {iteration} iteration(s)."
            )

        return {
            "iteration": iteration,
            "should_continue": should_continue,
            "reasoning_steps": reasoning,
        }

    async def _respond_node(self, state: CopilotState) -> dict[str, str]:
        notes = state.get("execution_notes", [])
        reasoning = state.get("reasoning_steps", [])
        iteration = state.get("iteration", 1)

        if not notes:
            return {"assistant_message": "No actions were executed."}

        # Try LLM response generation
        if self._responder_llm is not None:
            try:
                from langchain_core.messages import HumanMessage, SystemMessage

                payload = json.dumps({
                    "user_message": state.get("message", ""),
                    "conversation_history": state.get("history", []),
                    "agent_memory": state.get("memory_entries", []),
                    "candidate_snapshot": state.get("candidate_snapshot", {}),
                    "tool_calls": state.get("tool_calls", []),
                    "execution_notes": notes,
                    "iterations": iteration,
                    "reasoning_trace": reasoning,
                }, indent=2)
                messages = [
                    SystemMessage(content=RESPONDER_PROMPT),
                    HumanMessage(content=payload),
                ]
                response = await asyncio.wait_for(self._responder_llm.ainvoke(messages), timeout=8.0)
                text = message_to_text(response.content).strip()
                if text:
                    iteration_note = f" [{iteration} iteration(s)]" if iteration > 1 else ""
                    return {"assistant_message": f"{text}{iteration_note}"}
            except Exception:
                pass

        # Deterministic fallback
        base_msg = notes[-1]
        if iteration > 1:
            base_msg = f"{base_msg} (completed in {iteration} agent iterations)"
        return {"assistant_message": base_msg}

    # -------------------------------------------------------------------------
    # Tool dispatch
    # -------------------------------------------------------------------------

    async def _dispatch_tool(
        self,
        tool_name: str,
        args: dict[str, Any],
        *,
        session_id: str,
        candidate_id: int,
        sequence: str,
    ) -> ToolExecution:
        """Dispatch a tool by name. Returns ToolExecution (never raises)."""
        common = {
            "service": self._service,
            "store": self._session_store,
            "session_id": session_id,
            "candidate_id": candidate_id,
            "sequence": sequence,
        }

        try:
            if tool_name == "edit_base":
                return await agent_tools.tool_edit_base(
                    **common,
                    position=int(args.get("position")),
                    new_base=str(args.get("new_base", "")).upper(),
                )
            elif tool_name == "optimize_candidate":
                rounds_raw = args.get("rounds")
                return await agent_tools.tool_optimize(
                    **common,
                    objective=str(args.get("objective", "tissue_specificity")),
                    rounds=int(rounds_raw) if rounds_raw is not None else None,
                )
            elif tool_name == "compare_candidates":
                return await agent_tools.tool_compare(**common)
            elif tool_name == "transform_sequence":
                return await agent_tools.tool_transform(
                    **common,
                    mode=str(args.get("mode", "all_t")),
                    from_base=str(args.get("from_base", "")).upper() or None,
                    to_base=str(args.get("to_base", "")).upper() or None,
                )
            elif tool_name == "restore_sequence":
                return await agent_tools.tool_restore(
                    **common,
                    restore_to=str(args.get("sequence", "")).upper(),
                )
            elif tool_name == "codon_optimize":
                return await agent_tools.tool_codon_optimize(
                    **common,
                    organism=str(args.get("organism", "homo_sapiens")),
                )
            elif tool_name == "offtarget_scan":
                return await agent_tools.tool_offtarget_scan(
                    service=self._service,
                    candidate_id=candidate_id,
                    sequence=sequence,
                    k=int(args.get("k", 12)),
                )
            elif tool_name == "insert_bases":
                return await agent_tools.tool_insert_bases(
                    **common,
                    position=int(args.get("position", 0)),
                    bases=str(args.get("bases", "")),
                )
            elif tool_name == "delete_bases":
                return await agent_tools.tool_delete_bases(
                    **common,
                    start=int(args.get("start", 0)),
                    end=int(args.get("end", 0)),
                )
            elif tool_name == "restriction_sites":
                return await agent_tools.tool_restriction_sites(
                    candidate_id=candidate_id,
                    sequence=sequence,
                    enzymes=args.get("enzymes"),
                )
            else:
                return await agent_tools.tool_explain(**common)
        except Exception as exc:
            return ToolExecution(
                call=AgentToolCall(tool=tool_name or "unknown_tool", status="failed", summary=str(exc)),
                note=f"Tool {tool_name or 'unknown_tool'} failed: {exc}",
            )

    async def _fallback_score(self, candidate_id: int, sequence: str) -> ToolExecution:
        """Score the candidate as a recovery path when a tool fails."""
        try:
            return await agent_tools.tool_explain(
                service=self._service, candidate_id=candidate_id, sequence=sequence,
            )
        except Exception:
            scores, per_position = await score_candidate(Evo2MockService(), sequence)
            score_dict = scores.to_dict()
            return ToolExecution(
                call=AgentToolCall(
                    tool="score_candidate", status="ok",
                    summary="Scored active candidate with mock fallback.",
                ),
                note=(
                    f"Recovered with fallback scoring. Candidate #{candidate_id} combined "
                    f"{score_dict['combined']:.3f}, functional {score_dict['functional']:.3f}, "
                    f"tissue {score_dict['tissue_specificity']:.3f}, off-target {score_dict['off_target']:.3f}."
                ),
                candidate_update=AgentCandidateUpdate(
                    candidate_id=candidate_id,
                    sequence=sequence,
                    scores=score_dict,
                    per_position_scores=[{"position": x.position, "score": x.score} for x in per_position],
                ),
            )

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    async def _candidate_snapshot(self, *, session_id: str, candidate_id: int) -> dict[str, Any]:
        try:
            sequence = await self._session_store.require_candidate_sequence(session_id, candidate_id)
        except Exception:
            return {}
        gc = (sequence.count("G") + sequence.count("C")) / max(len(sequence), 1)
        return {
            "length_bp": len(sequence),
            "gc_ratio": round(gc, 4),
            "preview": sequence[:80],
        }

    def _build_responder_llm(self):
        if settings.gemini_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                return ChatGoogleGenerativeAI(
                    model="gemini-2.5-flash", temperature=0.2, google_api_key=settings.gemini_api_key,
                )
            except Exception:
                pass
        if settings.openai_api_key:
            try:
                from langchain_openai import ChatOpenAI
                return ChatOpenAI(model="gpt-4o-mini", temperature=0.2, api_key=settings.openai_api_key)
            except Exception:
                pass
        return None

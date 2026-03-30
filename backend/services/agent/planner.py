"""Agent planner — routes user messages to tool invocations.

Three strategies tried in order:
1. Deterministic regex-based fast path (reliable for demo-critical commands)
2. Gemini function-calling / JSON generation (primary LLM)
3. Claude native tool_use (fallback LLM)
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from config import settings
from services.agent.memory import derive_repeat_action, derive_undo_action
from services.agent.parsing import (
    extract_json_object,
    message_to_text,
    normalize_action,
    objective_from_prompt,
    parse_base_replacement,
    parse_explicit_edit,
    parse_transform_mode,
)

logger = logging.getLogger(__name__)

# Tool definitions for Claude's native tool_use API.
CLAUDE_TOOL_DEFINITIONS = [
    {
        "name": "explain_candidate",
        "description": "Score and explain the active candidate sequence. Use when the user asks to explain, score, analyze, or evaluate.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "edit_base",
        "description": "Mutate a single base pair at a specific position. Use when the user asks to change, edit, or mutate a specific position.",
        "input_schema": {
            "type": "object",
            "properties": {
                "position": {"type": "integer", "description": "0-indexed position in the sequence"},
                "new_base": {"type": "string", "enum": ["A", "T", "C", "G"], "description": "The new base to set"},
            },
            "required": ["position", "new_base"],
        },
    },
    {
        "name": "optimize_candidate",
        "description": "Find the single-base mutation that best improves the candidate for a given objective. Use when the user asks to optimize, improve, or make safer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "objective": {
                    "type": "string",
                    "enum": ["safety", "tissue_specificity", "functional", "novelty"],
                    "description": "Optimization objective",
                },
            },
            "required": ["objective"],
        },
    },
    {
        "name": "compare_candidates",
        "description": "Rank all candidates in the session by combined score. Use when the user asks to compare, rank, or find the best candidate.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "transform_sequence",
        "description": "Apply a bulk transform to the entire sequence. Use for global changes like 'make all Ts', 'reverse complement', or 'change all Gs to Cs'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": ["all_t", "all_a", "all_c", "all_g", "reverse_complement", "replace_base"],
                },
                "from_base": {"type": "string", "enum": ["A", "T", "C", "G"], "description": "Only for replace_base mode"},
                "to_base": {"type": "string", "enum": ["A", "T", "C", "G"], "description": "Only for replace_base mode"},
            },
            "required": ["mode"],
        },
    },
    {
        "name": "restore_sequence",
        "description": "Undo by restoring a previous sequence from conversation memory. Use when the user asks to undo, revert, or roll back.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sequence": {"type": "string", "description": "The previous sequence to restore (from memory)"},
            },
            "required": ["sequence"],
        },
    },
]

# Prompt for JSON-based planners (Gemini/OpenAI)
PLANNER_JSON_PROMPT = """You are the planning brain for a genomic IDE assistant.
Return ONLY strict JSON with this exact shape:
{"actions":[{"tool":"<tool_name>","args":{...}}]}

Allowed tools:
1) explain_candidate — args: {}
2) edit_base — args: {"position": <int>, "new_base": "A|T|C|G"}
3) optimize_candidate — args: {"objective": "safety|tissue_specificity|functional|novelty"}
4) compare_candidates — args: {}
5) transform_sequence — args: {"mode": "all_t|all_a|all_c|all_g|reverse_complement|replace_base", "from_base": "A|T|C|G (only for replace_base)", "to_base": "A|T|C|G (only for replace_base)"}
6) restore_sequence — args: {"sequence": "<ATCG...>"}

Rules:
- If user asks for global sequence rewrite like "all Ts", use transform_sequence.
- If user asks to replace one base globally (e.g., "change all Gs to Cs"), use mode "replace_base".
- If user asks to undo/revert, use restore_sequence with the most recent previous sequence from memory.
- If user asks to compare or rank, include compare_candidates.
- If user asks specific base mutation, include edit_base.
- You may chain multiple actions in order.
- If uncertain, default to explain_candidate.
"""

CLAUDE_SYSTEM_PROMPT = """You are the planning brain for Helix, a genomic design IDE.
The user is a researcher interacting with a DNA sequence candidate.
Choose the right tools to fulfill their request. You may call multiple tools in order.
If uncertain, use explain_candidate to score the current sequence."""

GEMINI_SYSTEM_PROMPT = """You are the planning brain for Helix, a genomic design IDE.
The user is a researcher interacting with a DNA sequence candidate.
Call the right functions to fulfill their request. You may call multiple functions in order.
If uncertain, call explain_candidate to score the current sequence."""

GEMINI_FUNCTION_DECLARATIONS = [
    {
        "name": "explain_candidate",
        "description": "Score and explain the active candidate sequence. Use when the user asks to explain, score, analyze, or evaluate.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "edit_base",
        "description": "Mutate a single base pair at a specific position. Use when the user asks to change, edit, or mutate a specific position.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "position": {"type": "INTEGER", "description": "0-indexed position in the sequence"},
                "new_base": {"type": "STRING", "enum": ["A", "T", "C", "G"], "description": "The new base to set"},
            },
            "required": ["position", "new_base"],
        },
    },
    {
        "name": "optimize_candidate",
        "description": "Find the single-base mutation that best improves the candidate for a given objective. Use when the user asks to optimize, improve, or make safer.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "objective": {
                    "type": "STRING",
                    "enum": ["safety", "tissue_specificity", "functional", "novelty"],
                    "description": "Optimization objective",
                },
            },
            "required": ["objective"],
        },
    },
    {
        "name": "compare_candidates",
        "description": "Rank all candidates in the session by combined score. Use when the user asks to compare, rank, or find the best candidate.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "transform_sequence",
        "description": "Apply a bulk transform to the entire sequence. Use for global changes like 'make all Ts', 'reverse complement', or 'change all Gs to Cs'.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "mode": {
                    "type": "STRING",
                    "enum": ["all_t", "all_a", "all_c", "all_g", "reverse_complement", "replace_base"],
                },
                "from_base": {"type": "STRING", "enum": ["A", "T", "C", "G"], "description": "Only for replace_base mode"},
                "to_base": {"type": "STRING", "enum": ["A", "T", "C", "G"], "description": "Only for replace_base mode"},
            },
            "required": ["mode"],
        },
    },
    {
        "name": "restore_sequence",
        "description": "Undo by restoring a previous sequence from conversation memory. Use when the user asks to undo, revert, or roll back.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "sequence": {"type": "STRING", "description": "The previous sequence to restore (from memory)"},
            },
            "required": ["sequence"],
        },
    },
]


def deterministic_plan(
    message: str,
    *,
    memory_entries: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Fast-path deterministic tool selection via regex and keyword matching.

    Returns a concrete plan for unambiguous commands, or the default
    [explain_candidate] plan if nothing matched (caller checks this to
    decide whether to escalate to LLM).
    """
    text = message.lower()
    actions: list[dict[str, Any]] = []
    memory_entries = memory_entries or []

    # Undo / revert
    if any(token in text for token in ("undo", "revert", "roll back", "rollback")):
        undo_action = derive_undo_action(memory_entries)
        if undo_action is not None:
            actions.append(undo_action)
            if "explain" in text or "impact" in text:
                actions.append({"tool": "explain_candidate", "args": {}})
            return actions

    # Repeat last action
    if ("again" in text or "same change" in text or "do that" in text) and not actions:
        repeat_action = derive_repeat_action(memory_entries)
        if repeat_action is not None:
            actions.append(repeat_action)
            if "explain" in text or "impact" in text:
                actions.append({"tool": "explain_candidate", "args": {}})
            return actions

    # Explicit base edit (e.g., "position 5 to G")
    explicit = parse_explicit_edit(message)
    if explicit is not None:
        actions.append({"tool": "edit_base", "args": {"position": explicit[0], "new_base": explicit[1]}})
        if "explain" in text or "impact" in text:
            actions.append({"tool": "explain_candidate", "args": {}})

    # Base replacement (e.g., "change all Gs to Cs")
    replacement = parse_base_replacement(text)
    if replacement is not None:
        from_base, to_base = replacement
        actions.append({
            "tool": "transform_sequence",
            "args": {"mode": "replace_base", "from_base": from_base, "to_base": to_base},
        })
        if "explain" in text or "impact" in text:
            actions.append({"tool": "explain_candidate", "args": {}})
    else:
        transform_mode = parse_transform_mode(text)
        if transform_mode is not None:
            actions.append({"tool": "transform_sequence", "args": {"mode": transform_mode}})

    # Compare / rank
    if any(token in text for token in ("compare", "rank", "best candidate", "which candidate")):
        actions.append({"tool": "compare_candidates", "args": {}})

    # Optimize
    if any(token in text for token in ("tissue-specific", "tissue specific", "safer", "off-target", "novel", "functional")):
        actions.append({"tool": "optimize_candidate", "args": {"objective": objective_from_prompt(text)}})

    if not actions:
        actions.append({"tool": "explain_candidate", "args": {}})
    return actions


def is_default_explain_plan(actions: list[dict[str, Any]]) -> bool:
    return len(actions) == 1 and actions[0].get("tool") == "explain_candidate"


async def plan_with_gemini(
    message: str,
    *,
    history: list[dict[str, str]] | None = None,
    memory_entries: list[dict[str, Any]] | None = None,
    candidate_snapshot: dict[str, Any] | None = None,
) -> list[dict[str, Any]] | None:
    """Use Gemini's native function calling for structured planning (primary LLM)."""
    if not settings.gemini_api_key:
        return None

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        user_content = _build_planning_context(message, history, memory_entries, candidate_snapshot)

        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=user_content,
                config=types.GenerateContentConfig(
                    system_instruction=GEMINI_SYSTEM_PROMPT,
                    tools=[types.Tool(function_declarations=GEMINI_FUNCTION_DECLARATIONS)],
                    temperature=0.1,
                ),
            ),
            timeout=8.0,
        )

        actions: list[dict[str, Any]] = []
        for part in response.candidates[0].content.parts:
            if part.function_call is not None:
                fc = part.function_call
                action = normalize_action({"tool": fc.name, "args": dict(fc.args) if fc.args else {}})
                if action is not None:
                    actions.append(action)

        return actions or None

    except Exception:
        logger.debug("Gemini function-calling planning failed", exc_info=True)
        return None


async def plan_with_claude(
    message: str,
    *,
    history: list[dict[str, str]] | None = None,
    memory_entries: list[dict[str, Any]] | None = None,
    candidate_snapshot: dict[str, Any] | None = None,
) -> list[dict[str, Any]] | None:
    """Use Claude's native tool_use for structured planning (fallback LLM)."""
    if not settings.anthropic_api_key:
        return None

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        user_content = _build_planning_context(message, history, memory_entries, candidate_snapshot)

        response = await asyncio.wait_for(
            client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=CLAUDE_SYSTEM_PROMPT,
                tools=CLAUDE_TOOL_DEFINITIONS,
                messages=[{"role": "user", "content": user_content}],
            ),
            timeout=8.0,
        )

        actions: list[dict[str, Any]] = []
        for block in response.content:
            if block.type == "tool_use":
                action = normalize_action({"tool": block.name, "args": block.input})
                if action is not None:
                    actions.append(action)

        return actions or None

    except Exception:
        logger.debug("Claude tool_use planning failed", exc_info=True)
        return None


async def plan_with_json_llm(
    message: str,
    *,
    history: list[dict[str, str]] | None = None,
    memory_entries: list[dict[str, Any]] | None = None,
    candidate_snapshot: dict[str, Any] | None = None,
) -> list[dict[str, Any]] | None:
    """Fallback: use Gemini or OpenAI with JSON prompt for planning."""
    llm = _build_json_llm()
    if llm is None:
        return None

    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        payload = json.dumps({
            "user_message": message,
            "conversation_history": history or [],
            "agent_memory": memory_entries or [],
            "candidate_snapshot": candidate_snapshot or {},
        }, indent=2)

        messages = [
            SystemMessage(content=PLANNER_JSON_PROMPT),
            HumanMessage(content=payload),
        ]
        response = await asyncio.wait_for(llm.ainvoke(messages), timeout=8.0)
        text = message_to_text(response.content)
        parsed = extract_json_object(text)
        actions = parsed.get("actions", [])
        if not isinstance(actions, list):
            return None
        normalized = [normalize_action(entry) for entry in actions]
        normalized = [entry for entry in normalized if entry is not None]
        return normalized or None
    except Exception:
        logger.debug("JSON LLM planning failed", exc_info=True)
        return None


def _build_planning_context(
    message: str,
    history: list[dict[str, str]] | None,
    memory_entries: list[dict[str, Any]] | None,
    candidate_snapshot: dict[str, Any] | None,
) -> str:
    """Build a rich context string for LLM planning."""
    parts: list[str] = []

    if candidate_snapshot:
        parts.append(f"Current candidate: {candidate_snapshot.get('length_bp', '?')} bp, "
                     f"GC ratio {candidate_snapshot.get('gc_ratio', '?')}, "
                     f"preview: {candidate_snapshot.get('preview', '?')}")

    if memory_entries:
        recent = memory_entries[-3:]
        parts.append("Recent conversation:")
        for entry in recent:
            user_msg = entry.get("user_message", "")
            tools_used = [tc.get("tool", "?") for tc in entry.get("tool_calls", [])]
            parts.append(f"  User: {user_msg[:80]} → Tools: {', '.join(tools_used)}")

    parts.append(f"\nUser request: {message}")
    return "\n".join(parts)


def _build_json_llm():
    """Build a LangChain LLM for JSON-based planning (Gemini or OpenAI)."""
    if settings.gemini_api_key:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(
                model="gemini-2.5-flash",
                temperature=0.1,
                google_api_key=settings.gemini_api_key,
            )
        except Exception:
            pass
    if settings.openai_api_key:
        try:
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(model="gpt-4o-mini", temperature=0.1, api_key=settings.openai_api_key)
        except Exception:
            pass
    return None

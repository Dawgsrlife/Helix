"""Agent conversation memory — Redis-backed for persistence across restarts."""

from __future__ import annotations

import json
import logging
from typing import Any

from services.agent.state import AgentCandidateUpdate
from services.session_store import SessionStore

logger = logging.getLogger(__name__)

MAX_MEMORY_TURNS = 32
MEMORY_KEY_PREFIX = "helix:agent:memory"
BASES = ("A", "T", "C", "G")


class AgentMemory:
    """Persistent conversation memory for the agentic copilot.

    Stores per-(session, candidate) turn history in Redis via the session store.
    Falls back to in-process dict if Redis is unavailable.
    """

    def __init__(self, session_store: SessionStore) -> None:
        self._store = session_store
        self._fallback: dict[str, list[dict[str, Any]]] = {}

    def _key(self, session_id: str, candidate_id: int) -> str:
        return f"{MEMORY_KEY_PREFIX}:{session_id}:{candidate_id}"

    async def snapshot(self, session_id: str, candidate_id: int) -> list[dict[str, Any]]:
        """Return the current memory entries for a (session, candidate) pair."""
        key = self._key(session_id, candidate_id)
        try:
            raw = await self._store.get_raw(key)
            if raw is not None:
                entries = json.loads(raw)
                if isinstance(entries, list):
                    return entries
        except Exception:
            logger.debug("Redis memory read failed, using fallback", exc_info=True)
        return list(self._fallback.get(key, []))

    async def remember_turn(
        self,
        *,
        session_id: str,
        candidate_id: int,
        user_message: str,
        candidate_update: AgentCandidateUpdate | None,
        tool_calls: list[dict[str, str]],
        assistant_message: str,
    ) -> None:
        """Persist a conversation turn."""
        updates: list[dict[str, Any]] = []
        if candidate_update is not None:
            updates.append({
                "sequence": candidate_update.sequence,
                "scores": candidate_update.scores,
                "mutation": candidate_update.mutation,
            })

        record: dict[str, Any] = {
            "user_message": user_message,
            "tool_calls": tool_calls,
            "assistant_message": assistant_message,
            "candidate_updates": updates,
        }

        key = self._key(session_id, candidate_id)
        entries = await self.snapshot(session_id, candidate_id)
        entries.append(record)
        if len(entries) > MAX_MEMORY_TURNS:
            entries = entries[-MAX_MEMORY_TURNS:]

        try:
            await self._store.set_raw(key, json.dumps(entries))
        except Exception:
            logger.debug("Redis memory write failed, using fallback", exc_info=True)
            self._fallback[key] = entries

    async def clear_session(self, session_id: str) -> None:
        """Remove all memory entries for a session."""
        # Clear fallback entries
        keys_to_remove = [k for k in self._fallback if k.startswith(f"{MEMORY_KEY_PREFIX}:{session_id}:")]
        for k in keys_to_remove:
            del self._fallback[k]
        # Clear Redis entries (best-effort)
        try:
            await self._store.delete_pattern(f"{MEMORY_KEY_PREFIX}:{session_id}:*")
        except Exception:
            logger.debug("Redis memory clear failed", exc_info=True)


def derive_undo_action(memory_entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Walk memory backward to find a previous sequence snapshot for undo."""
    if not memory_entries:
        return None
    for idx in range(len(memory_entries) - 1, -1, -1):
        entry = memory_entries[idx]
        updates = entry.get("candidate_updates")
        if not isinstance(updates, list) or not updates:
            continue
        current_seq = updates[-1].get("sequence")
        if not isinstance(current_seq, str):
            continue
        for prev_idx in range(idx - 1, -1, -1):
            prev_updates = memory_entries[prev_idx].get("candidate_updates")
            if not isinstance(prev_updates, list) or not prev_updates:
                continue
            previous_seq = prev_updates[-1].get("sequence")
            if isinstance(previous_seq, str) and previous_seq and previous_seq != current_seq:
                return {"tool": "restore_sequence", "args": {"sequence": previous_seq}}
    return None


def derive_repeat_action(memory_entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Find the last mutation in memory and replay it."""
    for entry in reversed(memory_entries):
        updates = entry.get("candidate_updates")
        if not isinstance(updates, list) or not updates:
            continue
        mutation = updates[-1].get("mutation")
        if not isinstance(mutation, dict):
            continue
        position = mutation.get("position")
        new_base = mutation.get("new_base")
        if isinstance(position, int) and isinstance(new_base, str) and new_base in BASES:
            return {"tool": "edit_base", "args": {"position": position, "new_base": new_base}}
    return None

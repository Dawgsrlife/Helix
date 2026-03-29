"""In-memory session state for pipeline and edit lifecycle."""

from __future__ import annotations


class SessionNotFoundError(KeyError):
    def __init__(self, session_id: str) -> None:
        super().__init__(f"session not found: {session_id}")
        self.session_id = session_id


class CandidateNotFoundError(KeyError):
    def __init__(self, session_id: str, candidate_id: int) -> None:
        super().__init__(f"candidate {candidate_id} not found in session {session_id}")
        self.session_id = session_id
        self.candidate_id = candidate_id


class SessionStore:
    """Tracks pending goals and per-session candidate sequences."""

    def __init__(self, default_seed: str) -> None:
        self._default_seed = default_seed
        self._pending_goals: dict[str, str] = {}
        self._candidates: dict[str, dict[int, str]] = {}

    def initialize_session(self, session_id: str) -> None:
        self.set_candidate_sequence(session_id, 0, self._default_seed)

    def set_pending_goal(self, session_id: str, goal: str) -> None:
        self._pending_goals[session_id] = goal

    def pop_pending_goal(self, session_id: str) -> str | None:
        return self._pending_goals.pop(session_id, None)

    def seed_for_session(self, session_id: str) -> str:
        return self._candidates.get(session_id, {}).get(0, self._default_seed)

    def set_candidate_sequence(self, session_id: str, candidate_id: int, sequence: str) -> None:
        self._candidates.setdefault(session_id, {})[candidate_id] = sequence

    def require_candidate_sequence(self, session_id: str, candidate_id: int) -> str:
        candidates = self._candidates.get(session_id)
        if candidates is None:
            raise SessionNotFoundError(session_id)

        sequence = candidates.get(candidate_id)
        if sequence is None:
            raise CandidateNotFoundError(session_id, candidate_id)
        return sequence


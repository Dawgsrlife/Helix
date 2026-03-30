"""Agent state types — CopilotState, tool call results, candidate updates."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from typing_extensions import TypedDict

MAX_AGENT_ITERATIONS = 3
MAX_HISTORY_TURNS = 64


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
    iteration: int
    should_continue: bool
    reasoning_steps: list[str]
    memory_entries: list[dict[str, Any]]
    candidate_snapshot: dict[str, Any]


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
    iterations: int = 1
    reasoning_steps: list[str] | None = None


@dataclass
class ToolExecution:
    """Result of a single tool invocation."""
    call: AgentToolCall
    note: str
    candidate_update: AgentCandidateUpdate | None = None
    comparison: list[dict[str, object]] | None = None


def trim_history(history: list[dict[str, str]]) -> list[dict[str, str]]:
    if len(history) <= MAX_HISTORY_TURNS:
        return history
    return history[-MAX_HISTORY_TURNS:]


def merge_candidate_updates(
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

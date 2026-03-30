"""Backward compatibility shim — imports from services.agent."""

from services.agent import (  # noqa: F401
    AgentCandidateUpdate,
    AgentChatResult,
    AgentToolCall,
    AgenticCopilot,
)

__all__ = [
    "AgenticCopilot",
    "AgentCandidateUpdate",
    "AgentChatResult",
    "AgentToolCall",
]

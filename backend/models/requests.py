"""Pydantic request models for all API endpoints."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


VALID_BASES = frozenset("ATCGN")


def _validate_sequence(seq: str) -> str:
    seq = seq.upper().strip()
    if not seq:
        raise ValueError("Sequence must not be empty")
    bad = set(seq) - VALID_BASES
    if bad:
        raise ValueError(f"Invalid nucleotides: {bad}")
    return seq


def _validate_base(base: str) -> str:
    base = base.upper().strip()
    if base not in VALID_BASES:
        raise ValueError(f"Invalid base: {base}")
    return base


MAX_SEQUENCE_LENGTH = 100_000

class DesignRequest(BaseModel):
    goal: str
    session_id: str | None = None
    user_id: str | None = None
    num_candidates: int = Field(10, ge=1, le=10, description="Number of candidates to generate (1–10)")
    run_profile: Literal["demo", "live"] = "demo"
    truth_mode: Literal["demo_fallback", "real_only"] = "demo_fallback"
    target_length: int | None = Field(
        None,
        ge=100,
        le=MAX_SEQUENCE_LENGTH,
        description="Target sequence length in base pairs (100–100,000). "
        "If omitted, chosen automatically based on design type and run profile.",
    )


class AnalyzeRequest(BaseModel):
    sequence: str

    @field_validator("sequence")
    @classmethod
    def validate_sequence(cls, v: str) -> str:
        return _validate_sequence(v)


class BaseEditRequest(BaseModel):
    session_id: str
    candidate_id: int
    position: int
    new_base: str

    @field_validator("new_base")
    @classmethod
    def validate_new_base(cls, v: str) -> str:
        return _validate_base(v)


class FollowupEditRequest(BaseModel):
    session_id: str
    message: str
    candidate_id: int | None = None


class AgentChatRequest(BaseModel):
    session_id: str
    candidate_id: int = 0
    message: str
    history: list[dict[str, str]] = Field(default_factory=list)
    sequence: str | None = None  # Optional: bootstrap a session on the fly


class MutationRequest(BaseModel):
    sequence: str
    position: int
    alternate_base: str

    @field_validator("sequence")
    @classmethod
    def validate_sequence(cls, v: str) -> str:
        return _validate_sequence(v)

    @field_validator("alternate_base")
    @classmethod
    def validate_alt_base(cls, v: str) -> str:
        return _validate_base(v)


class StructureRequest(BaseModel):
    sequence: str
    region_start: int
    region_end: int

    @field_validator("sequence")
    @classmethod
    def validate_sequence(cls, v: str) -> str:
        return _validate_sequence(v)

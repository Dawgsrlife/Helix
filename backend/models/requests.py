"""Pydantic request models for all API endpoints."""

from pydantic import BaseModel, field_validator


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


class DesignRequest(BaseModel):
    goal: str
    session_id: str | None = None


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

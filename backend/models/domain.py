"""Core domain types — source of truth for the backend.

Frontend types in /types mirror these. API responses in responses.py
serialize from these. Components never see raw model tensors.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pydantic import BaseModel


class AnnotationType(str, Enum):
    EXON = "exon"
    INTRON = "intron"
    ORF = "orf"
    PROPHAGE = "prophage"
    TRNA = "trna"
    RRNA = "rrna"
    INTERGENIC = "intergenic"
    UNKNOWN = "unknown"


class Impact(str, Enum):
    BENIGN = "benign"
    MODERATE = "moderate"
    DELETERIOUS = "deleterious"

    @staticmethod
    def from_delta(delta: float) -> Impact:
        """Classify mutation impact from delta log-likelihood.

        Thresholds from Evo2 paper: |delta| < 0.001 benign,
        0.001-0.005 moderate, > 0.005 deleterious.
        """
        abs_delta = abs(delta)
        if abs_delta < 0.001:
            return Impact.BENIGN
        if abs_delta < 0.005:
            return Impact.MODERATE
        return Impact.DELETERIOUS


@dataclass(frozen=True)
class LikelihoodScore:
    position: int
    score: float  # per-position log-likelihood under Evo2


@dataclass(frozen=True)
class MutationScore:
    position: int
    reference_base: str
    alternate_base: str
    delta_likelihood: float
    predicted_impact: Impact


@dataclass(frozen=True)
class SequenceRegion:
    start: int  # 0-indexed inclusive
    end: int  # exclusive
    type: AnnotationType
    label: str = ""
    score: float = 0.0


@dataclass(frozen=True)
class CandidateScores:
    """Four-dimensional scoring from the Evo2 scoring pipeline."""

    functional: float  # 0-1, sequence plausibility
    tissue_specificity: float  # 0-1, match to requested expression pattern
    off_target: float  # 0-1, risk of unintended effects (lower = better)
    novelty: float  # 0-1, distance from known sequences

    @property
    def combined(self) -> float:
        """Weighted combination for ranking. Higher is better."""
        return (
            0.40 * self.functional
            + 0.25 * self.tissue_specificity
            + 0.20 * (1.0 - self.off_target)  # invert so lower risk = higher score
            + 0.15 * self.novelty
        )


@dataclass
class Candidate:
    id: int
    sequence: str
    scores: CandidateScores | None = None
    per_position_scores: list[LikelihoodScore] = field(default_factory=list)
    regions: list[SequenceRegion] = field(default_factory=list)
    pdb_data: str | None = None
    plddt_score: float | None = None


@dataclass(frozen=True)
class ForwardResult:
    """Result from an Evo2 forward pass."""

    logits: list[float]  # per-position log-likelihoods
    sequence_score: float  # mean log-likelihood across positions
    embeddings: list[list[float]] | None = None

class TissueSpec(BaseModel):
    high_expression: list[str] = []
    low_expression: list[str] = []


class DesignSpec(BaseModel):
    design_type: str
    target_gene: str | None = None
    organism: str | None = None
    tissue_specificity: TissueSpec | None = None
    therapeutic_context: str | None = None
    constraints: list[str] = []

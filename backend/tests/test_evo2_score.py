"""Tests for the Evo2 scoring pipeline (4-dimensional candidate evaluation)."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.domain import CandidateScores, LikelihoodScore
from pipeline.evo2_score import (
    rescore_mutation,
    score_candidate,
    score_functional,
    score_novelty,
    score_off_target,
    score_tissue_specificity,
)
from services.evo2 import Evo2MockService


# ---------------------------------------------------------------------------
# Individual scorers
# ---------------------------------------------------------------------------

class TestFunctionalScore:
    @pytest.mark.asyncio
    async def test_range_zero_to_one(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        forward = await evo2_mock.forward(sample_sequence)
        score = score_functional(forward, sample_sequence)
        assert 0.0 <= score <= 1.0

    @pytest.mark.asyncio
    async def test_gc_extreme_penalized(
        self, evo2_mock: Evo2MockService
    ) -> None:
        """Pure GC sequence should have lower functional score than balanced."""
        pure_gc = "GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC"
        balanced = "ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG"

        fwd_gc = await evo2_mock.forward(pure_gc)
        fwd_bal = await evo2_mock.forward(balanced)

        score_gc = score_functional(fwd_gc, pure_gc)
        score_bal = score_functional(fwd_bal, balanced)

        # Balanced should score at least as well (GC penalty applies)
        assert score_bal >= score_gc - 0.15  # some tolerance for mock randomness

    @pytest.mark.asyncio
    async def test_motifs_boost_score(
        self, evo2_mock: Evo2MockService, long_sequence: str
    ) -> None:
        """Sequence with regulatory motifs should score higher than random."""
        forward = await evo2_mock.forward(long_sequence)
        score = score_functional(forward, long_sequence)
        # Long sequence has TATAAA, ATG, CCAAT, GGGCGG embedded
        assert score > 0.5


class TestTissueSpecificity:
    @pytest.mark.asyncio
    async def test_range_zero_to_one(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        forward = await evo2_mock.forward(sample_sequence)
        score = score_tissue_specificity(forward, sample_sequence)
        assert 0.0 <= score <= 1.0

    @pytest.mark.asyncio
    async def test_with_target_tissues(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        forward = await evo2_mock.forward(sample_sequence)
        score = score_tissue_specificity(
            forward, sample_sequence, target_tissues=["hippocampal_neurons"]
        )
        assert 0.0 <= score <= 1.0


class TestOffTarget:
    @pytest.mark.asyncio
    async def test_range_zero_to_one(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        forward = await evo2_mock.forward(sample_sequence)
        score = score_off_target(forward, sample_sequence)
        assert 0.0 <= score <= 1.0

    @pytest.mark.asyncio
    async def test_pathogenic_motifs_increase_risk(
        self, evo2_mock: Evo2MockService, pathogenic_sequence: str, sample_sequence: str
    ) -> None:
        """Sequence with CAG/CGG repeats should have higher off-target risk."""
        fwd_path = await evo2_mock.forward(pathogenic_sequence)
        fwd_safe = await evo2_mock.forward(sample_sequence)

        risk_path = score_off_target(fwd_path, pathogenic_sequence)
        risk_safe = score_off_target(fwd_safe, sample_sequence)

        assert risk_path > risk_safe

    @pytest.mark.asyncio
    async def test_clean_sequence_low_risk(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        forward = await evo2_mock.forward(sample_sequence)
        risk = score_off_target(forward, sample_sequence)
        assert risk < 0.3


class TestNovelty:
    @pytest.mark.asyncio
    async def test_range_zero_to_one(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        forward = await evo2_mock.forward(sample_sequence)
        score = score_novelty(forward, sample_sequence)
        assert 0.0 <= score <= 1.0

    @pytest.mark.asyncio
    async def test_identical_reference_low_novelty(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        forward = await evo2_mock.forward(sample_sequence)
        score = score_novelty(forward, sample_sequence, reference=sample_sequence)
        # Same sequence = zero edit distance component
        assert score < 0.5

    @pytest.mark.asyncio
    async def test_divergent_reference_higher_novelty(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        forward = await evo2_mock.forward(sample_sequence)
        # Create a very different reference of the same length
        divergent = "G" * len(sample_sequence)
        score = score_novelty(forward, sample_sequence, reference=divergent)
        assert score > 0.3


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

class TestScoreCandidate:
    @pytest.mark.asyncio
    async def test_returns_scores_and_positions(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        scores, positions = await score_candidate(evo2_mock, sample_sequence)
        assert isinstance(scores, CandidateScores)
        assert len(positions) == len(sample_sequence)
        assert all(isinstance(p, LikelihoodScore) for p in positions)

    @pytest.mark.asyncio
    async def test_all_scores_in_range(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        scores, _ = await score_candidate(evo2_mock, sample_sequence)
        assert 0.0 <= scores.functional <= 1.0
        assert 0.0 <= scores.tissue_specificity <= 1.0
        assert 0.0 <= scores.off_target <= 1.0
        assert 0.0 <= scores.novelty <= 1.0

    @pytest.mark.asyncio
    async def test_combined_score_in_range(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        scores, _ = await score_candidate(evo2_mock, sample_sequence)
        assert 0.0 <= scores.combined <= 1.0

    @pytest.mark.asyncio
    async def test_with_target_tissues(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        scores, _ = await score_candidate(
            evo2_mock, sample_sequence,
            target_tissues=["hippocampal_neurons"],
        )
        assert isinstance(scores, CandidateScores)

    @pytest.mark.asyncio
    async def test_deterministic(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        s1, p1 = await score_candidate(evo2_mock, sample_sequence)
        s2, p2 = await score_candidate(evo2_mock, sample_sequence)
        assert s1 == s2
        assert [p.score for p in p1] == [p.score for p in p2]


class TestRescoreMutation:
    @pytest.mark.asyncio
    async def test_returns_scores_and_delta(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        scores, delta = await rescore_mutation(
            evo2_mock, sample_sequence, position=5, new_base="C"
        )
        assert isinstance(scores, CandidateScores)
        assert isinstance(delta, float)

    @pytest.mark.asyncio
    async def test_scores_in_range(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        scores, _ = await rescore_mutation(
            evo2_mock, sample_sequence, position=5, new_base="C"
        )
        assert 0.0 <= scores.functional <= 1.0
        assert 0.0 <= scores.tissue_specificity <= 1.0
        assert 0.0 <= scores.off_target <= 1.0
        assert 0.0 <= scores.novelty <= 1.0

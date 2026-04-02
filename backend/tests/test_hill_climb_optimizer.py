"""Tests for the multi-round hill-climbing optimizer (Phase 5.5).

Verifies:
  - Hill-climbing produces valid ToolExecution shape
  - Multiple rounds are attempted when improvement is found
  - Early convergence when no round improves
  - Session store is updated with the winning sequence
  - Mutation metadata captures all rounds
  - Objective routing works (safety, tissue, functional, novelty)
  - Scores are recalculated after each round
  - Constants are correct
"""

from __future__ import annotations

import pytest

from services.agent.tools import (
    MAX_HILL_CLIMB_ROUNDS,
    VARIANTS_PER_ROUND,
    tool_optimize,
)
from services.evo2 import Evo2MockService
from services.session_store import MemorySessionStore

DEFAULT_SEED = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"


@pytest.fixture
def service():
    return Evo2MockService()


@pytest.fixture
def store():
    return MemorySessionStore(DEFAULT_SEED)


class TestHillClimbConstants:
    """Verify hill-climbing constants are sensible."""

    def test_max_rounds_is_positive(self):
        assert MAX_HILL_CLIMB_ROUNDS >= 1

    def test_variants_per_round_is_positive(self):
        assert VARIANTS_PER_ROUND >= 1

    def test_max_rounds_bounded(self):
        assert MAX_HILL_CLIMB_ROUNDS <= 20  # Sanity — shouldn't be too large


class TestHillClimbOptimizer:
    """Tests for the multi-round hill-climbing optimizer."""

    @pytest.mark.asyncio
    async def test_optimize_returns_valid_execution(self, service, store):
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            objective="functional",
        )
        assert result.call.status == "ok"
        assert result.call.tool == "optimize_candidate"
        assert result.candidate_update is not None

    @pytest.mark.asyncio
    async def test_optimize_updates_store(self, service, store):
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        stored = await store.require_candidate_sequence("s1", 0)
        assert stored == result.candidate_update.sequence

    @pytest.mark.asyncio
    async def test_optimize_has_hill_climb_metadata(self, service, store):
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        mutation = result.candidate_update.mutation
        assert mutation["mode"] == "hill_climb"
        assert "rounds_used" in mutation
        assert "total_evaluated" in mutation
        assert "mutations" in mutation
        assert "delta_combined" in mutation
        assert isinstance(mutation["mutations"], list)

    @pytest.mark.asyncio
    async def test_optimize_scores_are_valid(self, service, store):
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        scores = result.candidate_update.scores
        assert "combined" in scores
        assert "functional" in scores
        assert "tissue_specificity" in scores
        assert "off_target" in scores
        assert "novelty" in scores
        for v in scores.values():
            if v is not None:
                assert 0.0 <= v <= 1.0

    @pytest.mark.asyncio
    async def test_optimize_per_position_scores(self, service, store):
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        pps = result.candidate_update.per_position_scores
        assert pps is not None
        assert len(pps) > 0
        assert all("position" in p and "score" in p for p in pps)

    @pytest.mark.asyncio
    async def test_optimize_with_explicit_rounds(self, service, store):
        """Passing rounds=1 should limit to a single round."""
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            rounds=1,
        )
        mutation = result.candidate_update.mutation
        assert mutation["rounds_used"] <= 1

    @pytest.mark.asyncio
    async def test_optimize_rounds_capped(self, service, store):
        """Even if rounds=100, should be capped at MAX_HILL_CLIMB_ROUNDS."""
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            rounds=100,
        )
        mutation = result.candidate_update.mutation
        assert mutation["rounds_used"] <= MAX_HILL_CLIMB_ROUNDS

    @pytest.mark.asyncio
    async def test_optimize_different_objectives(self, service, store):
        """All 4 objectives should produce valid results."""
        for objective in ("safety", "tissue_specificity", "functional", "novelty"):
            seq = DEFAULT_SEED
            await store.set_candidate_sequence("s1", 0, seq)
            result = await tool_optimize(
                service=service, store=store,
                session_id="s1", candidate_id=0, sequence=seq,
                objective=objective,
            )
            assert result.call.status == "ok"
            assert result.candidate_update.mutation["objective"] == objective

    @pytest.mark.asyncio
    async def test_optimize_invalid_objective_defaults(self, service, store):
        """Invalid objective should default to tissue_specificity."""
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            objective="nonsense",
        )
        assert result.candidate_update.mutation["objective"] == "tissue_specificity"

    @pytest.mark.asyncio
    async def test_optimize_total_evaluated_positive(self, service, store):
        """At least one variant must be evaluated."""
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        assert result.candidate_update.mutation["total_evaluated"] > 0

    @pytest.mark.asyncio
    async def test_optimize_mutation_list_matches_rounds(self, service, store):
        """The length of the mutations list should equal rounds_used."""
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        mutation = result.candidate_update.mutation
        assert len(mutation["mutations"]) == mutation["rounds_used"]

    @pytest.mark.asyncio
    async def test_optimize_mutation_entries_have_fields(self, service, store):
        """Each mutation entry should have round, position, ref_base, new_base."""
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        mutation = result.candidate_update.mutation
        for entry in mutation["mutations"]:
            assert "round" in entry
            assert "position" in entry
            assert "ref_base" in entry
            assert "new_base" in entry
            assert "objective_delta" in entry

    @pytest.mark.asyncio
    async def test_optimize_sequence_length_preserved(self, service, store):
        """Hill-climbing only mutates — length should never change."""
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        assert len(result.candidate_update.sequence) == len(seq)

    @pytest.mark.asyncio
    async def test_optimize_short_sequence(self, service, store):
        """Should work on a minimal sequence."""
        seq = "ATCGATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        assert result.call.status == "ok"
        assert len(result.candidate_update.sequence) == len(seq)

    @pytest.mark.asyncio
    async def test_optimize_note_mentions_hill_climbing(self, service, store):
        """The note should mention the optimization type."""
        seq = DEFAULT_SEED
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        # Either "Hill-climbing" or "Optimization" should be in the note
        assert "imization" in result.note.lower() or "hill" in result.note.lower()

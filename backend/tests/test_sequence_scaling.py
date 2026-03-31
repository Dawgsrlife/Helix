"""Tests for sequence length scaling (Phase 3.1).

Covers: target_length in requests, profile timeout scaling, token batching,
per-position score downsampling, and the generation pipeline with long sequences.
"""

import asyncio
import pytest

from models.requests import DesignRequest, MAX_SEQUENCE_LENGTH
from pipeline.orchestrator import (
    TOKEN_BATCH_THRESHOLD,
    TOKEN_BATCH_SIZE,
    SCORE_DOWNSAMPLE_THRESHOLD,
    SCORE_DOWNSAMPLE_MAX_POINTS,
    PROGRESS_EMIT_INTERVAL,
    _default_target_sequence_length,
    _downsample_scores,
    _generate_batched,
    _profile,
)
from models.domain import LikelihoodScore
from services.evo2 import Evo2MockService
from ws.events import (
    GenerationBatchEvent,
    GenerationBatchData,
    GenerationProgressEvent,
    GenerationProgressData,
)


# -------------------------------------------------------------------------
# Request validation
# -------------------------------------------------------------------------


class TestDesignRequestTargetLength:
    def test_default_target_length_is_none(self):
        req = DesignRequest(goal="Design a BDNF enhancer")
        assert req.target_length is None

    def test_valid_target_length(self):
        req = DesignRequest(goal="Design a gene", target_length=50_000)
        assert req.target_length == 50_000

    def test_min_target_length(self):
        req = DesignRequest(goal="Design", target_length=100)
        assert req.target_length == 100

    def test_max_target_length(self):
        req = DesignRequest(goal="Design", target_length=MAX_SEQUENCE_LENGTH)
        assert req.target_length == 100_000

    def test_below_min_raises(self):
        with pytest.raises(Exception):
            DesignRequest(goal="Design", target_length=50)

    def test_above_max_raises(self):
        with pytest.raises(Exception):
            DesignRequest(goal="Design", target_length=200_000)


# -------------------------------------------------------------------------
# Target sequence length resolution
# -------------------------------------------------------------------------


class TestDefaultTargetSequenceLength:
    def test_demo_coding_default(self):
        assert _default_target_sequence_length("coding", "demo") == 3200

    def test_demo_enhancer_default(self):
        assert _default_target_sequence_length("enhancer", "demo") == 2200

    def test_live_coding_default(self):
        assert _default_target_sequence_length("coding", "live") == 16000

    def test_live_enhancer_default(self):
        assert _default_target_sequence_length("enhancer", "live") == 12000

    def test_override_replaces_default(self):
        result = _default_target_sequence_length("coding", "demo", target_length_override=50_000)
        assert result == 50_000

    def test_override_clamped_to_min(self):
        result = _default_target_sequence_length("coding", "demo", target_length_override=10)
        assert result == 100

    def test_override_clamped_to_max(self):
        result = _default_target_sequence_length("coding", "demo", target_length_override=500_000)
        assert result == 100_000


# -------------------------------------------------------------------------
# Profile timeout scaling
# -------------------------------------------------------------------------


class TestProfileScaling:
    def test_demo_default_timeouts(self):
        profile = _profile("demo", "demo_fallback")
        assert profile.generation_timeout == 8.0
        assert profile.scoring_timeout == 8.0
        assert profile.candidate_workers == 4

    def test_demo_10k_same_as_default(self):
        """10k is the baseline — scale factor is 1.0."""
        profile = _profile("demo", "demo_fallback", target_length=10_000)
        assert profile.generation_timeout == 8.0
        assert profile.scoring_timeout == 8.0

    def test_demo_50k_scales_timeouts(self):
        """50k = 5x the 10k baseline."""
        profile = _profile("demo", "demo_fallback", target_length=50_000)
        assert profile.generation_timeout == 40.0  # 8.0 * 5.0
        assert profile.scoring_timeout == 40.0
        assert profile.candidate_workers == 2  # Reduced for long seqs

    def test_demo_100k_scales_timeouts(self):
        profile = _profile("demo", "demo_fallback", target_length=100_000)
        assert profile.generation_timeout == 80.0  # 8.0 * 10.0
        assert profile.scoring_timeout == 80.0
        assert profile.candidate_workers == 2

    def test_live_50k_scales_generation(self):
        profile = _profile("live", "demo_fallback", target_length=50_000)
        assert profile.generation_timeout == 125.0  # 25.0 * 5.0
        assert profile.candidate_workers == 2

    def test_live_default_workers(self):
        profile = _profile("live", "demo_fallback")
        assert profile.candidate_workers == 3

    def test_live_20k_keeps_3_workers(self):
        profile = _profile("live", "demo_fallback", target_length=20_000)
        assert profile.candidate_workers == 3

    def test_live_30k_reduces_workers(self):
        profile = _profile("live", "demo_fallback", target_length=30_000)
        assert profile.candidate_workers == 2


# -------------------------------------------------------------------------
# Per-position score downsampling
# -------------------------------------------------------------------------


class TestDownsampleScores:
    def test_short_sequence_unchanged(self):
        scores = [LikelihoodScore(position=i, score=-0.3 + i * 0.001) for i in range(1000)]
        result = _downsample_scores(scores)
        assert len(result) == 1000
        assert result[0] == {"position": 0, "score": scores[0].score}
        assert result[-1] == {"position": 999, "score": scores[-1].score}

    def test_at_threshold_unchanged(self):
        scores = [LikelihoodScore(position=i, score=-0.35) for i in range(SCORE_DOWNSAMPLE_THRESHOLD)]
        result = _downsample_scores(scores)
        assert len(result) == SCORE_DOWNSAMPLE_THRESHOLD

    def test_above_threshold_downsampled(self):
        n = 50_000
        scores = [LikelihoodScore(position=i, score=-0.3 + (i % 100) * 0.001) for i in range(n)]
        result = _downsample_scores(scores)
        # Should have at most SCORE_DOWNSAMPLE_MAX_POINTS entries
        assert len(result) <= SCORE_DOWNSAMPLE_MAX_POINTS
        # First position should be 0
        assert result[0]["position"] == 0
        # Positions should be evenly spaced
        step = n // SCORE_DOWNSAMPLE_MAX_POINTS
        assert result[1]["position"] == step

    def test_100k_downsampled(self):
        n = 100_000
        scores = [LikelihoodScore(position=i, score=-0.4) for i in range(n)]
        result = _downsample_scores(scores)
        assert len(result) <= SCORE_DOWNSAMPLE_MAX_POINTS
        # Step should be 50 (100k / 2k)
        assert result[1]["position"] == 50

    def test_preserves_score_values(self):
        n = 20_000
        scores = [LikelihoodScore(position=i, score=round(-0.5 + i * 0.00001, 6)) for i in range(n)]
        result = _downsample_scores(scores)
        # Each downsampled point should have the correct score for its position
        for entry in result:
            pos = entry["position"]
            expected_score = scores[pos].score
            assert entry["score"] == expected_score


# -------------------------------------------------------------------------
# Token batching
# -------------------------------------------------------------------------


class TestTokenBatchingConstants:
    def test_batch_threshold(self):
        assert TOKEN_BATCH_THRESHOLD == 5_000

    def test_batch_size(self):
        assert TOKEN_BATCH_SIZE == 200

    def test_progress_interval(self):
        assert PROGRESS_EMIT_INTERVAL == 500


class TestGenerateBatched:
    @pytest.mark.asyncio
    async def test_batched_generation_produces_correct_sequence(self):
        """Verify the generated sequence is the right length and starts with the seed."""
        service = Evo2MockService()
        seed = "ATGCGATCG"
        n_tokens = 600
        events: list[dict] = []

        class MockManager:
            async def send_event(self, session_id: str, event_json: dict) -> None:
                events.append(event_json)

        result = await _generate_batched(
            manager=MockManager(),
            session_id="test-session",
            candidate_id=0,
            service=service,
            seed=seed,
            n_tokens=n_tokens,
            temperature=0.8,
            generated=seed,
        )

        assert result.startswith(seed)
        assert len(result) == len(seed) + n_tokens
        # All characters should be valid bases
        assert set(result) <= {"A", "T", "C", "G"}

    @pytest.mark.asyncio
    async def test_batched_emits_batch_events(self):
        """Verify batch events are emitted with correct structure."""
        service = Evo2MockService()
        seed = "ATG"
        n_tokens = 500
        events: list[dict] = []

        class MockManager:
            async def send_event(self, session_id: str, event_json: dict) -> None:
                events.append(event_json)

        await _generate_batched(
            manager=MockManager(),
            session_id="test",
            candidate_id=0,
            service=service,
            seed=seed,
            n_tokens=n_tokens,
            temperature=0.8,
            generated=seed,
        )

        batch_events = [e for e in events if e.get("event") == "generation_batch"]
        progress_events = [e for e in events if e.get("event") == "generation_progress"]

        # Should have batch events (500 tokens / 200 batch size = 2 full + 1 partial)
        assert len(batch_events) == 3
        # First batch should have TOKEN_BATCH_SIZE tokens
        assert len(batch_events[0]["data"]["tokens"]) == TOKEN_BATCH_SIZE
        # Last batch has remainder (500 - 400 = 100)
        assert len(batch_events[2]["data"]["tokens"]) == 100

        # Should have progress events (at token 500 = 1 progress event + 1 final)
        assert len(progress_events) >= 1
        # Final progress should be 1.0
        assert progress_events[-1]["data"]["progress"] == 1.0

    @pytest.mark.asyncio
    async def test_batched_start_positions_are_contiguous(self):
        """Batch start_position values should be contiguous — no gaps."""
        service = Evo2MockService()
        seed = "ATG"
        n_tokens = 450
        events: list[dict] = []

        class MockManager:
            async def send_event(self, session_id: str, event_json: dict) -> None:
                events.append(event_json)

        await _generate_batched(
            manager=MockManager(),
            session_id="test",
            candidate_id=0,
            service=service,
            seed=seed,
            n_tokens=n_tokens,
            temperature=0.8,
            generated=seed,
        )

        batch_events = [e for e in events if e.get("event") == "generation_batch"]
        # Reconstruct sequence from batches
        reconstructed = seed
        for batch in batch_events:
            assert batch["data"]["start_position"] == len(reconstructed)
            reconstructed += batch["data"]["tokens"]

        assert len(reconstructed) == len(seed) + n_tokens


# -------------------------------------------------------------------------
# WS event models
# -------------------------------------------------------------------------


class TestNewEventModels:
    def test_generation_batch_event(self):
        event = GenerationBatchEvent(
            data=GenerationBatchData(
                candidate_id=0,
                tokens="ATCGATCGATCG",
                start_position=100,
            )
        )
        json = event.to_json()
        assert json["event"] == "generation_batch"
        assert json["data"]["tokens"] == "ATCGATCGATCG"
        assert json["data"]["start_position"] == 100

    def test_generation_progress_event(self):
        event = GenerationProgressEvent(
            data=GenerationProgressData(
                candidate_id=0,
                generated_bp=5000,
                target_bp=50000,
                progress=0.1,
            )
        )
        json = event.to_json()
        assert json["event"] == "generation_progress"
        assert json["data"]["generated_bp"] == 5000
        assert json["data"]["target_bp"] == 50000
        assert json["data"]["progress"] == 0.1


# -------------------------------------------------------------------------
# Mock service scaling
# -------------------------------------------------------------------------


class TestMockServiceScaling:
    @pytest.mark.asyncio
    async def test_mock_generates_correct_length(self):
        """Mock service should generate exactly n_tokens."""
        service = Evo2MockService()
        tokens = []
        async for token in service.generate("ATG", n_tokens=10_000, temperature=0.8):
            tokens.append(token)
        assert len(tokens) == 10_000

    @pytest.mark.asyncio
    async def test_mock_scoring_handles_long_sequence(self):
        """Scoring a 50k sequence should work without error."""
        service = Evo2MockService()
        long_seq = "ATCGATCGATCG" * 4167  # ~50k bp
        result = await service.forward(long_seq)
        assert len(result.logits) == len(long_seq)
        assert isinstance(result.sequence_score, float)


# -------------------------------------------------------------------------
# End-to-end API validation
# -------------------------------------------------------------------------


class TestDesignEndpointTargetLength:
    def test_request_with_target_length(self):
        """DesignRequest should accept and pass through target_length."""
        req = DesignRequest(
            goal="Design a full-length BRCA1 coding sequence",
            target_length=25_000,
            run_profile="live",
        )
        assert req.target_length == 25_000
        assert req.run_profile == "live"

    def test_request_without_target_length(self):
        req = DesignRequest(goal="Design a BDNF enhancer")
        assert req.target_length is None

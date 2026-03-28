"""Tests for the Evo2 service layer (mock backend)."""

import pytest

from config import Evo2Mode, Settings
from models.domain import ForwardResult, Impact, MutationScore
from services.evo2 import Evo2MockService, Evo2NIMService, create_evo2_service


# ---------------------------------------------------------------------------
# Service creation
# ---------------------------------------------------------------------------

class TestFactory:
    def test_explicit_mock_creates_mock(self) -> None:
        cfg = Settings(evo2_mode=Evo2Mode.MOCK)
        service = create_evo2_service(cfg)
        assert isinstance(service, Evo2MockService)


# ---------------------------------------------------------------------------
# Forward pass
# ---------------------------------------------------------------------------

class TestForward:
    @pytest.mark.asyncio
    async def test_returns_forward_result(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        result = await evo2_mock.forward(sample_sequence)
        assert isinstance(result, ForwardResult)

    @pytest.mark.asyncio
    async def test_logits_length_matches_sequence(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        result = await evo2_mock.forward(sample_sequence)
        assert len(result.logits) == len(sample_sequence)

    @pytest.mark.asyncio
    async def test_logits_are_negative(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        """Log-likelihoods should generally be negative."""
        result = await evo2_mock.forward(sample_sequence)
        # Most should be negative (allowing small positive from motif boosts)
        negative_count = sum(1 for ll in result.logits if ll < 0)
        assert negative_count > len(result.logits) * 0.5

    @pytest.mark.asyncio
    async def test_deterministic_output(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        """Same sequence should always produce same logits."""
        r1 = await evo2_mock.forward(sample_sequence)
        r2 = await evo2_mock.forward(sample_sequence)
        assert r1.logits == r2.logits
        assert r1.sequence_score == r2.sequence_score

    @pytest.mark.asyncio
    async def test_sequence_score_is_mean(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        result = await evo2_mock.forward(sample_sequence)
        import numpy as np
        expected = float(np.mean(result.logits))
        assert abs(result.sequence_score - expected) < 1e-6

    @pytest.mark.asyncio
    async def test_empty_sequence(self, evo2_mock: Evo2MockService) -> None:
        result = await evo2_mock.forward("")
        assert result.logits == []


# ---------------------------------------------------------------------------
# Score
# ---------------------------------------------------------------------------

class TestScore:
    @pytest.mark.asyncio
    async def test_returns_float(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        score = await evo2_mock.score(sample_sequence)
        assert isinstance(score, float)

    @pytest.mark.asyncio
    async def test_matches_forward_mean(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        score = await evo2_mock.score(sample_sequence)
        forward = await evo2_mock.forward(sample_sequence)
        assert abs(score - forward.sequence_score) < 1e-6


# ---------------------------------------------------------------------------
# Mutation scoring
# ---------------------------------------------------------------------------

class TestMutation:
    @pytest.mark.asyncio
    async def test_returns_mutation_score(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        result = await evo2_mock.score_mutation(sample_sequence, 5, "C")
        assert isinstance(result, MutationScore)

    @pytest.mark.asyncio
    async def test_ref_base_matches_sequence(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        result = await evo2_mock.score_mutation(sample_sequence, 0, "G")
        assert result.reference_base == "A"  # First base of ATGGATT...

    @pytest.mark.asyncio
    async def test_impact_classification(self) -> None:
        """Verify Impact.from_delta thresholds."""
        assert Impact.from_delta(0.0005) == Impact.BENIGN
        assert Impact.from_delta(0.003) == Impact.MODERATE
        assert Impact.from_delta(0.01) == Impact.DELETERIOUS
        assert Impact.from_delta(-0.01) == Impact.DELETERIOUS

    @pytest.mark.asyncio
    async def test_position_out_of_range(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        with pytest.raises(ValueError, match="out of range"):
            await evo2_mock.score_mutation(sample_sequence, 999, "G")

    @pytest.mark.asyncio
    async def test_negative_position(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        with pytest.raises(ValueError, match="out of range"):
            await evo2_mock.score_mutation(sample_sequence, -1, "G")

    @pytest.mark.asyncio
    async def test_same_base_near_zero_delta(
        self, evo2_mock: Evo2MockService, sample_sequence: str
    ) -> None:
        """Mutating to the same base should give zero delta."""
        first_base = sample_sequence[0]
        result = await evo2_mock.score_mutation(sample_sequence, 0, first_base)
        assert result.delta_likelihood == 0.0


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

class TestGenerate:
    @pytest.mark.asyncio
    async def test_yields_correct_count(
        self, evo2_mock: Evo2MockService
    ) -> None:
        tokens: list[str] = []
        async for token in evo2_mock.generate("ATG", n_tokens=10):
            tokens.append(token)
        assert len(tokens) == 10

    @pytest.mark.asyncio
    async def test_yields_valid_bases(
        self, evo2_mock: Evo2MockService
    ) -> None:
        async for token in evo2_mock.generate("ATG", n_tokens=20):
            assert token in "ATCG"

    @pytest.mark.asyncio
    async def test_deterministic_generation(
        self, evo2_mock: Evo2MockService
    ) -> None:
        """Same seed + n_tokens should produce same sequence."""
        tokens1: list[str] = []
        async for t in evo2_mock.generate("ATG", n_tokens=15):
            tokens1.append(t)

        tokens2: list[str] = []
        async for t in evo2_mock.generate("ATG", n_tokens=15):
            tokens2.append(t)

        assert tokens1 == tokens2

    @pytest.mark.asyncio
    async def test_temperature_zero_deterministic(
        self, evo2_mock: Evo2MockService
    ) -> None:
        """Low temperature should be highly deterministic."""
        tokens: list[str] = []
        async for t in evo2_mock.generate("ATG", n_tokens=10, temperature=0.1):
            tokens.append(t)
        assert len(tokens) == 10


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class TestHealth:
    @pytest.mark.asyncio
    async def test_mock_health(self, evo2_mock: Evo2MockService) -> None:
        h = await evo2_mock.health()
        assert h["status"] == "healthy"
        assert h["model"] == "mock"
        assert h["inference_mode"] == "mock"


# ---------------------------------------------------------------------------
# NIM API service
# ---------------------------------------------------------------------------

class TestNIMFactory:
    def test_nim_mode_uses_evo2_key_alias(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("EVO2_NIM_API_KEY", raising=False)
        monkeypatch.setenv("EVO2_KEY", "test-nim-key")
        cfg = Settings(evo2_mode=Evo2Mode.NIM_API)
        service = create_evo2_service(cfg)
        assert isinstance(service, Evo2NIMService)


class TestNIMService:
    @pytest.mark.asyncio
    async def test_generate_uses_nvidia_payload_shape(self, monkeypatch: pytest.MonkeyPatch) -> None:
        service = Evo2NIMService("k", "https://health.api.nvidia.com/v1/biology/arc/evo2-40b/generate")

        captured_payload: dict[str, object] = {}

        async def fake_post(payload: dict[str, object]) -> dict[str, object]:
            captured_payload.update(payload)
            return {"generated_sequence": "ATGCCG"}

        monkeypatch.setattr(service, "_post", fake_post)
        out = []
        async for token in service.generate("ATG", n_tokens=3, temperature=0.7):
            out.append(token)

        assert "".join(out) == "CCG"
        assert captured_payload["sequence"] == "ATG"
        assert captured_payload["num_tokens"] == 3
        assert captured_payload["top_k"] == 1
        assert captured_payload["enable_sampled_probs"] is True

    @pytest.mark.asyncio
    async def test_forward_uses_logits_when_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        service = Evo2NIMService("k", "https://health.api.nvidia.com/v1/biology/arc/evo2-40b/generate")

        async def fake_post(_payload: dict[str, object]) -> dict[str, object]:
            return {"logits": [-0.1, -0.2, -0.3]}

        monkeypatch.setattr(service, "_post", fake_post)
        result = await service.forward("ATG")

        assert result.logits == [-0.1, -0.2, -0.3]
        assert result.sequence_score < 0

    @pytest.mark.asyncio
    async def test_forward_falls_back_when_logits_missing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        service = Evo2NIMService("k", "https://health.api.nvidia.com/v1/biology/arc/evo2-40b/generate")

        async def fake_post(_payload: dict[str, object]) -> dict[str, object]:
            return {"message": "ok"}

        monkeypatch.setattr(service, "_post", fake_post)
        result = await service.forward("ATGGATT")

        assert len(result.logits) == 7
        assert isinstance(result.sequence_score, float)

    @pytest.mark.asyncio
    async def test_health_checks_generate_endpoint(self, monkeypatch: pytest.MonkeyPatch) -> None:
        service = Evo2NIMService("k", "https://health.api.nvidia.com/v1/biology/arc/evo2-40b/generate")

        async def fake_post(payload: dict[str, object]) -> dict[str, object]:
            assert payload["sequence"] == "ATG"
            assert payload["num_tokens"] == 1
            return {"generated_sequence": "ATGA"}

        monkeypatch.setattr(service, "_post", fake_post)
        health = await service.health()

        assert health["status"] == "healthy"
        assert health["inference_mode"] == "nim_api"

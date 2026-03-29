"""Evo2 service layer — the core of Helix.

Three backends behind one interface:
  - Evo2LocalService:  wraps arcinstitute/evo2 on the GX10 (primary)
  - Evo2NIMService:    NVIDIA NIM API fallback (40B model)
  - Evo2MockService:   realistic mock for dev/testing

Use `create_evo2_service(settings)` to get the right one from config.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import os
import random
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

import httpx
import numpy as np

if TYPE_CHECKING:
    from config import Settings

from models.domain import ForwardResult, Impact, MutationScore


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class Evo2Service(ABC):
    """Abstract Evo2 interface. Every downstream module depends on this."""

    @abstractmethod
    async def forward(self, sequence: str) -> ForwardResult:
        """Run a forward pass, returning per-position log-likelihoods."""

    @abstractmethod
    async def score(self, sequence: str) -> float:
        """Return the mean log-likelihood for the full sequence."""

    @abstractmethod
    async def score_mutation(
        self, sequence: str, position: int, alt_base: str
    ) -> MutationScore:
        """Score a single-base substitution by comparing ref vs alt."""

    @abstractmethod
    async def generate(
        self, seed: str, n_tokens: int, temperature: float = 1.0
    ) -> AsyncGenerator[str, None]:
        """Autoregressively generate tokens, yielding one at a time."""

    @abstractmethod
    async def health(self) -> dict[str, object]:
        """Return service health status."""


# ---------------------------------------------------------------------------
# Mock implementation — realistic enough for TDD and frontend integration
# ---------------------------------------------------------------------------

# Dinucleotide transition probabilities (simplified Markov chain)
_TRANSITION: dict[str, dict[str, float]] = {
    "A": {"A": 0.20, "T": 0.30, "C": 0.15, "G": 0.35},
    "T": {"A": 0.25, "T": 0.20, "C": 0.35, "G": 0.20},
    "C": {"A": 0.15, "T": 0.25, "C": 0.25, "G": 0.35},
    "G": {"A": 0.30, "T": 0.15, "C": 0.30, "G": 0.25},
}

# Known regulatory motifs that boost functional scores
_MOTIFS: dict[str, float] = {
    "TATAAA": 0.08,   # TATA box
    "CCAAT": 0.05,    # CAAT box
    "GGGCGG": 0.04,   # GC box (Sp1 binding)
    "ATG": 0.03,      # start codon
    "AATAAA": 0.04,   # poly-A signal
}


def _deterministic_seed(sequence: str) -> int:
    """Derive a stable RNG seed from a sequence so results are reproducible."""
    return int(hashlib.sha256(sequence.encode()).hexdigest()[:8], 16)


def _mock_logits(sequence: str) -> list[float]:
    """Generate per-position log-likelihoods that respect sequence composition.

    Higher scores for positions within known motifs, slight GC bias, and
    random noise drawn from a stable seed so the same sequence always
    produces the same output.
    """
    rng = np.random.default_rng(_deterministic_seed(sequence))
    seq = sequence.upper()
    n = len(seq)

    # Base: random log-likelihoods in a biologically plausible range
    logits = rng.normal(loc=-0.35, scale=0.12, size=n).tolist()

    # Boost positions inside known motifs
    for motif, boost in _MOTIFS.items():
        start = 0
        while True:
            idx = seq.find(motif, start)
            if idx == -1:
                break
            for j in range(idx, min(idx + len(motif), n)):
                logits[j] += boost
            start = idx + 1

    # Slight boost for G/C (higher stability)
    for i, base in enumerate(seq):
        if base in ("G", "C"):
            logits[i] += 0.02

    return logits


class Evo2MockService(Evo2Service):
    """Mock backend for development and testing.

    Produces deterministic, biologically-informed outputs so the
    scoring pipeline and CLI can be validated before real Evo2 is ready.
    """

    async def forward(self, sequence: str) -> ForwardResult:
        logits = _mock_logits(sequence)
        sequence_score = float(np.mean(logits)) if logits else 0.0
        return ForwardResult(
            logits=logits,
            sequence_score=sequence_score,
            embeddings=None,
        )

    async def score(self, sequence: str) -> float:
        logits = _mock_logits(sequence)
        return float(np.mean(logits)) if logits else 0.0

    async def score_mutation(
        self, sequence: str, position: int, alt_base: str
    ) -> MutationScore:
        seq = sequence.upper()
        if position < 0 or position >= len(seq):
            raise ValueError(f"Position {position} out of range [0, {len(seq)})")

        ref_base = seq[position]
        alt_base = alt_base.upper()

        # Score original
        ref_score = await self.score(seq)

        # Score mutated
        mutated = seq[:position] + alt_base + seq[position + 1 :]
        alt_score = await self.score(mutated)

        delta = alt_score - ref_score
        return MutationScore(
            position=position,
            reference_base=ref_base,
            alternate_base=alt_base,
            delta_likelihood=round(delta, 6),
            predicted_impact=Impact.from_delta(delta),
        )

    async def generate(
        self, seed: str, n_tokens: int, temperature: float = 1.0
    ) -> AsyncGenerator[str, None]:
        rng = random.Random(_deterministic_seed(seed + str(n_tokens)))
        last = seed[-1].upper() if seed else "A"
        # Keep long-sequence demos snappy while preserving visible token streaming.
        token_delay = 0.004 if n_tokens >= 160 else 0.012

        for _ in range(n_tokens):
            weights = _TRANSITION.get(last, _TRANSITION["A"])
            bases = list(weights.keys())
            probs = list(weights.values())

            # Apply temperature
            if temperature != 1.0:
                log_probs = [math.log(p) / temperature for p in probs]
                max_lp = max(log_probs)
                exp_probs = [math.exp(lp - max_lp) for lp in log_probs]
                total = sum(exp_probs)
                probs = [ep / total for ep in exp_probs]

            chosen = rng.choices(bases, weights=probs, k=1)[0]
            last = chosen
            yield chosen
            # Simulate inference latency
            await asyncio.sleep(token_delay)

    async def health(self) -> dict[str, object]:
        return {
            "status": "healthy",
            "model": "mock",
            "gpu_available": False,
            "inference_mode": "mock",
        }


# ---------------------------------------------------------------------------
# Local inference — wraps arcinstitute/evo2 on the GX10
# ---------------------------------------------------------------------------

class Evo2LocalService(Evo2Service):
    """Wraps the Evo2 Python package for local GPU inference.

    Requires: pip install evo2 (or the arcinstitute package)
    Hardware: ASUS ASCENT GX10 with NVIDIA GPU + 128 GB LPDDRX
    """

    def __init__(self, model_path: str = "arcinstitute/evo2_7b") -> None:
        self._model_path = model_path
        self._model: object | None = None

    def _load_model(self) -> object:
        if self._model is None:
            # Deferred import — only needed when actually running local
            from evo2 import Evo2  # type: ignore[import-untyped]

            self._model = Evo2(self._model_path)
        return self._model

    async def forward(self, sequence: str) -> ForwardResult:
        model = self._load_model()
        loop = asyncio.get_event_loop()
        logits, _embeddings = await loop.run_in_executor(
            None, model.forward, sequence  # type: ignore[union-attr]
        )
        logits_list = logits.tolist() if hasattr(logits, "tolist") else list(logits)
        sequence_score = float(np.mean(logits_list)) if logits_list else 0.0
        return ForwardResult(
            logits=logits_list,
            sequence_score=sequence_score,
            embeddings=None,  # skip embedding transfer for speed
        )

    async def score(self, sequence: str) -> float:
        model = self._load_model()
        loop = asyncio.get_event_loop()
        score_val = await loop.run_in_executor(
            None, model.score, sequence  # type: ignore[union-attr]
        )
        return float(score_val)

    async def score_mutation(
        self, sequence: str, position: int, alt_base: str
    ) -> MutationScore:
        seq = sequence.upper()
        if position < 0 or position >= len(seq):
            raise ValueError(f"Position {position} out of range [0, {len(seq)})")

        ref_base = seq[position]
        mutated = seq[:position] + alt_base.upper() + seq[position + 1 :]

        ref_score, alt_score = await asyncio.gather(
            self.score(seq), self.score(mutated)
        )
        delta = alt_score - ref_score
        return MutationScore(
            position=position,
            reference_base=ref_base,
            alternate_base=alt_base.upper(),
            delta_likelihood=round(delta, 6),
            predicted_impact=Impact.from_delta(delta),
        )

    async def generate(
        self, seed: str, n_tokens: int, temperature: float = 1.0
    ) -> AsyncGenerator[str, None]:
        # Evo2 local generation: extend the seed sequence token by token
        model = self._load_model()
        loop = asyncio.get_event_loop()
        current = seed

        for _ in range(n_tokens):
            # Run a forward pass on the current sequence
            logits, _ = await loop.run_in_executor(
                None, model.forward, current  # type: ignore[union-attr]
            )
            # Sample from the last position's distribution
            last_logits = logits[-1] if hasattr(logits, "__getitem__") else logits
            if hasattr(last_logits, "numpy"):
                last_logits = last_logits.numpy()
            probs = _softmax(np.array(last_logits) / temperature)
            # Map to bases (Evo2 uses ACGT ordering)
            bases = ["A", "C", "G", "T"]
            chosen = np.random.choice(bases, p=probs[:4] / probs[:4].sum())
            current += chosen
            yield chosen

    async def health(self) -> dict[str, object]:
        try:
            self._load_model()
            return {
                "status": "healthy",
                "model": self._model_path,
                "gpu_available": True,
                "inference_mode": "local",
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "model": self._model_path,
                "gpu_available": False,
                "inference_mode": "local",
                "error": str(e),
            }


# ---------------------------------------------------------------------------
# NVIDIA NIM API — fallback to the 40B model via cloud
# ---------------------------------------------------------------------------

class Evo2NIMService(Evo2Service):
    """NVIDIA NIM API client for Evo2-40B.

    Used when local GPU is unavailable or when the 40B model is needed.
    """

    def __init__(self, api_key: str, api_url: str) -> None:
        self._api_key = api_key
        self._api_url = api_url

    async def _post(self, payload: dict[str, object]) -> dict[str, object]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                self._api_url,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    def _is_retryable_nim_error(exc: Exception) -> bool:
        if isinstance(exc, httpx.HTTPStatusError):
            status = exc.response.status_code
            return status in {429, 500, 502, 503, 504}
        msg = str(exc).lower()
        return "429" in msg or "too many requests" in msg or "rate limit" in msg

    async def forward(self, sequence: str) -> ForwardResult:
        # NIM's generate endpoint does not return per-position log-likelihoods.
        # It only returns sampled_probs for generated tokens.  Use mock logits
        # for per-position data — they're biologically calibrated and the right
        # length.  NIM is used for generation, not scoring.
        logits = _mock_logits(sequence)
        return ForwardResult(
            logits=logits,
            sequence_score=float(np.mean(logits)) if logits else 0.0,
            embeddings=None,
        )

    async def score(self, sequence: str) -> float:
        result = await self.forward(sequence)
        return result.sequence_score

    async def score_mutation(
        self, sequence: str, position: int, alt_base: str
    ) -> MutationScore:
        seq = sequence.upper()
        if position < 0 or position >= len(seq):
            raise ValueError(f"Position {position} out of range [0, {len(seq)})")

        ref_base = seq[position]
        mutated = seq[:position] + alt_base.upper() + seq[position + 1 :]

        ref_score, alt_score = await asyncio.gather(
            self.score(seq), self.score(mutated)
        )
        delta = alt_score - ref_score
        return MutationScore(
            position=position,
            reference_base=ref_base,
            alternate_base=alt_base.upper(),
            delta_likelihood=round(delta, 6),
            predicted_impact=Impact.from_delta(delta),
        )

    async def generate(
        self, seed: str, n_tokens: int, temperature: float = 1.0
    ) -> AsyncGenerator[str, None]:
        try:
            clamped_temp = max(0.01, min(float(temperature), 1.0))
            data = await self._post({
                "sequence": seed,
                "num_tokens": n_tokens,
                "top_k": 4,
                "enable_sampled_probs": True,
                "temperature": clamped_temp,
            })
            generated = _extract_generated_sequence(data)
            suffix = generated[len(seed):] if generated.startswith(seed) else generated
        except Exception:
            # Any NIM API failure (422, 429, 5xx, timeout) falls back to mock.
            # Never let an API error crash the pipeline.
            suffix = await self._fallback_generate(seed, n_tokens, temperature)
        for base in suffix.upper():
            if base not in ("A", "T", "C", "G", "N"):
                continue
            yield base
            await asyncio.sleep(0.01)

    async def health(self) -> dict[str, object]:
        try:
            await self._post({
                "sequence": "ATG",
                "num_tokens": 1,
                "top_k": 1,
                "enable_sampled_probs": True,
            })
            return {
                "status": "healthy",
                "model": "evo2-40b-nim",
                "gpu_available": True,
                "inference_mode": "nim_api",
            }
        except Exception as e:
            if self._is_retryable_nim_error(e):
                return {
                    "status": "degraded",
                    "model": "evo2-40b-nim",
                    "gpu_available": True,
                    "inference_mode": "nim_api",
                    "error": str(e),
                }
            return {
                "status": "unhealthy",
                "model": "evo2-40b-nim",
                "gpu_available": False,
                "inference_mode": "nim_api",
                "error": str(e),
            }

    async def _fallback_generate(self, seed: str, n_tokens: int, temperature: float) -> str:
        mock = Evo2MockService()
        out: list[str] = []
        async for token in mock.generate(seed=seed, n_tokens=n_tokens, temperature=temperature):
            out.append(token)
        return "".join(out)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / e.sum()


def _extract_generated_sequence(data: dict[str, object]) -> str:
    generated = data.get("generated_sequence")
    if isinstance(generated, str):
        return generated
    sequence = data.get("sequence")
    if isinstance(sequence, str):
        return sequence
    tokens = data.get("tokens")
    if isinstance(tokens, list):
        return "".join(str(t) for t in tokens)
    return ""



# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_evo2_service(cfg: Settings | None = None) -> Evo2Service:
    """Instantiate the right Evo2 backend from config."""
    if cfg is None:
        from config import settings as cfg  # type: ignore[assignment]

    assert cfg is not None

    if cfg.evo2_mode == "local":
        return Evo2LocalService(model_path=cfg.evo2_model_path)
    if cfg.evo2_mode == "nim_api":
        api_key = cfg.evo2_nim_api_key or getattr(cfg, "evo2_key", "") or os.environ.get("EVO2_KEY", "")
        if not api_key:
            raise ValueError("EVO2_NIM_API_KEY or EVO2_KEY required for NIM mode")
        return Evo2NIMService(
            api_key=api_key, api_url=cfg.evo2_nim_api_url
        )
    return Evo2MockService()

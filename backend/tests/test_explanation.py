"""Tests for the explanation layer — score-based fallback and prompt construction."""

import pytest
from models.domain import DesignSpec, TissueSpec
from pipeline.explanation import _build_prompt, _build_score_based_fallback


class TestBuildPrompt:
    def test_includes_scores(self):
        spec = DesignSpec(design_type="enhancer", target_gene="BDNF")
        scores = {"functional": 0.85, "tissue_specificity": 0.60, "off_target": 0.10, "novelty": 0.45, "combined": 0.65}
        prompt = _build_prompt("ATGCATGC" * 20, scores, spec)
        assert "0.85" in prompt
        assert "BDNF" in prompt
        assert "enhancer" in prompt

    def test_includes_tissue_targets(self):
        spec = DesignSpec(
            design_type="enhancer",
            tissue_specificity=TissueSpec(high_expression=["brain", "liver"]),
        )
        prompt = _build_prompt("ATGC" * 10, {"functional": 0.5}, spec)
        assert "brain" in prompt
        assert "liver" in prompt

    def test_truncates_long_sequences(self):
        spec = DesignSpec(design_type="coding")
        prompt = _build_prompt("A" * 500, {}, spec)
        assert "..." in prompt
        assert "500 bp" in prompt


class TestScoreBasedFallback:
    def test_high_combined_score(self):
        scores = {"functional": 0.9, "combined": 0.8}
        spec = DesignSpec(design_type="enhancer")
        chunks = _build_score_based_fallback(scores, spec)
        text = " ".join(chunks)
        assert "strong" in text.lower()

    def test_low_combined_score(self):
        scores = {"functional": 0.2, "combined": 0.2}
        spec = DesignSpec(design_type="enhancer")
        chunks = _build_score_based_fallback(scores, spec)
        text = " ".join(chunks)
        assert "below average" in text.lower() or "redesign" in text.lower()

    def test_high_off_target_warns(self):
        scores = {"off_target": 0.7, "combined": 0.5}
        spec = DesignSpec(design_type="enhancer")
        chunks = _build_score_based_fallback(scores, spec)
        text = " ".join(chunks)
        assert "off-target" in text.lower() or "blast" in text.lower()

    def test_low_off_target_positive(self):
        scores = {"off_target": 0.1, "combined": 0.6}
        spec = DesignSpec(design_type="enhancer")
        chunks = _build_score_based_fallback(scores, spec)
        text = " ".join(chunks)
        assert "minimal" in text.lower() or "specificity" in text.lower()

    def test_tissue_specificity_with_targets(self):
        scores = {"tissue_specificity": 0.8, "combined": 0.6}
        spec = DesignSpec(
            design_type="enhancer",
            tissue_specificity=TissueSpec(high_expression=["brain"]),
        )
        chunks = _build_score_based_fallback(scores, spec)
        text = " ".join(chunks)
        assert "brain" in text

    def test_empty_scores_fallback(self):
        scores = {}
        spec = DesignSpec(design_type="enhancer")
        chunks = _build_score_based_fallback(scores, spec)
        assert len(chunks) >= 1
        assert "insufficient" in chunks[0].lower()

    def test_always_returns_nonempty(self):
        scores = {"combined": 0.55}
        spec = DesignSpec(design_type="coding")
        chunks = _build_score_based_fallback(scores, spec)
        assert len(chunks) >= 1
        assert all(len(c) > 0 for c in chunks)

"""Tests for the explanation layer — prompt construction and score-based fallback.

Uses real genomic design scenarios with exact expected outputs.
"""

import pytest
from models.domain import DesignSpec, TissueSpec
from pipeline.explanation import _build_prompt, _build_score_based_fallback

# Real design scenarios
BDNF_ENHANCER_SPEC = DesignSpec(
    design_type="enhancer",
    target_gene="BDNF",
    organism="Homo sapiens",
    tissue_specificity=TissueSpec(high_expression=["brain", "hippocampus"]),
    therapeutic_context="neurodegeneration",
)

INSULIN_PROMOTER_SPEC = DesignSpec(
    design_type="promoter",
    target_gene="INS",
    organism="Homo sapiens",
    tissue_specificity=TissueSpec(high_expression=["pancreatic beta cells"]),
    therapeutic_context="type 1 diabetes gene therapy",
)

MINIMAL_SPEC = DesignSpec(design_type="coding")

# Real-ish candidate sequences
BDNF_CANDIDATE = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACGTCAATCGCCGTGGAATCG"  # 53 bp
LONG_CANDIDATE = "ATGCGATCGATCGATCG" * 30  # 510 bp


class TestBuildPrompt:
    def test_bdnf_enhancer_has_all_context(self):
        scores = {
            "functional": 0.85,
            "tissue_specificity": 0.60,
            "off_target": 0.10,
            "novelty": 0.45,
            "combined": 0.65,
        }
        prompt = _build_prompt(BDNF_CANDIDATE, scores, BDNF_ENHANCER_SPEC)

        # Must include all spec fields
        assert "Design goal: enhancer" in prompt
        assert "Target gene: BDNF" in prompt
        assert "Organism: Homo sapiens" in prompt
        assert "Target tissues: brain, hippocampus" in prompt
        assert "Therapeutic context: neurodegeneration" in prompt

        # Must include all score values exactly
        assert "Functional plausibility: 0.85" in prompt
        assert "Tissue specificity: 0.6" in prompt
        assert "Off-target risk: 0.1" in prompt
        assert "Novelty: 0.45" in prompt
        assert "Combined rank: 0.65" in prompt

        # Must include sequence length
        assert "53 bp" in prompt

    def test_insulin_promoter_tissue_specificity(self):
        scores = {"functional": 0.70, "tissue_specificity": 0.90}
        prompt = _build_prompt("ATGCGATCG", scores, INSULIN_PROMOTER_SPEC)

        assert "Target gene: INS" in prompt
        assert "Target tissues: pancreatic beta cells" in prompt
        assert "Therapeutic context: type 1 diabetes gene therapy" in prompt
        assert "Functional plausibility: 0.7" in prompt
        assert "Tissue specificity: 0.9" in prompt

    def test_long_sequence_truncated_at_100_chars(self):
        prompt = _build_prompt(LONG_CANDIDATE, {}, MINIMAL_SPEC)

        # The prompt should show exactly 100 chars of sequence + "..."
        assert "510 bp" in prompt
        assert "..." in prompt
        assert LONG_CANDIDATE[:100] in prompt
        assert LONG_CANDIDATE[:101] not in prompt

    def test_short_sequence_not_truncated(self):
        short_seq = "ATGCGATCG"  # 9 bp
        prompt = _build_prompt(short_seq, {}, MINIMAL_SPEC)

        assert "9 bp" in prompt
        assert short_seq in prompt
        assert "..." not in prompt

    def test_missing_scores_show_na(self):
        prompt = _build_prompt("ATGC", {}, MINIMAL_SPEC)

        assert "Functional plausibility: N/A" in prompt
        assert "Tissue specificity: N/A" in prompt
        assert "Off-target risk: N/A" in prompt
        assert "Novelty: N/A" in prompt
        assert "Combined rank" not in prompt  # combined is only shown if present

    def test_minimal_spec_no_optional_fields(self):
        prompt = _build_prompt("ATGC", {"functional": 0.5}, MINIMAL_SPEC)

        assert "Design goal: coding" in prompt
        # These should NOT appear since they're None
        assert "Target gene:" not in prompt
        assert "Organism:" not in prompt
        assert "Target tissues:" not in prompt
        assert "Therapeutic context:" not in prompt


class TestScoreBasedFallback:
    def test_strong_candidate_exact_text(self):
        """Combined >= 0.7 + functional >= 0.7 → strong assessment + high functional."""
        scores = {"functional": 0.85, "combined": 0.80}
        chunks = _build_score_based_fallback(scores, BDNF_ENHANCER_SPEC)

        assert chunks[0] == "This candidate shows strong overall potential with a high combined score."
        assert chunks[1] == "Functional plausibility is high (0.85), suggesting the sequence maintains biologically coherent patterns."

    def test_weak_candidate_exact_text(self):
        """Combined < 0.4 + functional < 0.4 → below average + low functional."""
        scores = {"functional": 0.20, "combined": 0.25}
        chunks = _build_score_based_fallback(scores, MINIMAL_SPEC)

        assert chunks[0] == "This candidate scores below average and may require significant redesign."
        assert chunks[1] == "Functional plausibility is low (0.20), indicating potential disruption of essential sequence motifs."

    def test_moderate_candidate_exact_text(self):
        """Combined 0.4-0.7 → moderate assessment."""
        scores = {"combined": 0.55}
        chunks = _build_score_based_fallback(scores, MINIMAL_SPEC)

        assert chunks[0] == "This candidate has moderate potential — some dimensions score well while others may need optimization."

    def test_high_off_target_warning_exact_text(self):
        """Off-target >= 0.5 → BLAST warning."""
        scores = {"off_target": 0.65, "combined": 0.50}
        chunks = _build_score_based_fallback(scores, MINIMAL_SPEC)

        assert chunks[1] == "Elevated off-target risk (0.65) warrants BLAST analysis before wet lab validation."

    def test_low_off_target_positive_exact_text(self):
        """Off-target <= 0.2 → positive specificity note."""
        scores = {"off_target": 0.10, "combined": 0.70}
        chunks = _build_score_based_fallback(scores, MINIMAL_SPEC)

        assert chunks[1] == "Off-target risk is minimal (0.10), supporting sequence specificity."

    def test_tissue_specificity_with_brain_target(self):
        """High tissue specificity with targets → includes tissue name."""
        scores = {"tissue_specificity": 0.80, "combined": 0.60}
        chunks = _build_score_based_fallback(scores, BDNF_ENHANCER_SPEC)

        assert chunks[1] == "Tissue specificity score (0.80) indicates good alignment with requested expression profile for brain, hippocampus."

    def test_low_tissue_specificity_with_target(self):
        """Low tissue specificity → notes lack of regulatory elements."""
        scores = {"tissue_specificity": 0.20, "combined": 0.45}
        chunks = _build_score_based_fallback(scores, INSULIN_PROMOTER_SPEC)

        assert chunks[1] == "Low tissue specificity (0.20) suggests the sequence lacks tissue-selective regulatory elements for pancreatic beta cells."

    def test_empty_scores_produces_insufficient_message(self):
        """No scores at all → single insufficient message."""
        chunks = _build_score_based_fallback({}, MINIMAL_SPEC)

        assert len(chunks) == 1
        assert chunks[0] == "Scoring data is insufficient for a detailed mechanistic assessment."

    def test_full_realistic_assessment(self):
        """Real scenario: BDNF enhancer with mixed scores produces correct multi-chunk output."""
        scores = {
            "functional": 0.85,
            "tissue_specificity": 0.72,
            "off_target": 0.08,
            "novelty": 0.50,
            "combined": 0.71,
        }
        chunks = _build_score_based_fallback(scores, BDNF_ENHANCER_SPEC)

        assert len(chunks) == 4
        assert chunks[0] == "This candidate shows strong overall potential with a high combined score."
        assert chunks[1] == "Functional plausibility is high (0.85), suggesting the sequence maintains biologically coherent patterns."
        assert chunks[2] == "Tissue specificity score (0.72) indicates good alignment with requested expression profile for brain, hippocampus."
        assert chunks[3] == "Off-target risk is minimal (0.08), supporting sequence specificity."

    def test_mid_range_scores_produce_no_detail_chunks(self):
        """Scores in the middle range (not triggering any threshold) → only combined assessment."""
        scores = {
            "functional": 0.50,       # Not >= 0.7, not < 0.4
            "tissue_specificity": 0.45,  # Not >= 0.6, not < 0.3
            "off_target": 0.35,       # Not <= 0.2, not >= 0.5
            "novelty": 0.50,
            "combined": 0.55,
        }
        chunks = _build_score_based_fallback(scores, MINIMAL_SPEC)

        assert len(chunks) == 1
        assert chunks[0] == "This candidate has moderate potential — some dimensions score well while others may need optimization."

    def test_boundary_combined_0_7_is_strong(self):
        scores = {"combined": 0.70}
        chunks = _build_score_based_fallback(scores, MINIMAL_SPEC)
        assert "strong" in chunks[0]

    def test_boundary_combined_0_4_is_moderate(self):
        scores = {"combined": 0.40}
        chunks = _build_score_based_fallback(scores, MINIMAL_SPEC)
        assert "moderate" in chunks[0]

"""Tests for codon optimization service — real sequences, exact computed assertions.

Verifies:
- Amino acid sequence is always preserved after optimization
- CAI improves or stays the same
- Codon usage tables are internally consistent
- Motif preservation works
- Edge cases (short sequences, stop codons, all-optimal)
"""

from __future__ import annotations

import math
import pytest
from fastapi.testclient import TestClient

from main import app
from services.codon_optimization import (
    AA_TO_CODONS,
    ECOLI_USAGE,
    HUMAN_USAGE,
    MOUSE_USAGE,
    YEAST_USAGE,
    DROSOPHILA_USAGE,
    ORGANISM_TABLES,
    SUPPORTED_ORGANISMS,
    CodonOptimizationResult,
    compute_cai,
    optimize_codons,
    _best_codon_for_aa,
    _build_relative_adaptiveness,
    _gc_fraction,
)
from services.translation import CODON_TABLE, translate


# ---------------------------------------------------------------------------
# Real protein-coding sequences for testing
# ---------------------------------------------------------------------------

# GFP (Green Fluorescent Protein) first 90 bp — not optimized for any organism
GFP_WILD = "ATGAGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTTAATGGGCACAAATTTTCTGTCAGT"
# 90 bp = 30 codons

# Human insulin signal peptide (first 72 bp of human INS gene)
INSULIN_SIGNAL = "ATGGCCCTGTGGATGCGCCTCCTGCCCCTGCTGGCGCTGCTGGCCCTCTGGGGACCTGACCCAGCCGCA"
# 69 bp = 23 codons (last base truncated for testing remainder handling)

# E. coli lacZ first 60 bp — already somewhat E. coli optimized
LACZ_ECOLI = "ATGACCATGATTACGGATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAA"
# 54 bp = 18 codons


# ---------------------------------------------------------------------------
# Codon table consistency
# ---------------------------------------------------------------------------

class TestCodonTableConsistency:
    def test_all_64_codons_present_in_each_table(self):
        """Every usage table must have all 64 codons."""
        for organism, table in [
            ("human", HUMAN_USAGE),
            ("ecoli", ECOLI_USAGE),
            ("yeast", YEAST_USAGE),
            ("mouse", MOUSE_USAGE),
            ("drosophila", DROSOPHILA_USAGE),
        ]:
            assert len(table) == 64, f"{organism} table has {len(table)} codons"
            for codon in CODON_TABLE:
                assert codon in table, f"{organism} missing codon {codon}"

    def test_all_frequencies_positive(self):
        """No negative frequencies in any table."""
        for name, table in ORGANISM_TABLES.items():
            for codon, freq in table.items():
                assert freq >= 0.0, f"{name} has negative freq for {codon}: {freq}"

    def test_aa_to_codons_covers_all_amino_acids(self):
        """Every amino acid in the codon table has a reverse mapping."""
        all_aas = set(CODON_TABLE.values())
        for aa in all_aas:
            assert aa in AA_TO_CODONS
            assert len(AA_TO_CODONS[aa]) >= 1

    def test_methionine_has_only_atg(self):
        assert AA_TO_CODONS["M"] == ["ATG"]

    def test_tryptophan_has_only_tgg(self):
        assert AA_TO_CODONS["W"] == ["TGG"]

    def test_stop_codons_are_star(self):
        for codon in ["TAA", "TAG", "TGA"]:
            assert CODON_TABLE[codon] == "*"

    def test_leucine_has_six_codons(self):
        assert len(AA_TO_CODONS["L"]) == 6

    def test_supported_organisms_list(self):
        assert "homo_sapiens" in SUPPORTED_ORGANISMS
        assert "escherichia_coli" in SUPPORTED_ORGANISMS
        assert "saccharomyces_cerevisiae" in SUPPORTED_ORGANISMS


# ---------------------------------------------------------------------------
# Best codon selection
# ---------------------------------------------------------------------------

class TestBestCodon:
    def test_human_leucine_prefers_ctg(self):
        """CTG is the most frequent leucine codon in human (39.6/1000)."""
        best = _best_codon_for_aa("L", HUMAN_USAGE)
        assert best == "CTG"

    def test_ecoli_arginine_prefers_cgc(self):
        """CGC is the most frequent arginine codon in E. coli (21.5/1000)."""
        best = _best_codon_for_aa("R", ECOLI_USAGE)
        assert best == "CGC"

    def test_yeast_lysine_prefers_aaa(self):
        """AAA is the most frequent lysine codon in yeast (41.9/1000)."""
        best = _best_codon_for_aa("K", YEAST_USAGE)
        assert best == "AAA"

    def test_human_alanine_prefers_gcc(self):
        best = _best_codon_for_aa("A", HUMAN_USAGE)
        assert best == "GCC"

    def test_methionine_always_atg(self):
        """Met only has ATG — optimization can't change it."""
        for table in [HUMAN_USAGE, ECOLI_USAGE, YEAST_USAGE]:
            assert _best_codon_for_aa("M", table) == "ATG"


# ---------------------------------------------------------------------------
# CAI calculation
# ---------------------------------------------------------------------------

class TestCAI:
    def test_cai_range(self):
        """CAI must be in (0, 1]."""
        cai = compute_cai(GFP_WILD, HUMAN_USAGE)
        assert 0.0 < cai <= 1.0

    def test_perfectly_optimized_sequence_has_cai_1(self):
        """A sequence using only the best codon for each AA should have CAI = 1.0."""
        # Build a sequence that uses only the best human codon for each AA
        protein = "MAST"  # Met-Ala-Ser-Thr
        optimal = ""
        for aa in protein:
            optimal += _best_codon_for_aa(aa, HUMAN_USAGE)
        cai = compute_cai(optimal, HUMAN_USAGE)
        assert abs(cai - 1.0) < 1e-9

    def test_worst_codons_have_low_cai(self):
        """Using the worst codon for each AA should give a low CAI."""
        # Worst leucine in human: TTA (7.7)
        # Build a poly-leucine with worst codons
        worst_leu = "TTA" * 10  # 30 bp of worst-case leucine
        cai = compute_cai(worst_leu, HUMAN_USAGE)
        assert cai < 0.3

    def test_cai_reproducible(self):
        """Same sequence → same CAI."""
        c1 = compute_cai(GFP_WILD, ECOLI_USAGE)
        c2 = compute_cai(GFP_WILD, ECOLI_USAGE)
        assert c1 == c2

    def test_empty_sequence_cai_zero(self):
        assert compute_cai("", HUMAN_USAGE) == 0.0

    def test_stop_codons_excluded_from_cai(self):
        """Stop codons should not affect CAI calculation."""
        seq_with_stop = "ATGTAA"  # Met + Stop
        seq_met_only = "ATG"
        # Both should give CAI based only on ATG
        assert compute_cai(seq_with_stop, HUMAN_USAGE) == compute_cai(seq_met_only, HUMAN_USAGE)


# ---------------------------------------------------------------------------
# Core optimization
# ---------------------------------------------------------------------------

class TestOptimization:
    def test_amino_acid_preservation_gfp(self):
        """Optimization must NEVER change the amino acid sequence."""
        result = optimize_codons(GFP_WILD, "homo_sapiens")
        original_protein = translate(GFP_WILD, to_stop=False)
        optimized_protein = translate(result.optimized_sequence, to_stop=False)
        assert original_protein == optimized_protein
        assert result.amino_acid_sequence == original_protein

    def test_amino_acid_preservation_ecoli(self):
        result = optimize_codons(GFP_WILD, "e_coli")
        assert translate(result.optimized_sequence, to_stop=False) == translate(GFP_WILD, to_stop=False)

    def test_amino_acid_preservation_yeast(self):
        result = optimize_codons(GFP_WILD, "yeast")
        assert translate(result.optimized_sequence, to_stop=False) == translate(GFP_WILD, to_stop=False)

    def test_cai_improves_or_stays(self):
        """Optimization should always improve or maintain CAI."""
        result = optimize_codons(GFP_WILD, "homo_sapiens")
        assert result.optimized_cai >= result.original_cai

    def test_cai_improves_ecoli(self):
        result = optimize_codons(GFP_WILD, "e_coli")
        assert result.optimized_cai >= result.original_cai

    def test_sequence_lengths_match(self):
        result = optimize_codons(GFP_WILD, "homo_sapiens")
        assert len(result.optimized_sequence) == len(result.original_sequence)

    def test_codons_changed_count(self):
        """At least some codons should change for a wild-type sequence."""
        result = optimize_codons(GFP_WILD, "homo_sapiens")
        assert result.codons_changed > 0
        assert result.codons_changed <= result.total_codons

    def test_total_codons_correct(self):
        result = optimize_codons(GFP_WILD, "homo_sapiens")
        assert result.total_codons == len(GFP_WILD) // 3

    def test_already_optimal_no_changes(self):
        """If sequence already uses best codons, no changes should be made."""
        # Build a fully human-optimized sequence
        protein = "MASTKL"
        optimal = ""
        for aa in protein:
            optimal += _best_codon_for_aa(aa, HUMAN_USAGE)
        result = optimize_codons(optimal, "homo_sapiens")
        assert result.codons_changed == 0
        assert result.optimized_sequence == optimal
        assert result.optimized_cai == result.original_cai

    def test_organism_in_result(self):
        result = optimize_codons(GFP_WILD, "homo_sapiens")
        assert result.organism == "homo_sapiens"

    def test_organism_aliases(self):
        """Different aliases for same organism should produce same result."""
        r1 = optimize_codons(GFP_WILD, "homo_sapiens")
        r2 = optimize_codons(GFP_WILD, "human")
        assert r1.optimized_sequence == r2.optimized_sequence

    def test_gc_content_computed(self):
        result = optimize_codons(GFP_WILD, "homo_sapiens")
        assert 0.0 <= result.gc_content_before <= 1.0
        assert 0.0 <= result.gc_content_after <= 1.0

    def test_gc_content_matches_actual(self):
        result = optimize_codons(GFP_WILD, "homo_sapiens")
        expected_gc = _gc_fraction(result.optimized_sequence)
        assert result.gc_content_after == round(expected_gc, 4)


# ---------------------------------------------------------------------------
# Motif preservation
# ---------------------------------------------------------------------------

class TestMotifPreservation:
    def test_preserved_motif_not_altered(self):
        """Codons overlapping a preserved motif must not be changed."""
        # GFP has "ATG" at position 0 (start codon). Let's protect "AGTAAA" if found.
        # Use a known motif in GFP_WILD
        # Find a substring to protect
        motif = GFP_WILD[6:12]  # 6 bases starting at pos 6
        result = optimize_codons(GFP_WILD, "homo_sapiens", preserve_motifs=[motif])
        # The codons overlapping positions 6-11 must be unchanged
        # Codon boundaries: 6-8, 9-11
        assert result.optimized_sequence[6:12] == GFP_WILD[6:12]
        assert result.preserved_motif_count >= 1

    def test_preservation_still_maintains_amino_acids(self):
        result = optimize_codons(GFP_WILD, "homo_sapiens", preserve_motifs=["GGAGAA"])
        assert translate(result.optimized_sequence, to_stop=False) == translate(GFP_WILD, to_stop=False)

    def test_no_motifs_means_full_optimization(self):
        r_none = optimize_codons(GFP_WILD, "homo_sapiens", preserve_motifs=None)
        r_empty = optimize_codons(GFP_WILD, "homo_sapiens", preserve_motifs=[])
        assert r_none.optimized_sequence == r_empty.optimized_sequence

    def test_nonexistent_motif_ignored(self):
        result = optimize_codons(GFP_WILD, "homo_sapiens", preserve_motifs=["ZZZZZZZ"])
        assert result.preserved_motif_count == 0


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_minimum_sequence(self):
        """Single codon (3 bp) should work."""
        result = optimize_codons("ATG", "homo_sapiens")
        assert result.optimized_sequence == "ATG"
        assert result.total_codons == 1
        assert result.codons_changed == 0

    def test_sequence_with_stop_codon(self):
        """Stop codons should be preserved as-is."""
        seq = "ATGTAA"  # Met + Stop
        result = optimize_codons(seq, "homo_sapiens")
        assert result.optimized_sequence == "ATGTAA"
        assert result.codons_changed == 0

    def test_sequence_not_multiple_of_3(self):
        """Trailing bases should be preserved."""
        seq = "ATGAAAG"  # 7 bp = 2 codons + 1 trailing
        result = optimize_codons(seq, "homo_sapiens")
        assert len(result.optimized_sequence) == 7
        assert result.optimized_sequence[-1] == "G"

    def test_unsupported_organism_raises(self):
        with pytest.raises(ValueError, match="Unsupported organism"):
            optimize_codons("ATG", "alien_species")

    def test_too_short_raises(self):
        with pytest.raises(ValueError, match="at least 3"):
            optimize_codons("AT", "homo_sapiens")

    def test_all_organisms_produce_valid_results(self):
        """Every supported organism should produce a valid optimization."""
        for org in SUPPORTED_ORGANISMS:
            result = optimize_codons(GFP_WILD, org)
            assert result.optimized_cai >= result.original_cai
            assert translate(result.optimized_sequence, to_stop=False) == translate(GFP_WILD, to_stop=False)

    def test_different_organisms_produce_different_optimizations(self):
        """Human and E. coli have different codon preferences → different outputs."""
        human = optimize_codons(GFP_WILD, "homo_sapiens")
        ecoli = optimize_codons(GFP_WILD, "e_coli")
        assert human.optimized_sequence != ecoli.optimized_sequence


# ---------------------------------------------------------------------------
# Relative adaptiveness
# ---------------------------------------------------------------------------

class TestRelativeAdaptiveness:
    def test_best_codon_has_w_1(self):
        """The best codon for each AA should have w = 1.0."""
        w = _build_relative_adaptiveness(HUMAN_USAGE)
        for aa, codons in AA_TO_CODONS.items():
            if aa == "*":
                continue
            freqs = [HUMAN_USAGE.get(c, 0.0) for c in codons]
            best_codon = codons[freqs.index(max(freqs))]
            assert abs(w[best_codon] - 1.0) < 1e-9, f"w({best_codon}) for {aa} should be 1.0"

    def test_w_values_in_range(self):
        """All w values should be in (0, 1]."""
        w = _build_relative_adaptiveness(HUMAN_USAGE)
        for codon, val in w.items():
            assert 0.0 < val <= 1.0, f"w({codon}) = {val} out of range"


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

class TestCodonOptimizationAPI:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_basic_optimization(self, client):
        res = client.post("/api/optimize/codons", json={
            "sequence": GFP_WILD,
            "organism": "homo_sapiens",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["organism"] == "homo_sapiens"
        assert body["optimized_cai"] >= body["original_cai"]
        assert body["codons_changed"] > 0
        # Verify amino acid preserved
        assert translate(body["optimized_sequence"], to_stop=False) == translate(GFP_WILD, to_stop=False)

    def test_ecoli_optimization(self, client):
        res = client.post("/api/optimize/codons", json={
            "sequence": GFP_WILD,
            "organism": "e_coli",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["organism"] == "e_coli"

    def test_with_motif_preservation(self, client):
        res = client.post("/api/optimize/codons", json={
            "sequence": GFP_WILD,
            "organism": "homo_sapiens",
            "preserve_motifs": ["GGAGAA"],
        })
        assert res.status_code == 200
        body = res.json()
        # Motif must still be present in optimized sequence
        assert "GGAGAA" in body["optimized_sequence"]

    def test_unsupported_organism_422(self, client):
        res = client.post("/api/optimize/codons", json={
            "sequence": "ATGATGATG",
            "organism": "alien",
        })
        assert res.status_code == 422

    def test_invalid_sequence_422(self, client):
        res = client.post("/api/optimize/codons", json={
            "sequence": "XYZXYZ",
            "organism": "homo_sapiens",
        })
        assert res.status_code == 422

    def test_response_shape(self, client):
        res = client.post("/api/optimize/codons", json={
            "sequence": "ATGAAAGCC",
            "organism": "homo_sapiens",
        })
        assert res.status_code == 200
        body = res.json()
        expected_keys = {
            "original_sequence", "optimized_sequence", "organism",
            "original_cai", "optimized_cai", "amino_acid_sequence",
            "codons_changed", "total_codons",
            "gc_content_before", "gc_content_after", "preserved_motif_count",
        }
        assert set(body.keys()) == expected_keys

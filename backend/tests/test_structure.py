"""Tests for ESMFold structure prediction service."""

import asyncio
import pytest
from services.structure import (
    predict_structure,
    StructurePrediction,
    _extract_mean_plddt,
    _extract_pdb_text,
    _has_backbone_atoms,
)


class TestExtractMeanPlddt:
    def test_parses_b_factors(self):
        pdb = (
            "ATOM      1  N   MET A   1       1.000   2.000   3.000  1.00 85.00           N\n"
            "ATOM      2  CA  MET A   1       2.000   3.000   4.000  1.00 90.00           C\n"
            "END\n"
        )
        result = _extract_mean_plddt(pdb)
        assert abs(result - 0.875) < 0.001  # (85 + 90) / 2 / 100

    def test_empty_pdb_returns_zero(self):
        assert _extract_mean_plddt("") == 0.0

    def test_no_atom_lines_returns_zero(self):
        assert _extract_mean_plddt("HEADER\nEND\n") == 0.0

    def test_handles_normalized_plddt_values(self):
        pdb = (
            "ATOM      1  N   MET A   1       1.000   2.000   3.000  1.00  0.85           N\n"
            "ATOM      2  CA  MET A   1       2.000   3.000   4.000  1.00  0.90           C\n"
            "END\n"
        )
        result = _extract_mean_plddt(pdb)
        assert abs(result - 0.875) < 0.001


class TestPdbExtraction:
    def test_extracts_fenced_pdb_payload(self):
        raw = """Here is your fold:
```pdb
HEADER    TEST
ATOM      1  N   MET A   1       1.000   2.000   3.000  1.00 90.00           N
ATOM      2  CA  MET A   1       2.000   3.000   4.000  1.00 90.00           C
ATOM      3  C   MET A   1       3.000   4.000   5.000  1.00 90.00           C
ATOM      4  O   MET A   1       4.000   5.000   6.000  1.00 90.00           O
END
```"""
        pdb = _extract_pdb_text(raw)
        assert pdb.startswith("HEADER")
        assert "ATOM" in pdb
        assert pdb.splitlines()[-1] == "END"

    def test_backbone_detector_requires_core_atoms(self):
        good = "\n".join(
            [
                "ATOM      1  N   MET A   1       1.000   2.000   3.000  1.00 90.00           N",
                "ATOM      2  CA  MET A   1       2.000   3.000   4.000  1.00 90.00           C",
                "ATOM      3  C   MET A   1       3.000   4.000   5.000  1.00 90.00           C",
                "ATOM      4  O   MET A   1       4.000   5.000   6.000  1.00 90.00           O",
            ]
            * 6
        )
        bad = "\n".join(
            [
                "ATOM      1  CA  MET A   1       2.000   3.000   4.000  1.00 90.00           C",
                "ATOM      2  CB  MET A   1       2.100   3.100   4.100  1.00 90.00           C",
            ]
            * 12
        )
        assert _has_backbone_atoms(good) is True
        assert _has_backbone_atoms(bad) is False


class TestPredictStructure:
    def test_returns_structure_prediction(self):
        # ATG (M) start codon + enough codons for a real protein
        dna = "ATGGCTGATTCAGATCTTGCTACCAAAGCAGCTGCAATGGCTGATCTTGCTACCAAAGCATAA"
        result = asyncio.run(predict_structure(dna))
        if result is not None:  # API may be down
            assert isinstance(result, StructurePrediction)
            assert result.model == "esmfold"
            assert "ATOM" in result.pdb_data
            assert 0.0 <= result.confidence <= 1.0
            assert len(result.protein_sequence) >= 10

    def test_with_region(self):
        dna = "NNNNNN" + "ATGGCTGATTCAGATCTTGCTACCAAAGCAGCTGCAATGGCTGATCTTGCTACCAAAGCATAA" + "NNNNNN"
        result = asyncio.run(predict_structure(dna, region_start=6, region_end=6+63))
        if result is not None:
            assert isinstance(result, StructurePrediction)

    def test_short_protein_returns_none(self):
        dna = "ATGGCTTAA"
        result = asyncio.run(predict_structure(dna))
        assert result is None

    def test_empty_sequence_returns_none(self):
        result = asyncio.run(predict_structure(""))
        assert result is None

    def test_no_start_codon_returns_none(self):
        # 9 TTT codons = 9 F residues, below MIN_PROTEIN_LENGTH of 10
        dna = "TTTTTTTTTTTTTTTTTTTTTTTTT"
        result = asyncio.run(predict_structure(dna))
        assert result is None

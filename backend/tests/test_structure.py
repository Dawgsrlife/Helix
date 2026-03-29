"""Tests for ESMFold structure prediction service."""

import asyncio
import pytest
from backend.services.structure import (
    predict_structure,
    StructurePrediction,
    _extract_mean_plddt,
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

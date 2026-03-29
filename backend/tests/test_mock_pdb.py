"""Tests for synthetic demo PDB generation."""

from services.mock_pdb import build_mock_pdb_from_dna


def test_mock_pdb_has_backbone_atoms_and_reasonable_size() -> None:
    dna = "ATGGCTGATTCAGATCTTGCTACCAAAGCAGCTGCAATGGCTGATCTTGCTACCAAAGCATAA"
    pdb, confidence = build_mock_pdb_from_dna(dna, candidate_id=3)

    atom_lines = [line for line in pdb.splitlines() if line.startswith("ATOM")]
    assert len(atom_lines) >= 80, "Fallback structure should look substantial, not like a 5-atom toy."
    atom_names = {line[12:16].strip() for line in atom_lines}
    assert "CA" in atom_names
    assert "N" in atom_names
    assert "C" in atom_names
    assert "O" in atom_names
    assert 0.6 <= confidence <= 0.95


def test_mock_pdb_short_sequence_is_padded_for_visual_quality() -> None:
    pdb, confidence = build_mock_pdb_from_dna("ATGTAA", candidate_id=0)
    atom_lines = [line for line in pdb.splitlines() if line.startswith("ATOM")]
    assert len(atom_lines) >= 80
    assert confidence > 0

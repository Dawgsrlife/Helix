"""Tests for DNA translation and sequence utilities."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.translation import (
    dinucleotide_freq,
    find_motif,
    find_orfs,
    gc_content,
    reverse_complement,
    translate,
    validate_sequence,
)


class TestValidation:
    def test_valid_sequence(self) -> None:
        assert validate_sequence("ATcgN") == "ATCGN"

    def test_strips_whitespace(self) -> None:
        assert validate_sequence("AT CG\nTT") == "ATCGTT"

    def test_rejects_invalid_chars(self) -> None:
        import pytest

        with pytest.raises(ValueError, match="Invalid nucleotides"):
            validate_sequence("ATXYZ")


class TestReverseComplement:
    def test_basic(self) -> None:
        assert reverse_complement("ATCG") == "CGAT"

    def test_palindrome(self) -> None:
        assert reverse_complement("AATT") == "AATT"

    def test_single_base(self) -> None:
        assert reverse_complement("A") == "T"

    def test_handles_n(self) -> None:
        assert reverse_complement("ANC") == "GNT"

    def test_empty(self) -> None:
        assert reverse_complement("") == ""


class TestTranslate:
    def test_start_codon(self) -> None:
        assert translate("ATG") == "M"

    def test_stop_codon_to_stop(self) -> None:
        assert translate("ATGTAA", to_stop=True) == "M"

    def test_stop_codon_without_flag(self) -> None:
        assert translate("ATGTAA") == "M*"

    def test_known_protein(self) -> None:
        # Met-Asp-Leu-Ser (ATGGATTTATCT)
        assert translate("ATGGATTTATCT") == "MDLS"

    def test_partial_codon_ignored(self) -> None:
        assert translate("ATGGA") == "M"  # GA is incomplete

    def test_empty(self) -> None:
        assert translate("") == ""


class TestFindORFs:
    def test_finds_simple_orf(self) -> None:
        # ATG + 33 coding nucleotides + TAA = 39 nt total
        seq = "ATG" + "GCT" * 11 + "TAA"
        orfs = find_orfs(seq, min_length=30)
        assert len(orfs) >= 1
        assert orfs[0].start == 0
        assert orfs[0].protein.startswith("M")

    def test_respects_min_length(self) -> None:
        seq = "ATG" + "GCT" * 5 + "TAA"  # 21 nt
        orfs = find_orfs(seq, min_length=30)
        assert len(orfs) == 0

    def test_finds_multiple_orfs(self) -> None:
        orf1 = "ATG" + "GCT" * 15 + "TAA"
        orf2 = "ATG" + "GCC" * 15 + "TAG"
        seq = orf1 + "NNNN" + orf2
        orfs = find_orfs(seq, min_length=30)
        assert len(orfs) >= 2

    def test_empty_sequence(self) -> None:
        assert find_orfs("") == []


class TestGCContent:
    def test_pure_gc(self) -> None:
        assert gc_content("GCGCGC") == 1.0

    def test_pure_at(self) -> None:
        assert gc_content("ATATAT") == 0.0

    def test_balanced(self) -> None:
        assert abs(gc_content("ATCG") - 0.5) < 1e-6

    def test_empty(self) -> None:
        assert gc_content("") == 0.0


class TestDinucleotideFreq:
    def test_simple(self) -> None:
        freq = dinucleotide_freq("ATAT")
        assert "AT" in freq
        assert "TA" in freq

    def test_skips_n(self) -> None:
        freq = dinucleotide_freq("ANTT")
        assert "AN" not in freq
        assert "NT" not in freq
        assert "TT" in freq

    def test_empty(self) -> None:
        assert dinucleotide_freq("") == {}


class TestFindMotif:
    def test_finds_tata_box(self) -> None:
        seq = "GGGTATAAAGGG"
        pos = find_motif(seq, "TATAAA")
        assert pos == [3]

    def test_multiple_hits(self) -> None:
        seq = "ATGATGATG"
        pos = find_motif(seq, "ATG")
        assert pos == [0, 3, 6]

    def test_no_hit(self) -> None:
        assert find_motif("AAAA", "GGG") == []

    def test_case_insensitive(self) -> None:
        pos = find_motif("atgatg", "ATG")
        assert pos == [0, 3]

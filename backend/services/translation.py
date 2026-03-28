"""DNA sequence utilities — translation, ORF finding, composition analysis.

Pure computation, no external dependencies. Used by the scoring pipeline
and the AlphaFold integration (DNA -> protein before folding).
"""

from __future__ import annotations

from dataclasses import dataclass

# Standard genetic code (RNA codons mapped from DNA)
CODON_TABLE: dict[str, str] = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L",
    "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L",
    "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M",
    "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V",
    "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S",
    "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
    "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T",
    "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A",
    "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*",
    "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q",
    "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K",
    "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
    "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W",
    "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
    "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R",
    "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
}

STOP_CODONS = frozenset(("TAA", "TAG", "TGA"))
START_CODON = "ATG"

COMPLEMENT: dict[str, str] = {"A": "T", "T": "A", "C": "G", "G": "C", "N": "N"}


@dataclass(frozen=True)
class ORF:
    """An open reading frame found in a sequence."""

    start: int  # 0-indexed, inclusive
    end: int  # exclusive (includes stop codon)
    frame: int  # 0, 1, or 2
    strand: str  # "+" or "-"
    protein: str  # translated amino acid sequence


def validate_sequence(seq: str) -> str:
    """Uppercase, strip whitespace, validate characters."""
    cleaned = seq.upper().replace(" ", "").replace("\n", "").replace("\r", "")
    valid = set("ATCGN")
    bad = set(cleaned) - valid
    if bad:
        raise ValueError(f"Invalid nucleotides: {bad}")
    return cleaned


def reverse_complement(seq: str) -> str:
    """Return the reverse complement of a DNA sequence."""
    return "".join(COMPLEMENT.get(b, "N") for b in reversed(seq.upper()))


def translate(dna: str, to_stop: bool = False) -> str:
    """Translate a DNA sequence to protein.

    Args:
        dna: DNA sequence (length should be multiple of 3 for clean translation)
        to_stop: If True, stop at the first stop codon
    """
    dna = dna.upper()
    protein: list[str] = []
    for i in range(0, len(dna) - 2, 3):
        codon = dna[i : i + 3]
        aa = CODON_TABLE.get(codon, "X")  # X for unknown
        if aa == "*" and to_stop:
            break
        protein.append(aa)
    return "".join(protein)


def find_orfs(seq: str, min_length: int = 100) -> list[ORF]:
    """Find all open reading frames in both strands.

    Args:
        seq: DNA sequence
        min_length: Minimum ORF length in nucleotides (not amino acids)

    Returns:
        List of ORFs sorted by length (longest first)
    """
    seq = seq.upper()
    orfs: list[ORF] = []

    for strand, s in [("+", seq), ("-", reverse_complement(seq))]:
        for frame in range(3):
            i = frame
            while i < len(s) - 2:
                codon = s[i : i + 3]
                if codon == START_CODON:
                    # Scan for stop codon
                    for j in range(i + 3, len(s) - 2, 3):
                        stop_codon = s[j : j + 3]
                        if stop_codon in STOP_CODONS:
                            orf_len = j + 3 - i
                            if orf_len >= min_length:
                                protein = translate(s[i : j + 3], to_stop=True)
                                # Map coordinates back to original strand
                                if strand == "+":
                                    start, end = i, j + 3
                                else:
                                    start = len(seq) - (j + 3)
                                    end = len(seq) - i
                                orfs.append(ORF(
                                    start=start,
                                    end=end,
                                    frame=frame,
                                    strand=strand,
                                    protein=protein,
                                ))
                            break
                i += 3

    orfs.sort(key=lambda o: o.end - o.start, reverse=True)
    return orfs


def gc_content(seq: str) -> float:
    """Calculate GC content as a fraction [0, 1]."""
    seq = seq.upper()
    if not seq:
        return 0.0
    gc = sum(1 for b in seq if b in ("G", "C"))
    return gc / len(seq)


def dinucleotide_freq(seq: str) -> dict[str, float]:
    """Calculate dinucleotide frequencies."""
    seq = seq.upper()
    counts: dict[str, int] = {}
    total = 0
    for i in range(len(seq) - 1):
        di = seq[i : i + 2]
        if "N" not in di:
            counts[di] = counts.get(di, 0) + 1
            total += 1
    if total == 0:
        return {}
    return {k: v / total for k, v in sorted(counts.items())}


def find_motif(seq: str, motif: str) -> list[int]:
    """Find all occurrences of a motif in a sequence. Returns start positions."""
    seq = seq.upper()
    motif = motif.upper()
    positions: list[int] = []
    start = 0
    while True:
        idx = seq.find(motif, start)
        if idx == -1:
            break
        positions.append(idx)
        start = idx + 1
    return positions

"""Codon optimization service — organism-specific codon usage optimization.

Replaces rare codons with high-frequency synonymous codons for a target
organism while preserving the amino acid sequence exactly. Computes
Codon Adaptation Index (CAI) before and after optimization.

Codon usage tables sourced from the Codon Usage Database
(https://www.kazusa.or.jp/codon/) — frequencies per thousand codons.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from services.translation import CODON_TABLE, STOP_CODONS, translate


# ---------------------------------------------------------------------------
# Codon usage tables — frequency per 1000 codons
# Sources: Kazusa Codon Usage Database
# ---------------------------------------------------------------------------

# Homo sapiens (human) — from CDS of 93487 sequences
HUMAN_USAGE: dict[str, float] = {
    "TTT": 17.6, "TTC": 20.3, "TTA": 7.7,  "TTG": 12.9,
    "CTT": 13.2, "CTC": 19.6, "CTA": 7.2,  "CTG": 39.6,
    "ATT": 16.0, "ATC": 20.8, "ATA": 7.5,  "ATG": 22.0,
    "GTT": 11.0, "GTC": 14.5, "GTA": 7.1,  "GTG": 28.1,
    "TCT": 15.2, "TCC": 17.7, "TCA": 12.2, "TCG": 4.4,
    "CCT": 17.5, "CCC": 19.8, "CCA": 16.9, "CCG": 6.9,
    "ACT": 13.1, "ACC": 18.9, "ACA": 15.1, "ACG": 6.1,
    "GCT": 18.4, "GCC": 27.7, "GCA": 15.8, "GCG": 7.4,
    "TAT": 12.2, "TAC": 15.3, "TAA": 1.0,  "TAG": 0.8,
    "CAT": 10.9, "CAC": 15.1, "CAA": 12.3, "CAG": 34.2,
    "AAT": 17.0, "AAC": 19.1, "AAA": 24.4, "AAG": 31.9,
    "GAT": 21.8, "GAC": 25.1, "GAA": 29.0, "GAG": 39.6,
    "TGT": 10.6, "TGC": 12.6, "TGA": 1.6,  "TGG": 13.2,
    "CGT": 4.5,  "CGC": 10.4, "CGA": 6.2,  "CGG": 11.4,
    "AGT": 12.1, "AGC": 19.5, "AGA": 12.2, "AGG": 12.0,
    "GGT": 10.8, "GGC": 22.2, "GGA": 16.5, "GGG": 16.5,
}

# Escherichia coli K12 — from CDS of 4290 sequences
ECOLI_USAGE: dict[str, float] = {
    "TTT": 22.4, "TTC": 16.3, "TTA": 13.8, "TTG": 13.6,
    "CTT": 11.4, "CTC": 11.0, "CTA": 3.9,  "CTG": 52.1,
    "ATT": 30.1, "ATC": 24.6, "ATA": 4.6,  "ATG": 27.6,
    "GTT": 18.3, "GTC": 15.2, "GTA": 10.8, "GTG": 26.3,
    "TCT": 8.5,  "TCC": 8.5,  "TCA": 7.3,  "TCG": 8.8,
    "CCT": 7.0,  "CCC": 5.5,  "CCA": 8.4,  "CCG": 23.0,
    "ACT": 8.9,  "ACC": 23.0, "ACA": 7.1,  "ACG": 14.4,
    "GCT": 15.4, "GCC": 25.5, "GCA": 20.0, "GCG": 33.3,
    "TAT": 16.3, "TAC": 12.2, "TAA": 2.0,  "TAG": 0.3,
    "CAT": 12.8, "CAC": 9.4,  "CAA": 15.2, "CAG": 28.8,
    "AAT": 18.3, "AAC": 21.4, "AAA": 33.6, "AAG": 10.4,
    "GAT": 32.4, "GAC": 19.1, "GAA": 39.4, "GAG": 18.0,
    "TGT": 5.2,  "TGC": 6.5,  "TGA": 1.0,  "TGG": 15.2,
    "CGT": 20.9, "CGC": 21.5, "CGA": 3.6,  "CGG": 5.6,
    "AGT": 8.8,  "AGC": 16.0, "AGA": 2.1,  "AGG": 1.2,
    "GGT": 24.5, "GGC": 28.9, "GGA": 8.0,  "GGG": 11.3,
}

# Saccharomyces cerevisiae (baker's yeast) — from CDS of 6185 sequences
YEAST_USAGE: dict[str, float] = {
    "TTT": 26.1, "TTC": 18.2, "TTA": 26.2, "TTG": 27.2,
    "CTT": 12.3, "CTC": 5.4,  "CTA": 13.4, "CTG": 10.5,
    "ATT": 30.1, "ATC": 17.2, "ATA": 17.8, "ATG": 20.9,
    "GTT": 22.1, "GTC": 11.8, "GTA": 11.8, "GTG": 10.8,
    "TCT": 23.5, "TCC": 14.2, "TCA": 18.7, "TCG": 8.6,
    "CCT": 13.5, "CCC": 6.8,  "CCA": 18.3, "CCG": 5.3,
    "ACT": 20.3, "ACC": 12.7, "ACA": 17.8, "ACG": 8.0,
    "GCT": 21.2, "GCC": 12.6, "GCA": 16.2, "GCG": 6.2,
    "TAT": 18.8, "TAC": 14.8, "TAA": 1.1,  "TAG": 0.5,
    "CAT": 13.7, "CAC": 7.8,  "CAA": 27.3, "CAG": 12.1,
    "AAT": 36.0, "AAC": 24.8, "AAA": 41.9, "AAG": 30.8,
    "GAT": 37.6, "GAC": 20.2, "GAA": 45.6, "GAG": 19.2,
    "TGT": 8.1,  "TGC": 4.8,  "TGA": 0.7,  "TGG": 10.4,
    "CGT": 6.4,  "CGC": 2.6,  "CGA": 3.0,  "CGG": 1.7,
    "AGT": 14.2, "AGC": 9.8,  "AGA": 21.3, "AGG": 9.2,
    "GGT": 23.9, "GGC": 9.8,  "GGA": 10.9, "GGG": 6.0,
}

# Mus musculus (mouse)
MOUSE_USAGE: dict[str, float] = {
    "TTT": 17.2, "TTC": 20.3, "TTA": 7.1,  "TTG": 12.6,
    "CTT": 12.8, "CTC": 19.5, "CTA": 7.8,  "CTG": 39.4,
    "ATT": 15.8, "ATC": 20.8, "ATA": 7.5,  "ATG": 22.3,
    "GTT": 10.9, "GTC": 14.6, "GTA": 7.0,  "GTG": 28.2,
    "TCT": 14.9, "TCC": 17.5, "TCA": 11.7, "TCG": 4.4,
    "CCT": 17.8, "CCC": 19.2, "CCA": 16.7, "CCG": 6.7,
    "ACT": 12.9, "ACC": 19.0, "ACA": 15.0, "ACG": 6.0,
    "GCT": 18.6, "GCC": 27.6, "GCA": 15.5, "GCG": 7.3,
    "TAT": 12.2, "TAC": 15.6, "TAA": 0.9,  "TAG": 0.7,
    "CAT": 10.4, "CAC": 15.0, "CAA": 11.6, "CAG": 34.4,
    "AAT": 16.7, "AAC": 19.4, "AAA": 24.3, "AAG": 32.9,
    "GAT": 22.0, "GAC": 25.5, "GAA": 28.4, "GAG": 39.7,
    "TGT": 10.3, "TGC": 12.9, "TGA": 1.5,  "TGG": 13.1,
    "CGT": 4.6,  "CGC": 10.2, "CGA": 6.3,  "CGG": 11.5,
    "AGT": 11.8, "AGC": 19.4, "AGA": 11.7, "AGG": 11.6,
    "GGT": 10.9, "GGC": 22.4, "GGA": 16.3, "GGG": 16.3,
}

# Drosophila melanogaster (fruit fly)
DROSOPHILA_USAGE: dict[str, float] = {
    "TTT": 11.3, "TTC": 23.3, "TTA": 5.5,  "TTG": 14.2,
    "CTT": 10.5, "CTC": 14.1, "CTA": 6.1,  "CTG": 28.9,
    "ATT": 15.2, "ATC": 23.2, "ATA": 6.2,  "ATG": 22.2,
    "GTT": 12.5, "GTC": 17.0, "GTA": 5.7,  "GTG": 26.8,
    "TCT": 8.8,  "TCC": 17.3, "TCA": 8.0,  "TCG": 11.9,
    "CCT": 10.5, "CCC": 17.5, "CCA": 15.2, "CCG": 10.2,
    "ACT": 10.7, "ACC": 22.5, "ACA": 11.7, "ACG": 9.3,
    "GCT": 14.3, "GCC": 29.2, "GCA": 13.2, "GCG": 10.2,
    "TAT": 9.7,  "TAC": 16.8, "TAA": 1.1,  "TAG": 0.5,
    "CAT": 8.5,  "CAC": 14.8, "CAA": 14.9, "CAG": 28.5,
    "AAT": 14.6, "AAC": 22.0, "AAA": 19.3, "AAG": 34.0,
    "GAT": 21.0, "GAC": 27.2, "GAA": 24.5, "GAG": 36.0,
    "TGT": 7.0,  "TGC": 11.6, "TGA": 0.8,  "TGG": 13.5,
    "CGT": 8.1,  "CGC": 14.4, "CGA": 8.5,  "CGG": 8.5,
    "AGT": 8.2,  "AGC": 15.0, "AGA": 5.9,  "AGG": 5.9,
    "GGT": 13.8, "GGC": 22.5, "GGA": 16.0, "GGG": 10.1,
}

ORGANISM_TABLES: dict[str, dict[str, float]] = {
    "homo_sapiens": HUMAN_USAGE,
    "human": HUMAN_USAGE,
    "escherichia_coli": ECOLI_USAGE,
    "e_coli": ECOLI_USAGE,
    "ecoli": ECOLI_USAGE,
    "saccharomyces_cerevisiae": YEAST_USAGE,
    "yeast": YEAST_USAGE,
    "mus_musculus": MOUSE_USAGE,
    "mouse": MOUSE_USAGE,
    "drosophila_melanogaster": DROSOPHILA_USAGE,
    "drosophila": DROSOPHILA_USAGE,
}

SUPPORTED_ORGANISMS = sorted({
    "homo_sapiens", "escherichia_coli", "saccharomyces_cerevisiae",
    "mus_musculus", "drosophila_melanogaster",
})


# ---------------------------------------------------------------------------
# Derived lookup tables
# ---------------------------------------------------------------------------

def _build_aa_to_codons() -> dict[str, list[str]]:
    """Map each amino acid to all codons that encode it."""
    aa_map: dict[str, list[str]] = {}
    for codon, aa in CODON_TABLE.items():
        aa_map.setdefault(aa, []).append(codon)
    return aa_map

AA_TO_CODONS = _build_aa_to_codons()


def _best_codon_for_aa(aa: str, usage: dict[str, float]) -> str:
    """Return the highest-frequency codon for an amino acid."""
    codons = AA_TO_CODONS.get(aa, [])
    if not codons:
        raise ValueError(f"No codons found for amino acid '{aa}'")
    return max(codons, key=lambda c: usage.get(c, 0.0))


def _build_relative_adaptiveness(usage: dict[str, float]) -> dict[str, float]:
    """Compute relative adaptiveness w(c) = freq(c) / max_freq_for_same_aa.

    Used for CAI calculation. w(c) is in (0, 1] for each codon.
    """
    w: dict[str, float] = {}
    for aa, codons in AA_TO_CODONS.items():
        if aa == "*":
            continue
        freqs = [usage.get(c, 0.0) for c in codons]
        max_freq = max(freqs)
        if max_freq == 0:
            for c in codons:
                w[c] = 1.0  # no usage data → treat as equal
        else:
            for c in codons:
                w[c] = max(usage.get(c, 0.0) / max_freq, 0.001)  # floor to avoid log(0)
    return w


# ---------------------------------------------------------------------------
# CAI calculation
# ---------------------------------------------------------------------------

def compute_cai(dna: str, usage: dict[str, float]) -> float:
    """Compute the Codon Adaptation Index for a DNA sequence.

    CAI = geometric mean of relative adaptiveness values for all codons.
    Range: (0, 1]. Higher = better adapted to the organism.

    Only considers sense codons (excludes stop codons).
    """
    dna = dna.upper()
    w = _build_relative_adaptiveness(usage)

    log_sum = 0.0
    count = 0
    for i in range(0, len(dna) - 2, 3):
        codon = dna[i:i + 3]
        if codon in STOP_CODONS:
            continue
        if codon in w:
            log_sum += math.log(w[codon])
            count += 1

    if count == 0:
        return 0.0
    return math.exp(log_sum / count)


# ---------------------------------------------------------------------------
# Optimization
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CodonOptimizationResult:
    original_sequence: str
    optimized_sequence: str
    organism: str
    original_cai: float
    optimized_cai: float
    amino_acid_sequence: str
    codons_changed: int
    total_codons: int
    gc_content_before: float
    gc_content_after: float
    preserved_motif_count: int


def _gc_fraction(seq: str) -> float:
    if not seq:
        return 0.0
    gc = sum(1 for b in seq.upper() if b in ("G", "C"))
    return gc / len(seq)


def optimize_codons(
    dna: str,
    organism: str = "homo_sapiens",
    preserve_motifs: list[str] | None = None,
) -> CodonOptimizationResult:
    """Optimize codon usage for a target organism.

    Args:
        dna: Protein-coding DNA sequence (should be multiple of 3).
              Does NOT need to start with ATG or end with a stop codon.
        organism: Target organism key (see SUPPORTED_ORGANISMS).
        preserve_motifs: DNA motif sequences that must not be altered.
                        If a codon falls within a motif, it is left unchanged.

    Returns:
        CodonOptimizationResult with before/after sequences, CAI, and stats.

    Raises:
        ValueError: If organism is not supported or sequence has invalid length.
    """
    dna = dna.upper()
    organism_key = organism.lower().replace(" ", "_")

    usage = ORGANISM_TABLES.get(organism_key)
    if usage is None:
        raise ValueError(
            f"Unsupported organism '{organism}'. "
            f"Supported: {', '.join(SUPPORTED_ORGANISMS)}"
        )

    if len(dna) < 3:
        raise ValueError("Sequence must be at least 3 nucleotides (one codon)")

    # Identify positions protected by motifs
    protected_positions: set[int] = set()
    preserved_count = 0
    for motif in (preserve_motifs or []):
        motif = motif.upper()
        start = 0
        while True:
            idx = dna.find(motif, start)
            if idx == -1:
                break
            for pos in range(idx, idx + len(motif)):
                protected_positions.add(pos)
            preserved_count += 1
            start = idx + 1

    # Translate to get the amino acid sequence
    protein = translate(dna, to_stop=False)

    # Build optimized sequence codon by codon
    optimized_codons: list[str] = []
    codons_changed = 0
    total_codons = 0

    for i in range(0, len(dna) - 2, 3):
        codon = dna[i:i + 3]
        aa = CODON_TABLE.get(codon, "X")
        total_codons += 1

        if aa == "*":
            # Keep stop codons as-is
            optimized_codons.append(codon)
            continue

        if aa == "X":
            # Unknown codon (contains N or invalid) — keep as-is
            optimized_codons.append(codon)
            continue

        # Check if any position in this codon is protected
        codon_positions = set(range(i, i + 3))
        if codon_positions & protected_positions:
            optimized_codons.append(codon)
            continue

        best = _best_codon_for_aa(aa, usage)
        if best != codon:
            codons_changed += 1
        optimized_codons.append(best)

    optimized_dna = "".join(optimized_codons)
    # Append any trailing bases that don't form a complete codon
    remainder = len(dna) % 3
    if remainder:
        optimized_dna += dna[-remainder:]

    # Verify amino acid preservation
    optimized_protein = translate(optimized_dna, to_stop=False)
    assert optimized_protein == protein, (
        f"BUG: optimization changed amino acid sequence! "
        f"Original: {protein[:20]}... Optimized: {optimized_protein[:20]}..."
    )

    original_cai = compute_cai(dna, usage)
    optimized_cai = compute_cai(optimized_dna, usage)

    return CodonOptimizationResult(
        original_sequence=dna,
        optimized_sequence=optimized_dna,
        organism=organism_key,
        original_cai=round(original_cai, 4),
        optimized_cai=round(optimized_cai, 4),
        amino_acid_sequence=protein,
        codons_changed=codons_changed,
        total_codons=total_codons,
        gc_content_before=round(_gc_fraction(dna), 4),
        gc_content_after=round(_gc_fraction(optimized_dna), 4),
        preserved_motif_count=preserved_count,
    )

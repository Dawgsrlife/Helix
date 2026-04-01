"""Off-target analysis service — k-mer similarity + NCBI BLAST.

Two analysis modes:
  1. **Local k-mer scan** (fast, deterministic): Builds a k-mer index of the
     query sequence, then scans reference genome windows for high k-mer overlap.
     Runs in-process with no external dependencies. Good for <2s feedback.

  2. **NCBI BLAST** (thorough, async): Submits to the NCBI BLAST REST API
     for comprehensive homology search. Returns when results are ready or
     after timeout. Optional — requires network.

The local scan uses pre-built reference k-mer sets for common genomic
contexts (repeat elements, oncogene hotspots, common coding regions) so
we can flag potential off-target sites without a full genome index.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field

import httpx

from services.translation import reverse_complement

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Domain types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class OffTargetHit:
    """A potential off-target site found by k-mer or BLAST analysis."""
    region_name: str  # e.g. "Alu repeat", "chr17:41196312-41197819", "TP53 exon 5"
    similarity_score: float  # 0-1, fraction of shared k-mers or BLAST identity
    shared_kmers: int
    total_query_kmers: int
    category: str  # "repeat_element", "oncogene", "coding_region", "regulatory"
    risk_level: str  # "high", "medium", "low"
    description: str


@dataclass
class OffTargetResult:
    """Complete off-target analysis result."""
    query_length: int
    k: int
    total_query_kmers: int
    hits: list[OffTargetHit] = field(default_factory=list)
    repeat_fraction: float = 0.0  # fraction of sequence that is repetitive
    gc_balance_risk: str = "low"  # "low", "medium", "high"
    blast_rid: str | None = None  # NCBI BLAST request ID (for async polling)


# ---------------------------------------------------------------------------
# Known genomic reference k-mer sets
# ---------------------------------------------------------------------------

# Alu repeat consensus (most common human SINE, ~300 bp)
_ALU_CONSENSUS = (
    "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGA"
    "TCACGAGGTCAGGAGATCGAGACCATCCTGGCTAACACGGTGAAACCCCGTCTCTACTAAA"
    "AATACAAAAAATTAGCCGGGCGTGGTGGCGGGCGCCTGTAGTCCCAGCTACTCGGGAGGC"
    "TGAGGCAGGAGAATGGCGTGAACCCGGGAGGCGGAGCTTGCAGTGAGCCGAGATCGCGCC"
    "ACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAAAA"
)

# LINE-1 (L1) consensus 5' UTR region (~100 bp most conserved)
_LINE1_5UTR = (
    "GGGGGAGGAGCCAAGATGGCCGAATAGGAACAGCTCCGGTCTACAGCTCCCAGCGTGAGCG"
    "ACGCAGAAGACGGTGATTTCTGCATTTCCATCTGAGGTACCGGGTTCATCTCACTAGGGAG"
)

# Common pathogenic motifs — trinucleotide repeat expansions
_REPEAT_EXPANSIONS = {
    "CAG_repeat": "CAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAG",
    "CGG_repeat": "CGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGG",
    "GAA_repeat": "GAAGAAGAAGAAGAAGAAGAAGAAGAAGAAGAAGAAGAAGAAGAAGAA",
    "CTG_repeat": "CTGCTGCTGCTGCTGCTGCTGCTGCTGCTGCTGCTGCTGCTGCTGCTG",
}

# Oncogene hotspot regions (first exon coding regions)
_ONCOGENE_REGIONS = {
    "TP53_exon5": "TACTCCCCTGCCCTCAACAAGATGTTTTGCCAACTGGCCAAGACCTGCCCTGTGCAGCTGTGGG",
    "KRAS_exon2": "ATGACTGAATATAAACTTGTGGTAGTTGGAGCTGGTGGCGTAGGCAAGAGTGCCTTGACGATAC",
    "BRAF_V600": "AGATTTCACTGTAGCTAGACCAAAATCACCTATTTTTACTGTGAGGTCTTCATGAAGAAATAGA",
    "EGFR_exon19": "CCAGAAGGTGAGAAAGTTAAAATTCCCGTCGCTATCAAGGAATTAAGAGAAGCAACATCTCCGA",
    "PIK3CA_E545K": "CAATCGGTGACTGTGTGGGACTTATTGAAGATCCAGAAGGACTTAAAGAACAGTTCACTGATAAG",
}

# Common regulatory elements
_REGULATORY_ELEMENTS = {
    "CMV_promoter": "GTTGACATTGATTATTGACTAGTTATTAATAGTAATCAATTACGGGGTCATTAGTTCATAGCCC",
    "SV40_enhancer": "AATGTGTGTCAGTTAGGGTGTGGAAAGTCCCCAGGCTCCCCAGCAGGCAGAAGTATGCAAAGCA",
    "CpG_island": "GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC",
}


def _build_kmer_set(sequence: str, k: int) -> set[str]:
    """Build the set of all k-mers in a sequence (both strands)."""
    seq = sequence.upper()
    kmers: set[str] = set()
    for i in range(len(seq) - k + 1):
        kmer = seq[i:i + k]
        if "N" not in kmer:
            kmers.add(kmer)
    # Also add reverse complement k-mers
    rc = reverse_complement(seq)
    for i in range(len(rc) - k + 1):
        kmer = rc[i:i + k]
        if "N" not in kmer:
            kmers.add(kmer)
    return kmers


def _kmer_similarity(query_kmers: set[str], ref_kmers: set[str]) -> tuple[int, float]:
    """Compute k-mer overlap between query and reference.

    Returns (shared_count, jaccard_similarity).
    """
    if not query_kmers or not ref_kmers:
        return 0, 0.0
    shared = query_kmers & ref_kmers
    return len(shared), len(shared) / len(query_kmers)


# ---------------------------------------------------------------------------
# Repeat analysis
# ---------------------------------------------------------------------------

_SIMPLE_REPEATS = [base * 6 for base in "ATCG"]
_DINUC_REPEATS = [
    (a + b) * 6 for a in "ATCG" for b in "ATCG" if a != b
]


def _compute_repeat_fraction(sequence: str) -> float:
    """Estimate fraction of sequence that is simple repeats."""
    seq = sequence.upper()
    n = len(seq)
    if n == 0:
        return 0.0

    repeat_positions: set[int] = set()

    # Mono-nucleotide runs of 6+
    for base in "ATCG":
        pattern = base * 6
        start = 0
        while True:
            idx = seq.find(pattern, start)
            if idx == -1:
                break
            # Extend to full run length
            end = idx + 6
            while end < n and seq[end] == base:
                end += 1
            for pos in range(idx, end):
                repeat_positions.add(pos)
            start = idx + 1

    # Dinucleotide repeats (6+ units)
    for a in "ATCG":
        for b in "ATCG":
            if a == b:
                continue
            unit = a + b
            pattern = unit * 4  # 4 repeats = 8 bp minimum
            start = 0
            while True:
                idx = seq.find(pattern, start)
                if idx == -1:
                    break
                end = idx + len(pattern)
                while end + 1 < n and seq[end:end + 2] == unit:
                    end += 2
                for pos in range(idx, end):
                    repeat_positions.add(pos)
                start = idx + 1

    return len(repeat_positions) / n


def _gc_balance_risk(sequence: str) -> str:
    """Assess GC content risk for off-target binding."""
    seq = sequence.upper()
    if not seq:
        return "low"
    gc = sum(1 for b in seq if b in ("G", "C")) / len(seq)
    if gc < 0.25 or gc > 0.75:
        return "high"
    if gc < 0.35 or gc > 0.65:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Local k-mer scan
# ---------------------------------------------------------------------------

def scan_offtargets(
    sequence: str,
    k: int = 12,
    max_hits: int = 20,
) -> OffTargetResult:
    """Run local k-mer off-target scan against known genomic elements.

    Args:
        sequence: Query DNA sequence
        k: K-mer size (8-20, default 12)
        max_hits: Maximum number of hits to return

    Returns:
        OffTargetResult with hits sorted by similarity (highest first)
    """
    seq = sequence.upper()
    query_kmers = _build_kmer_set(seq, k)
    total_query_kmers = len(query_kmers)

    hits: list[OffTargetHit] = []

    # Scan repeat elements
    for name, ref_seq in [("Alu_repeat", _ALU_CONSENSUS), ("LINE1_5UTR", _LINE1_5UTR)]:
        ref_kmers = _build_kmer_set(ref_seq, k)
        shared, similarity = _kmer_similarity(query_kmers, ref_kmers)
        if shared > 0:
            hits.append(OffTargetHit(
                region_name=name,
                similarity_score=round(similarity, 4),
                shared_kmers=shared,
                total_query_kmers=total_query_kmers,
                category="repeat_element",
                risk_level="high" if similarity > 0.15 else "medium" if similarity > 0.05 else "low",
                description=f"Shares {shared} {k}-mers with {name} consensus sequence",
            ))

    # Scan trinucleotide repeat expansions
    for name, ref_seq in _REPEAT_EXPANSIONS.items():
        ref_kmers = _build_kmer_set(ref_seq, k)
        shared, similarity = _kmer_similarity(query_kmers, ref_kmers)
        if shared > 0:
            hits.append(OffTargetHit(
                region_name=name,
                similarity_score=round(similarity, 4),
                shared_kmers=shared,
                total_query_kmers=total_query_kmers,
                category="repeat_element",
                risk_level="high" if similarity > 0.1 else "medium" if similarity > 0.03 else "low",
                description=f"Contains {shared} {k}-mers matching {name} expansion",
            ))

    # Scan oncogene hotspots
    for name, ref_seq in _ONCOGENE_REGIONS.items():
        ref_kmers = _build_kmer_set(ref_seq, k)
        shared, similarity = _kmer_similarity(query_kmers, ref_kmers)
        if shared > 0:
            hits.append(OffTargetHit(
                region_name=name,
                similarity_score=round(similarity, 4),
                shared_kmers=shared,
                total_query_kmers=total_query_kmers,
                category="oncogene",
                risk_level="high" if similarity > 0.1 else "medium" if similarity > 0.03 else "low",
                description=f"Shares {shared} {k}-mers with {name} — potential oncogene off-target",
            ))

    # Scan regulatory elements
    for name, ref_seq in _REGULATORY_ELEMENTS.items():
        ref_kmers = _build_kmer_set(ref_seq, k)
        shared, similarity = _kmer_similarity(query_kmers, ref_kmers)
        if shared > 0:
            hits.append(OffTargetHit(
                region_name=name,
                similarity_score=round(similarity, 4),
                shared_kmers=shared,
                total_query_kmers=total_query_kmers,
                category="regulatory",
                risk_level="high" if similarity > 0.15 else "medium" if similarity > 0.05 else "low",
                description=f"Shares {shared} {k}-mers with {name}",
            ))

    # Sort by similarity (highest risk first) and truncate
    hits.sort(key=lambda h: h.similarity_score, reverse=True)
    hits = hits[:max_hits]

    return OffTargetResult(
        query_length=len(seq),
        k=k,
        total_query_kmers=total_query_kmers,
        hits=hits,
        repeat_fraction=round(_compute_repeat_fraction(seq), 4),
        gc_balance_risk=_gc_balance_risk(seq),
    )


# ---------------------------------------------------------------------------
# NCBI BLAST (async, optional)
# ---------------------------------------------------------------------------

BLAST_API = "https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi"


async def submit_blast(
    sequence: str,
    database: str = "nt",
    program: str = "blastn",
) -> str | None:
    """Submit a BLAST search to NCBI and return the Request ID (RID).

    Does NOT wait for results — caller should poll with check_blast().
    Returns None on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                BLAST_API,
                data={
                    "CMD": "Put",
                    "PROGRAM": program,
                    "DATABASE": database,
                    "QUERY": sequence,
                    "FORMAT_TYPE": "JSON2",
                    "WORD_SIZE": "11",
                    "EXPECT": "10",
                    "HITLIST_SIZE": "10",
                },
            )
            resp.raise_for_status()

            # Parse RID from response
            rid_match = re.search(r"RID = (\S+)", resp.text)
            if rid_match:
                return rid_match.group(1)
            logger.warning("BLAST submit succeeded but no RID found in response")
            return None
    except Exception:
        logger.warning("BLAST submission failed", exc_info=True)
        return None


async def check_blast(rid: str) -> dict | None:
    """Check BLAST results for a given RID.

    Returns parsed results if ready, None if still running or failed.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                BLAST_API,
                params={
                    "CMD": "Get",
                    "RID": rid,
                    "FORMAT_TYPE": "JSON2",
                },
            )
            resp.raise_for_status()

            text = resp.text
            if "Status=WAITING" in text:
                return None
            if "Status=FAILED" in text or "Status=UNKNOWN" in text:
                logger.warning("BLAST job %s failed or expired", rid)
                return None

            try:
                return resp.json()
            except Exception:
                return None
    except Exception:
        logger.warning("BLAST check failed for RID=%s", rid, exc_info=True)
        return None

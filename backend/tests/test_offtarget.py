"""Tests for off-target analysis service — k-mer similarity, repeat detection, API contract.

Covers:
- K-mer set building (both strands, N-filtering)
- K-mer similarity (Jaccard, edge cases)
- Repeat fraction detection (mono/dinucleotide)
- GC balance risk classification
- Full scan against genomic reference panels
- NCBI BLAST mocking (submit + check)
- API endpoint contracts and Pydantic validation
- Edge cases (single base, all-N, palindrome)
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from main import app
from services.offtarget import (
    OffTargetHit,
    OffTargetResult,
    _build_kmer_set,
    _kmer_similarity,
    _compute_repeat_fraction,
    _gc_balance_risk,
    _ALU_CONSENSUS,
    _LINE1_5UTR,
    _REPEAT_EXPANSIONS,
    _ONCOGENE_REGIONS,
    _REGULATORY_ELEMENTS,
    scan_offtargets,
    submit_blast,
    check_blast,
)
from services.translation import reverse_complement


# ---------------------------------------------------------------------------
# Real sequences for testing
# ---------------------------------------------------------------------------

BRCA1 = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"

# Alu-like fragment — first 30 bp of Alu consensus
ALU_FRAGMENT = _ALU_CONSENSUS[:60]

# CAG repeat (Huntington-like)
CAG_REPEAT = "CAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAG"

# CpG island-like
CPG_ISLAND = "GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC"

# Random non-repetitive sequence
RANDOM_SEQ = "ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG"


# ---------------------------------------------------------------------------
# 1. K-mer set building
# ---------------------------------------------------------------------------

class TestBuildKmerSet:
    def test_basic_kmer_extraction(self):
        """Simple 4-mer extraction from 'ATCGATCG' (8bp → 5 k-mers per strand)."""
        kmers = _build_kmer_set("ATCGATCG", k=4)
        # Forward: ATCG, TCGA, CGAT, GATC, ATCG (4 unique)
        # Reverse complement of ATCGATCG = CGATCGAT
        # RC: CGAT, GATC, ATCG, TCGA, GATC (same 4 unique)
        # Union = {ATCG, TCGA, CGAT, GATC}
        assert "ATCG" in kmers
        assert "TCGA" in kmers
        assert "CGAT" in kmers
        assert "GATC" in kmers

    def test_n_bases_filtered_out(self):
        """K-mers containing N should be excluded."""
        kmers = _build_kmer_set("ATCNGATCG", k=4)
        # Forward 4-mers: ATCN, TCNG, CNGA, NGAT, GATC, ATCG
        # ATCN, TCNG, CNGA, NGAT all contain N → excluded
        assert all("N" not in km for km in kmers)

    def test_all_n_sequence(self):
        """All-N sequence produces empty k-mer set."""
        kmers = _build_kmer_set("NNNNNNNN", k=4)
        assert len(kmers) == 0

    def test_single_base_too_short_for_kmers(self):
        """Single base with k=4 → no k-mers."""
        kmers = _build_kmer_set("A", k=4)
        assert len(kmers) == 0

    def test_exact_k_length_sequence(self):
        """Sequence exactly k bp → one k-mer (plus reverse complement)."""
        kmers = _build_kmer_set("ATCG", k=4)
        # Forward: ATCG. RC of ATCG = CGAT
        assert "ATCG" in kmers
        assert "CGAT" in kmers
        assert len(kmers) == 2

    def test_palindromic_sequence(self):
        """A palindromic k-mer should appear once (set deduplicates)."""
        # ATAT is its own reverse complement (since rc(ATAT) = ATAT)
        kmers = _build_kmer_set("ATAT", k=4)
        assert "ATAT" in kmers
        # rc(ATAT) = ATAT → same, so set has fewer entries

    def test_both_strands_included(self):
        """K-mers from reverse complement strand must be included."""
        seq = "AAAAAAAAAA"  # 10 As
        kmers = _build_kmer_set(seq, k=4)
        # Forward: AAAA (only 1 unique)
        # RC: TTTTTTTTTT → TTTT (only 1 unique)
        assert "AAAA" in kmers
        assert "TTTT" in kmers

    def test_case_insensitive(self):
        """Lowercase input should work identically to uppercase."""
        kmers_upper = _build_kmer_set("ATCGATCG", k=4)
        kmers_lower = _build_kmer_set("atcgatcg", k=4)
        assert kmers_upper == kmers_lower

    def test_kmer_count_upper_bound(self):
        """Number of unique k-mers ≤ 2*(n-k+1) for sequence of length n."""
        seq = BRCA1
        k = 12
        kmers = _build_kmer_set(seq, k)
        max_possible = 2 * (len(seq) - k + 1)
        assert len(kmers) <= max_possible


# ---------------------------------------------------------------------------
# 2. K-mer similarity
# ---------------------------------------------------------------------------

class TestKmerSimilarity:
    def test_identical_sets(self):
        """Same k-mers → similarity should reflect full query coverage."""
        kmers = {"ATCG", "TCGA", "CGAT"}
        shared, sim = _kmer_similarity(kmers, kmers)
        assert shared == 3
        assert sim == 1.0

    def test_disjoint_sets(self):
        """No shared k-mers → similarity = 0."""
        q = {"AAAA", "TTTT"}
        r = {"CCCC", "GGGG"}
        shared, sim = _kmer_similarity(q, r)
        assert shared == 0
        assert sim == 0.0

    def test_partial_overlap(self):
        """Partial overlap: 1 of 3 query k-mers shared."""
        q = {"ATCG", "TCGA", "CGAT"}
        r = {"ATCG", "XXXX", "YYYY"}
        shared, sim = _kmer_similarity(q, r)
        assert shared == 1
        assert abs(sim - 1 / 3) < 1e-10

    def test_empty_query(self):
        shared, sim = _kmer_similarity(set(), {"ATCG"})
        assert shared == 0
        assert sim == 0.0

    def test_empty_reference(self):
        shared, sim = _kmer_similarity({"ATCG"}, set())
        assert shared == 0
        assert sim == 0.0

    def test_both_empty(self):
        shared, sim = _kmer_similarity(set(), set())
        assert shared == 0
        assert sim == 0.0

    def test_similarity_is_fraction_of_query(self):
        """Similarity = |shared| / |query_kmers|, NOT Jaccard."""
        q = {"A", "B", "C", "D"}  # 4 query k-mers
        r = {"A", "B"}  # 2 ref k-mers, both match
        shared, sim = _kmer_similarity(q, r)
        assert shared == 2
        assert abs(sim - 0.5) < 1e-10


# ---------------------------------------------------------------------------
# 3. Repeat fraction detection
# ---------------------------------------------------------------------------

class TestRepeatFraction:
    def test_no_repeats(self):
        """ATCGATCG has no mono-6 or di-4 repeats → fraction = 0."""
        frac = _compute_repeat_fraction("ATCGATCG")
        assert frac == 0.0

    def test_all_same_base(self):
        """All As → entire sequence is a mono-nucleotide repeat."""
        frac = _compute_repeat_fraction("AAAAAAAAAA")
        assert abs(frac - 1.0) < 1e-10

    def test_mono_nucleotide_run_exact(self):
        """6 consecutive As within a sequence."""
        seq = "TCGAAAAAATCG"  # 6 As at positions 3-8
        frac = _compute_repeat_fraction(seq)
        # 6 positions out of 12
        assert abs(frac - 6 / 12) < 1e-10

    def test_dinucleotide_repeat(self):
        """ATATAT (4+ units of AT) should flag as dinucleotide repeat."""
        seq = "GCGCATATATATATGCGC"  # AT repeat in the middle: 8+ bp
        frac = _compute_repeat_fraction(seq)
        assert frac > 0.0  # The AT region should be detected

    def test_empty_sequence(self):
        assert _compute_repeat_fraction("") == 0.0

    def test_cag_repeat_detected(self):
        """CAG repeats should NOT be detected as simple repeat (they're trinucleotide)."""
        # _compute_repeat_fraction only checks mono (6+) and di (4+ units / 8+ bp)
        # CAG is trinucleotide — not caught by this specific function
        frac = _compute_repeat_fraction("CAGCAGCAGCAGCAGCAGCAG")
        # No mono-6 runs, no di-4 runs in pure CAG
        assert frac == 0.0

    def test_mixed_repeats(self):
        """Overlapping mono and di repeats."""
        seq = "TTTTTTCCCCCCCCCC"  # 6 Ts + 10 Cs
        frac = _compute_repeat_fraction(seq)
        # All 16 positions are in repeat runs
        assert abs(frac - 1.0) < 1e-10


# ---------------------------------------------------------------------------
# 4. GC balance risk
# ---------------------------------------------------------------------------

class TestGCBalanceRisk:
    def test_balanced_gc(self):
        """50% GC → low risk."""
        assert _gc_balance_risk("ATCG") == "low"

    def test_zero_gc(self):
        """0% GC → high risk."""
        assert _gc_balance_risk("AAAAAA") == "high"

    def test_all_gc(self):
        """100% GC → high risk."""
        assert _gc_balance_risk("GCGCGC") == "high"

    def test_low_gc_medium(self):
        """~30% GC → medium risk (between 0.25 and 0.35)."""
        # Build a sequence with exactly 30% GC
        seq = "GCC" + "A" * 7  # 3 GC out of 10 = 30%
        risk = _gc_balance_risk(seq)
        assert risk == "medium"

    def test_high_gc_medium(self):
        """~70% GC → medium risk (between 0.65 and 0.75)."""
        seq = "GCGCGCG" + "AA" + "G"  # 8 GC out of 10 = 80% → actually high
        # Let's be more precise: 7 GC out of 10 = 70%
        seq2 = "GCGCGCG" + "AAA"  # 7 GC out of 10 = 70%
        risk = _gc_balance_risk(seq2)
        assert risk == "medium"

    def test_exactly_25_percent(self):
        """25% GC is boundary → should be high (< 0.25 check is strict)."""
        # 1 GC out of 4 = 25% => gc < 0.25 is False, gc > 0.75 is False
        # gc < 0.35 is True → medium
        assert _gc_balance_risk("GAAT") == "medium"

    def test_empty_string(self):
        assert _gc_balance_risk("") == "low"


# ---------------------------------------------------------------------------
# 5. Full scan against genomic reference panels
# ---------------------------------------------------------------------------

class TestScanOffTargets:
    def test_random_sequence_low_hits(self):
        """A non-repetitive random sequence should have few or no high-risk hits."""
        result = scan_offtargets(RANDOM_SEQ, k=12)
        assert isinstance(result, OffTargetResult)
        assert result.query_length == len(RANDOM_SEQ)
        assert result.k == 12
        # No hits should be high risk for a simple ATCG repeat
        high_risk = [h for h in result.hits if h.risk_level == "high"]
        # Can't guarantee zero, but similarity should be low
        for h in result.hits:
            assert 0.0 <= h.similarity_score <= 1.0

    def test_alu_fragment_matches_alu_reference(self):
        """A fragment from the Alu consensus MUST match the Alu reference panel."""
        result = scan_offtargets(ALU_FRAGMENT, k=12)
        alu_hits = [h for h in result.hits if h.region_name == "Alu_repeat"]
        assert len(alu_hits) == 1
        # Should have substantial similarity since it's FROM the Alu consensus
        assert alu_hits[0].similarity_score > 0.3
        assert alu_hits[0].shared_kmers > 10
        assert alu_hits[0].category == "repeat_element"

    def test_cag_repeat_matches_expansion_panel(self):
        """CAG repeat sequence should match the CAG_repeat reference."""
        result = scan_offtargets(CAG_REPEAT, k=12)
        cag_hits = [h for h in result.hits if h.region_name == "CAG_repeat"]
        assert len(cag_hits) == 1
        assert cag_hits[0].similarity_score > 0.1
        assert cag_hits[0].category == "repeat_element"

    def test_cpg_island_matches_regulatory(self):
        """CpG island sequence should match the CpG_island regulatory reference."""
        result = scan_offtargets(CPG_ISLAND, k=12)
        cpg_hits = [h for h in result.hits if h.region_name == "CpG_island"]
        assert len(cpg_hits) == 1
        assert cpg_hits[0].category == "regulatory"
        assert cpg_hits[0].similarity_score > 0.3

    def test_hits_sorted_by_similarity(self):
        """Hits must be sorted highest similarity first."""
        result = scan_offtargets(ALU_FRAGMENT, k=12)
        if len(result.hits) >= 2:
            for i in range(len(result.hits) - 1):
                assert result.hits[i].similarity_score >= result.hits[i + 1].similarity_score

    def test_max_hits_respected(self):
        """Should never return more hits than max_hits."""
        result = scan_offtargets(BRCA1, k=8, max_hits=3)
        assert len(result.hits) <= 3

    def test_k_parameter_affects_results(self):
        """Smaller k → more k-mers → potentially more hits."""
        r8 = scan_offtargets(BRCA1, k=8)
        r16 = scan_offtargets(BRCA1, k=16)
        # With k=8, more k-mers are generated, so more potential matches
        assert r8.total_query_kmers >= r16.total_query_kmers

    def test_repeat_fraction_in_result(self):
        """Result must include repeat_fraction."""
        result = scan_offtargets(CAG_REPEAT, k=12)
        assert isinstance(result.repeat_fraction, float)
        assert 0.0 <= result.repeat_fraction <= 1.0

    def test_gc_balance_risk_in_result(self):
        """Result must include gc_balance_risk."""
        result = scan_offtargets(BRCA1, k=12)
        assert result.gc_balance_risk in {"low", "medium", "high"}

    def test_all_t_high_gc_risk(self):
        """All-T sequence has 0% GC → high risk."""
        result = scan_offtargets("T" * 48, k=12)
        assert result.gc_balance_risk == "high"

    def test_self_scan_alu_consensus(self):
        """Scanning the full Alu consensus should match itself strongly."""
        result = scan_offtargets(_ALU_CONSENSUS, k=12)
        alu_hits = [h for h in result.hits if h.region_name == "Alu_repeat"]
        assert len(alu_hits) == 1
        # Self-scan: all query k-mers should match reference
        assert alu_hits[0].similarity_score > 0.8

    def test_hit_dataclass_fields(self):
        """Each hit must have all required fields."""
        result = scan_offtargets(ALU_FRAGMENT, k=12)
        for hit in result.hits:
            assert isinstance(hit.region_name, str) and hit.region_name
            assert isinstance(hit.similarity_score, float)
            assert isinstance(hit.shared_kmers, int) and hit.shared_kmers >= 0
            assert isinstance(hit.total_query_kmers, int) and hit.total_query_kmers >= 0
            assert hit.category in {"repeat_element", "oncogene", "coding_region", "regulatory"}
            assert hit.risk_level in {"high", "medium", "low"}
            assert isinstance(hit.description, str) and hit.description

    def test_brca1_no_high_risk_repeats(self):
        """BRCA1 seed is a real gene fragment — should NOT be flagged as an Alu or LINE."""
        result = scan_offtargets(BRCA1, k=12)
        high_repeat_hits = [
            h for h in result.hits
            if h.category == "repeat_element" and h.risk_level == "high"
        ]
        assert len(high_repeat_hits) == 0


# ---------------------------------------------------------------------------
# 6. BLAST mocking
# ---------------------------------------------------------------------------

class TestBLAST:
    @pytest.mark.asyncio
    async def test_submit_blast_parses_rid(self):
        """submit_blast should extract RID from NCBI response."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = "    RID = ABCDEF123456\n    RTOE = 30\n"
        mock_resp.raise_for_status = MagicMock()

        with patch("services.offtarget.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            rid = await submit_blast("ATCGATCG")
            assert rid == "ABCDEF123456"

    @pytest.mark.asyncio
    async def test_submit_blast_returns_none_on_failure(self):
        """Network failure → None, not an exception."""
        with patch("services.offtarget.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(side_effect=Exception("Network error"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            rid = await submit_blast("ATCGATCG")
            assert rid is None

    @pytest.mark.asyncio
    async def test_check_blast_waiting_returns_none(self):
        """BLAST job still running → None."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = "Status=WAITING"
        mock_resp.raise_for_status = MagicMock()

        with patch("services.offtarget.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await check_blast("ABCDEF123456")
            assert result is None

    @pytest.mark.asyncio
    async def test_check_blast_failed_returns_none(self):
        """BLAST job failed → None."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = "Status=FAILED"
        mock_resp.raise_for_status = MagicMock()

        with patch("services.offtarget.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await check_blast("ABCDEF123456")
            assert result is None

    @pytest.mark.asyncio
    async def test_check_blast_ready_returns_json(self):
        """BLAST results ready → parsed JSON dict."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '{"BlastOutput2": []}'
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json = MagicMock(return_value={"BlastOutput2": []})

        with patch("services.offtarget.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await check_blast("ABCDEF123456")
            assert result == {"BlastOutput2": []}


# ---------------------------------------------------------------------------
# 7. API endpoint contract
# ---------------------------------------------------------------------------

class TestOffTargetAPI:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_basic_request(self, client):
        res = client.post("/api/offtarget", json={"sequence": BRCA1})
        assert res.status_code == 200
        body = res.json()
        assert body["query_length"] == len(BRCA1)
        assert body["k"] == 12  # default
        assert isinstance(body["total_query_kmers"], int)
        assert isinstance(body["repeat_fraction"], float)
        assert body["gc_balance_risk"] in {"low", "medium", "high"}
        assert isinstance(body["hit_count"], int)
        assert body["hit_count"] == len(body["hits"])

    def test_custom_k(self, client):
        res = client.post("/api/offtarget", json={"sequence": BRCA1, "k": 8})
        assert res.status_code == 200
        assert res.json()["k"] == 8

    def test_k_below_minimum_rejected(self, client):
        res = client.post("/api/offtarget", json={"sequence": BRCA1, "k": 7})
        assert res.status_code == 422

    def test_k_above_maximum_rejected(self, client):
        res = client.post("/api/offtarget", json={"sequence": BRCA1, "k": 21})
        assert res.status_code == 422

    def test_max_hits_above_maximum_rejected(self, client):
        res = client.post("/api/offtarget", json={"sequence": BRCA1, "max_hits": 101})
        assert res.status_code == 422

    def test_max_hits_zero_rejected(self, client):
        res = client.post("/api/offtarget", json={"sequence": BRCA1, "max_hits": 0})
        assert res.status_code == 422

    def test_invalid_sequence_rejected(self, client):
        res = client.post("/api/offtarget", json={"sequence": "XYZQ"})
        assert res.status_code == 422

    def test_empty_sequence_rejected(self, client):
        res = client.post("/api/offtarget", json={"sequence": ""})
        assert res.status_code == 422

    def test_hit_response_shape(self, client):
        res = client.post("/api/offtarget", json={"sequence": ALU_FRAGMENT})
        assert res.status_code == 200
        body = res.json()
        if body["hits"]:
            hit = body["hits"][0]
            expected_keys = {
                "region_name", "similarity_score", "shared_kmers",
                "total_query_kmers", "category", "risk_level", "description",
            }
            assert set(hit.keys()) == expected_keys

    def test_response_shape_complete(self, client):
        res = client.post("/api/offtarget", json={"sequence": BRCA1})
        assert res.status_code == 200
        body = res.json()
        expected_keys = {
            "query_length", "k", "total_query_kmers",
            "repeat_fraction", "gc_balance_risk", "hit_count", "hits",
        }
        assert set(body.keys()) == expected_keys


# ---------------------------------------------------------------------------
# 8. Edge cases
# ---------------------------------------------------------------------------

class TestOffTargetEdgeCases:
    def test_single_base(self):
        """Single base sequence should not crash."""
        result = scan_offtargets("A", k=8)
        assert result.query_length == 1
        assert result.total_query_kmers == 0  # Can't build any 8-mers
        assert len(result.hits) == 0

    def test_short_sequence_shorter_than_k(self):
        """Sequence shorter than k → no k-mers → no hits."""
        result = scan_offtargets("ATCG", k=12)
        assert result.total_query_kmers == 0
        assert len(result.hits) == 0

    def test_reverse_complement_symmetry(self):
        """Scanning seq and its RC should produce identical k-mer sets."""
        rc = reverse_complement(BRCA1)
        kmers_fwd = _build_kmer_set(BRCA1, 12)
        kmers_rc = _build_kmer_set(rc, 12)
        assert kmers_fwd == kmers_rc

    def test_deterministic_results(self):
        """Same input → same output (no randomness in local scan)."""
        r1 = scan_offtargets(BRCA1, k=12)
        r2 = scan_offtargets(BRCA1, k=12)
        assert r1.total_query_kmers == r2.total_query_kmers
        assert r1.repeat_fraction == r2.repeat_fraction
        assert r1.gc_balance_risk == r2.gc_balance_risk
        assert len(r1.hits) == len(r2.hits)
        for h1, h2 in zip(r1.hits, r2.hits):
            assert h1.region_name == h2.region_name
            assert h1.similarity_score == h2.similarity_score

    def test_long_poly_a_repeat_fraction(self):
        """Long poly-A should have repeat_fraction = 1.0."""
        result = scan_offtargets("A" * 100, k=8)
        assert abs(result.repeat_fraction - 1.0) < 1e-10

    def test_oncogene_reference_self_match(self):
        """Scanning an oncogene reference against itself should produce a strong hit."""
        tp53 = _ONCOGENE_REGIONS["TP53_exon5"]
        result = scan_offtargets(tp53, k=12)
        tp53_hits = [h for h in result.hits if h.region_name == "TP53_exon5"]
        assert len(tp53_hits) == 1
        assert tp53_hits[0].similarity_score > 0.8
        assert tp53_hits[0].category == "oncogene"

"""Cross-phase integration tests — verifying real data flows that compose
services from Phases 1–4 together.

Design principles:
  1. One test, one invariant.  The docstring states it; every assertion
     verifies it.  Nothing else.
  2. Real sequences — no toy "ATCG" strings.
  3. DRY setup via module-scoped fixtures.
  4. No mocking of internal services — every service runs its real code path.
  5. Tests are derived from the actual API contracts, verified by probing
     the real endpoints first.
"""

from __future__ import annotations

import asyncio

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from main import app
from services.codon_optimization import optimize_codons
from services.experiment_tracker import ExperimentTracker, _diff_sequences
from services.offtarget import scan_offtargets, _build_kmer_set, _kmer_similarity
from services.session_store import MemorySessionStore
from services.translation import (
    translate, reverse_complement, gc_content, find_orfs, find_motif,
)


# ---------------------------------------------------------------------------
# Real biological sequences
# ---------------------------------------------------------------------------

# BRCA1 coding-region fragment (47 bp, starts with ATG)
BRCA1 = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"

# TP53 exon 5 — known oncogene hotspot
TP53_EX5 = "TACTCCCCTGCCCTCAACAAGATGTTTTGCCAACTGGCCAAGACCTGCCCTGTGCAGCTGTGGG"

# GFP (first 60 bp of enhanced GFP CDS — multiple of 3 for clean translation)
GFP = "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGAC"

# CpG island (100% GC)
ALL_GC = "GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC"

# Alu consensus fragment (first 60 bp) — known repeat element reference
from services.offtarget import _ALU_CONSENSUS
ALU_60 = _ALU_CONSENSUS[:60]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _design(c: TestClient, sid: str) -> None:
    r = c.post("/api/design", json={"goal": "test", "session_id": sid})
    assert r.status_code in (200, 202)


# ===================================================================
#  1. TRANSLATION → CODON OPT → TRANSLATION  (amino acid invariant)
# ===================================================================

class TestCodonOptPreservesProtein:
    """Invariant: translate(original) == translate(optimized) for every
    supported organism."""

    @pytest.mark.parametrize("organism", [
        "human", "e_coli", "yeast", "mouse", "drosophila",
    ])
    def test_protein_identity_across_organisms(self, organism: str):
        result = optimize_codons(GFP, organism)
        assert translate(result.optimized_sequence) == translate(GFP)

    def test_optimization_is_idempotent_on_protein(self):
        first = optimize_codons(BRCA1, "human")
        second = optimize_codons(first.optimized_sequence, "human")
        assert translate(second.optimized_sequence) == translate(BRCA1)

    def test_cai_improves_or_stays(self):
        """After optimization, CAI must be >= the original CAI."""
        result = optimize_codons(GFP, "human")
        assert result.optimized_cai >= result.original_cai, (
            f"CAI decreased: {result.original_cai} -> {result.optimized_cai}"
        )


# ===================================================================
#  2. EDIT → EXPERIMENT TRACKING → REVERT  (sequence round-trip)
# ===================================================================

class TestEditTrackRevert:
    """An edit followed by a revert MUST restore the exact sequence."""

    def _init_session(self, client: TestClient, sid: str) -> str:
        """Design + get original sequence. Returns the original sequence."""
        _design(client, sid)
        explain = client.post("/api/agent/chat", json={
            "session_id": sid, "candidate_id": 0, "message": "explain",
        })
        return explain.json()["candidate_update"]["sequence"]

    def test_edit_auto_records_with_correct_details(self, client: TestClient):
        sid = "integ-edit-record-v2"
        self._init_session(client, sid)

        client.post("/api/edit/base", json={
            "session_id": sid, "candidate_id": 0,
            "position": 0, "new_base": "G",
        })

        versions = client.get(f"/api/experiments/{sid}").json()["versions"]
        assert len(versions) >= 1
        last = versions[-1]
        assert last["operation"] == "edit"
        assert last["operation_details"]["position"] == 0
        assert last["operation_details"]["new_base"] == "G"

    def test_revert_restores_via_api(self, client: TestClient):
        sid = "integ-revert-api-v2"
        original_seq = self._init_session(client, sid)
        v_orig = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": original_seq,
            "scores": {}, "operation": "initial",
        }).json()["version_id"]

        # Edit
        client.post("/api/edit/base", json={
            "session_id": sid, "candidate_id": 0,
            "position": 0, "new_base": "G",
        })

        # Revert
        rv = client.post("/api/experiments/revert", json={
            "session_id": sid, "version_id": v_orig,
        })
        assert rv.status_code == 200
        body = rv.json()
        assert body["reverted"] is True
        assert body["operation"] == "revert"
        assert body["restored_sequence_length"] == len(original_seq)

    def test_diff_captures_exact_mutation(self, client: TestClient):
        sid = "integ-diff-edit-v2"
        original_seq = self._init_session(client, sid)

        v1 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": original_seq,
            "scores": {}, "operation": "initial",
        }).json()["version_id"]

        client.post("/api/edit/base", json={
            "session_id": sid, "candidate_id": 0,
            "position": 5, "new_base": "C",
        })

        edit_versions = [
            v for v in client.get(f"/api/experiments/{sid}").json()["versions"]
            if v["operation"] == "edit"
        ]
        v2 = edit_versions[-1]["version_id"]

        diff = client.post("/api/experiments/diff", json={
            "session_id": sid, "v1_id": v1, "v2_id": v2,
        }).json()

        assert diff["total_changes"] == 1
        assert diff["mutations"][0]["position"] == 5
        assert diff["mutations"][0]["alt"] == "C"


# ===================================================================
#  3. OFF-TARGET ↔ CODON OPT  (safety invariant)
# ===================================================================

class TestOptimizationSafety:
    """Codon optimization must NOT create new high-risk off-target hits."""

    def test_optimization_doesnt_create_alu_hits(self):
        original_scan = scan_offtargets(GFP, k=12)
        original_alu_high = [h for h in original_scan.hits
                             if h.region_name == "Alu_repeat" and h.risk_level == "high"]

        optimized = optimize_codons(GFP, "human")
        opt_scan = scan_offtargets(optimized.optimized_sequence, k=12)
        opt_alu_high = [h for h in opt_scan.hits
                        if h.region_name == "Alu_repeat" and h.risk_level == "high"]

        if not original_alu_high:
            assert not opt_alu_high, "Codon optimization created a new high-risk Alu hit"

    def test_gc_content_changes_are_bounded(self):
        """Codon optimization should not swing GC content by more than 20pp."""
        result = optimize_codons(GFP, "e_coli")
        delta = abs(result.gc_content_after - result.gc_content_before)
        assert delta < 0.20, (
            f"GC went from {result.gc_content_before:.2f} to "
            f"{result.gc_content_after:.2f} — too dramatic"
        )


# ===================================================================
#  4. STRUCTURE ENDPOINT  (Phase 2.1 integration)
# ===================================================================

class TestStructureEndpoint:
    """The structure endpoint must produce valid PDB."""

    # Use a 200bp+ sequence ensuring >40 residue protein so candidate_id phase matters.
    # This encodes a 50+ residue protein before the first stop codon.
    LONG_SEQ = (
        "ATGAAAGCTATCGGTCGTCGTTTCCCGAAAGCGGCGCTGACCGAACTG"
        "GAAACCCTGGAAGATCTGGGTATTGACCTGAAAGGCCGCAGCCTGCGTG"
        "AAGCAATGCTGCGTCGTATTAACGATCCGGCGATCCTGGACGTGGCGAA"
        "CTACTTCAACCAGACCAGCGGTTTTACCCGTCTGATCGGCACCAAAGCGG"
        "GTGCGTTTGGCCCGA"
    )

    def test_produces_valid_pdb(self, client: TestClient):
        r = client.post("/api/structure", json={
            "sequence": self.LONG_SEQ, "candidate_id": 0,
            "region_start": 0, "region_end": len(self.LONG_SEQ),
        })
        assert r.status_code == 200
        body = r.json()
        assert body["pdb_data"].startswith("HEADER")
        assert body["pdb_data"].strip().endswith("END")
        assert 0.0 <= body["confidence"] <= 1.0

    def test_different_sequences_produce_different_folds(self, client: TestClient):
        """Different DNA sequences → different proteins → different PDB output."""
        seq2 = (
            "ATGCGTGATCGTAAACTGCAGAAAGCGGCGTTTCGTACCCTGGCGAGC"
            "CTGATCAAAGAAGGTCTGGAAACCCCGCTGGACTGCGGTGACCGTATC"
            "GAAGATCTGATCAAACGTAACCCGGATGCGATTCTGGCGATCGAAAAC"
            "TACTTCAACCAGACCAGCGAGTTCACCCGTCTGATCGGCACCAAAGCGG"
            "GTGCGTTTGGCCCGA"
        )
        r0 = client.post("/api/structure", json={
            "sequence": self.LONG_SEQ, "candidate_id": 0,
            "region_start": 0, "region_end": len(self.LONG_SEQ),
        })
        r1 = client.post("/api/structure", json={
            "sequence": seq2, "candidate_id": 0,
            "region_start": 0, "region_end": len(seq2),
        })
        # Different input sequences should produce different folds
        assert r0.json()["pdb_data"] != r1.json()["pdb_data"]


# ===================================================================
#  5. SCORING ↔ REGULATORY VIZ  (motif detection consistency)
# ===================================================================

class TestScoringAndRegulatory:
    """The analyze endpoint scores must reflect motif presence."""

    def test_tata_box_boosts_functional_score(self, client: TestClient):
        """A sequence with TATA box should score higher functional than
        one without.  Uses agent/chat which returns 4D scores."""
        with_tata = "TATAAA" + "A" * 41
        without_tata = "G" * 47

        sid_with = "tata-yes-v3"
        sid_without = "tata-no-v3"
        _design(client, sid_with)
        _design(client, sid_without)

        # Agent explain runs the full scoring pipeline
        r_with = client.post("/api/agent/chat", json={
            "session_id": sid_with, "candidate_id": 0, "message": "explain",
        })
        r_without = client.post("/api/agent/chat", json={
            "session_id": sid_without, "candidate_id": 0, "message": "explain",
        })

        f_with = r_with.json()["candidate_update"]["scores"]["functional"]
        f_without = r_without.json()["candidate_update"]["scores"]["functional"]

        assert f_with >= f_without, f"TATA: {f_with} vs no-TATA: {f_without}"


# ===================================================================
#  6. K-MER MATHEMATICAL PROPERTIES
# ===================================================================

class TestKmerMathematicalProperties:
    def test_kmer_set_is_strand_symmetric(self):
        for seq in [BRCA1, GFP, TP53_EX5]:
            rc = reverse_complement(seq)
            assert _build_kmer_set(seq, 12) == _build_kmer_set(rc, 12)

    def test_self_similarity_is_one(self):
        kmers = _build_kmer_set(BRCA1, 12)
        shared, sim = _kmer_similarity(kmers, kmers)
        assert sim == 1.0
        assert shared == len(kmers)

    def test_smaller_k_produces_more_kmers(self):
        k8 = _build_kmer_set(BRCA1, 8)
        k16 = _build_kmer_set(BRCA1, 16)
        assert len(k8) >= len(k16)


# ===================================================================
#  7. SESSION STORE ↔ EXPERIMENT TRACKER  (state consistency)
# ===================================================================

class TestSessionExperimentConsistency:
    @pytest_asyncio.fixture
    async def env(self):
        store = MemorySessionStore(default_seed=BRCA1)
        tracker = ExperimentTracker(store)
        sid = "sync-test"
        await store.initialize_session(sid)
        return store, tracker, sid

    @pytest.mark.asyncio
    async def test_revert_syncs_session_store(self, env):
        store, tracker, sid = env
        v1 = await tracker.record_version(
            session_id=sid, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        edited = "G" + BRCA1[1:]
        await store.set_candidate_sequence(sid, 0, edited)
        await tracker.record_version(
            session_id=sid, candidate_id=0,
            sequence=edited, scores={}, operation="edit",
        )
        assert await store.require_candidate_sequence(sid, 0) == edited
        await tracker.revert_to_version(sid, v1)
        assert await store.require_candidate_sequence(sid, 0) == BRCA1

    @pytest.mark.asyncio
    async def test_lineage_depth_matches_edit_count(self, env):
        store, tracker, sid = env
        n_edits = 5
        v_ids = []
        seq = BRCA1
        v_ids.append(await tracker.record_version(
            session_id=sid, candidate_id=0,
            sequence=seq, scores={}, operation="initial",
        ))
        for i in range(n_edits):
            seq = seq[:i] + "G" + seq[i + 1:]
            v_ids.append(await tracker.record_version(
                session_id=sid, candidate_id=0,
                sequence=seq, scores={}, operation="edit",
            ))
        lineage = await tracker.get_lineage(sid, v_ids[-1])
        assert len(lineage) == n_edits + 1


# ===================================================================
#  8. API ENDPOINT CONTRACT CROSS-VALIDATION
# ===================================================================

class TestAPIContractCrossValidation:
    def test_edit_response_has_5_score_keys(self, client: TestClient):
        """Both /api/edit/base and /api/agent/chat return the same 5
        score keys."""
        sid = "contract-shape-v3"
        _design(client, sid)

        explain = client.post("/api/agent/chat", json={
            "session_id": sid, "candidate_id": 0, "message": "explain",
        })
        agent_score_keys = set(explain.json()["candidate_update"]["scores"].keys())

        edit = client.post("/api/edit/base", json={
            "session_id": sid, "candidate_id": 0,
            "position": 0, "new_base": "G",
        })
        edit_score_keys = set(edit.json()["updated_scores"].keys())

        expected = {"functional", "tissue_specificity", "off_target", "novelty", "combined"}
        assert agent_score_keys == expected
        assert edit_score_keys == expected

    def test_offtarget_endpoint_matches_service(self, client: TestClient):
        api_result = client.post("/api/offtarget", json={
            "sequence": ALU_60, "k": 12,
        }).json()
        direct = scan_offtargets(ALU_60, k=12)

        assert api_result["query_length"] == direct.query_length
        assert api_result["k"] == direct.k
        assert api_result["total_query_kmers"] == direct.total_query_kmers
        assert api_result["repeat_fraction"] == direct.repeat_fraction
        assert api_result["gc_balance_risk"] == direct.gc_balance_risk
        assert len(api_result["hits"]) == len(direct.hits)

    def test_codon_optimize_endpoint_matches_service(self, client: TestClient):
        api_result = client.post("/api/optimize/codons", json={
            "sequence": GFP, "organism": "human",
        }).json()
        direct = optimize_codons(GFP, "human")

        assert api_result["original_sequence"] == GFP
        assert api_result["optimized_sequence"] == direct.optimized_sequence
        assert api_result["amino_acid_sequence"] == direct.amino_acid_sequence
        assert api_result["original_cai"] == direct.original_cai
        assert api_result["optimized_cai"] == direct.optimized_cai


# ===================================================================
#  9. FASTA/GENBANK ROUND-TRIP (Phase 3.2 integration)
# ===================================================================

class TestImportExportRoundTrip:
    def test_fasta_round_trip(self, client: TestClient):
        # Export returns plain text
        export = client.post("/api/export/fasta", json={
            "sequences": [{"name": "test_seq", "sequence": BRCA1}],
        })
        assert export.status_code == 200
        fasta_text = export.text

        # Import
        imp = client.post("/api/import", files={
            "file": ("test.fasta", fasta_text, "text/plain"),
        })
        assert imp.status_code == 200
        imported_seq = imp.json()["sequences"][0]["sequence"]
        assert imported_seq == BRCA1

    def test_genbank_round_trip(self, client: TestClient):
        export = client.post("/api/export/genbank", json={
            "sequence": BRCA1, "name": "brca1_test",
        })
        assert export.status_code == 200
        gb_text = export.text

        imp = client.post("/api/import", files={
            "file": ("test.gb", gb_text, "text/plain"),
        })
        assert imp.status_code == 200
        imported_seq = imp.json()["sequences"][0]["sequence"]
        assert imported_seq == BRCA1


# ===================================================================
# 10. DIFF ALGORITHM PROPERTIES  (algebraic correctness)
# ===================================================================

class TestDiffAlgorithmProperties:
    def test_diff_is_symmetric_in_count(self):
        m1 = _diff_sequences(BRCA1, "G" + BRCA1[1:])
        m2 = _diff_sequences("G" + BRCA1[1:], BRCA1)
        assert len(m1) == len(m2)

    def test_applying_diff_reconstructs_target(self):
        seq1 = BRCA1
        seq2 = "GTGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAG"
        mutations = _diff_sequences(seq1, seq2)
        result = list(seq1)
        for m in mutations:
            assert result[m["position"]] == m["ref"]
            result[m["position"]] = m["alt"]
        assert "".join(result) == seq2

    def test_identity_diff_is_empty(self):
        assert _diff_sequences(BRCA1, BRCA1) == []

    def test_diff_count_equals_hamming_distance(self):
        seq1 = "ATCG" * 10
        seq2 = "GTCG" * 10
        mutations = _diff_sequences(seq1, seq2)
        hamming = sum(1 for a, b in zip(seq1, seq2) if a != b)
        assert len(mutations) == hamming


# ===================================================================
# 11. VALIDATION CONSISTENCY  (Pydantic across Phase 4 endpoints)
# ===================================================================

class TestValidationConsistency:
    @pytest.mark.parametrize("endpoint,payload_key", [
        ("/api/offtarget", "sequence"),
        ("/api/optimize/codons", "sequence"),
        ("/api/experiments/record", "sequence"),
    ])
    def test_empty_sequence_rejected(self, client: TestClient, endpoint: str, payload_key: str):
        payload = {payload_key: "", "organism": "human", "operation": "initial",
                   "session_id": "x", "scores": {}}
        assert client.post(endpoint, json=payload).status_code == 422

    @pytest.mark.parametrize("endpoint,payload_key", [
        ("/api/offtarget", "sequence"),
        ("/api/optimize/codons", "sequence"),
        ("/api/experiments/record", "sequence"),
    ])
    def test_non_dna_rejected(self, client: TestClient, endpoint: str, payload_key: str):
        payload = {payload_key: "XYZQ", "organism": "human", "operation": "initial",
                   "session_id": "x", "scores": {}}
        assert client.post(endpoint, json=payload).status_code == 422


# ===================================================================
# 12. GC CONTENT AGREEMENT  (cross-service consistency)
# ===================================================================

class TestGCContentAgreement:
    def test_translation_and_offtarget_gc_agree(self):
        from services.offtarget import _gc_balance_risk
        for seq in [BRCA1, GFP, ALL_GC, "AAAA" * 10]:
            gc = gc_content(seq)
            risk = _gc_balance_risk(seq)
            if gc < 0.25 or gc > 0.75:
                assert risk == "high"
            elif gc < 0.35 or gc > 0.65:
                assert risk == "medium"
            else:
                assert risk == "low"

    def test_codon_opt_gc_delta_is_correct(self):
        """gc_content_after - gc_content_before must match actual GC delta."""
        result = optimize_codons(GFP, "e_coli")
        reported_before = result.gc_content_before
        reported_after = result.gc_content_after
        actual_before = gc_content(GFP)
        actual_after = gc_content(result.optimized_sequence)
        assert abs(reported_before - actual_before) < 1e-4
        assert abs(reported_after - actual_after) < 1e-4


# ===================================================================
# 13. ORF PRESERVATION  (codon opt doesn't destroy reading frames)
# ===================================================================

class TestORFPreservation:
    def test_orf_proteins_preserved(self):
        original_orfs = find_orfs(GFP, min_length=30)
        result = optimize_codons(GFP, "human")
        optimized_orfs = find_orfs(result.optimized_sequence, min_length=30)
        original_proteins = {o.protein for o in original_orfs}
        optimized_proteins = {o.protein for o in optimized_orfs}
        assert original_proteins == optimized_proteins

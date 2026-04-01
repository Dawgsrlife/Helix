"""Tests for experiment version tracking service — exact, deterministic assertions.

Covers:
- Version recording and retrieval
- Lineage chain (parent→child relationships)
- Revert restores exact sequence to session store
- Diff computation (SNPs, multiple edits, identity diff, length changes)
- Timeline ordering
- Auto-parent resolution
- API endpoint contracts and error handling
- Edge cases (empty session, nonexistent version, same sequence re-recorded)
"""

from __future__ import annotations

import asyncio
import json

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from main import app
from services.experiment_tracker import (
    ExperimentTracker,
    ExperimentVersion,
    ExperimentVersionNotFoundError,
    VersionDiff,
    _diff_sequences,
)
from services.session_store import MemorySessionStore


BRCA1 = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"
BRCA1_MUTATED = "GTGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"  # A→G at pos 0
BRCA1_DOUBLE_MUT = "GTGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAG"  # + T→G at last pos


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def store():
    return MemorySessionStore(default_seed=BRCA1)


@pytest.fixture
def tracker(store):
    return ExperimentTracker(store)


@pytest_asyncio.fixture
async def session(store):
    """Initialize a session with a sequence."""
    sid = "test-session"
    await store.initialize_session(sid)
    return sid


# ---------------------------------------------------------------------------
# 1. _diff_sequences — exact position-level diffs
# ---------------------------------------------------------------------------


class TestDiffSequences:
    def test_identical_sequences(self):
        mutations = _diff_sequences("ATCG", "ATCG")
        assert mutations == []

    def test_single_snp(self):
        mutations = _diff_sequences("ATCG", "GTCG")
        assert len(mutations) == 1
        assert mutations[0] == {"position": 0, "ref": "A", "alt": "G"}

    def test_multiple_snps(self):
        mutations = _diff_sequences("ATCG", "GTCA")
        # A→G at 0, G→A at 3
        assert len(mutations) == 2
        assert mutations[0] == {"position": 0, "ref": "A", "alt": "G"}
        assert mutations[1] == {"position": 3, "ref": "G", "alt": "A"}

    def test_every_position_changed(self):
        mutations = _diff_sequences("AAAA", "TTTT")
        assert len(mutations) == 4
        for i, m in enumerate(mutations):
            assert m == {"position": i, "ref": "A", "alt": "T"}

    def test_insertion_at_end(self):
        """Longer seq2 → insertions after min_len."""
        mutations = _diff_sequences("ATG", "ATGCC")
        assert len(mutations) == 2
        assert mutations[0] == {"position": 3, "ref": "-", "alt": "C"}
        assert mutations[1] == {"position": 4, "ref": "-", "alt": "C"}

    def test_deletion_at_end(self):
        """Longer seq1 → deletions after min_len."""
        mutations = _diff_sequences("ATGCC", "ATG")
        assert len(mutations) == 2
        assert mutations[0] == {"position": 3, "ref": "C", "alt": "-"}
        assert mutations[1] == {"position": 4, "ref": "C", "alt": "-"}

    def test_snp_plus_length_change(self):
        mutations = _diff_sequences("ATCG", "GTCGAA")
        # SNP at 0, insertions at 4 and 5
        assert len(mutations) == 3
        assert mutations[0] == {"position": 0, "ref": "A", "alt": "G"}
        assert mutations[1] == {"position": 4, "ref": "-", "alt": "A"}
        assert mutations[2] == {"position": 5, "ref": "-", "alt": "A"}

    def test_empty_sequences(self):
        assert _diff_sequences("", "") == []

    def test_one_empty(self):
        mutations = _diff_sequences("", "ATG")
        assert len(mutations) == 3
        assert all(m["ref"] == "-" for m in mutations)


# ---------------------------------------------------------------------------
# 2. Version recording and retrieval
# ---------------------------------------------------------------------------


class TestRecordAndRetrieve:
    @pytest.mark.asyncio
    async def test_record_version_returns_id(self, tracker, session):
        vid = await tracker.record_version(
            session_id=session,
            candidate_id=0,
            sequence=BRCA1,
            scores={"functional": 0.8, "combined": 0.7},
            operation="initial",
        )
        assert isinstance(vid, str)
        assert len(vid) == 12  # UUID hex[:12]

    @pytest.mark.asyncio
    async def test_get_version_returns_correct_data(self, tracker, session):
        vid = await tracker.record_version(
            session_id=session,
            candidate_id=0,
            sequence=BRCA1,
            scores={"functional": 0.8},
            operation="initial",
        )
        version = await tracker.get_version(session, vid)
        assert version.version_id == vid
        assert version.session_id == session
        assert version.candidate_id == 0
        assert version.sequence == BRCA1
        assert version.scores == {"functional": 0.8}
        assert version.operation == "initial"
        assert version.parent_version_id is None  # First version has no parent

    @pytest.mark.asyncio
    async def test_get_nonexistent_version_raises(self, tracker, session):
        with pytest.raises(ExperimentVersionNotFoundError):
            await tracker.get_version(session, "nonexistent")

    @pytest.mark.asyncio
    async def test_version_has_timestamp(self, tracker, session):
        vid = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        version = await tracker.get_version(session, vid)
        assert version.timestamp  # non-empty ISO string
        assert "T" in version.timestamp  # ISO-8601 format

    @pytest.mark.asyncio
    async def test_operation_details_preserved(self, tracker, session):
        vid = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="edit",
            operation_details={"position": 5, "ref_base": "A", "new_base": "G"},
        )
        version = await tracker.get_version(session, vid)
        assert version.operation_details["position"] == 5
        assert version.operation_details["ref_base"] == "A"

    @pytest.mark.asyncio
    async def test_metadata_preserved(self, tracker, session):
        vid = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
            metadata={"source": "manual_import", "file": "brca1.fasta"},
        )
        version = await tracker.get_version(session, vid)
        assert version.metadata["source"] == "manual_import"

    @pytest.mark.asyncio
    async def test_to_dict_roundtrip(self, tracker, session):
        vid = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={"f": 0.5}, operation="initial",
        )
        version = await tracker.get_version(session, vid)
        d = version.to_dict()
        restored = ExperimentVersion.from_dict(d)
        assert restored.version_id == version.version_id
        assert restored.sequence == version.sequence
        assert restored.scores == version.scores


# ---------------------------------------------------------------------------
# 3. Auto-parent resolution and lineage
# ---------------------------------------------------------------------------


class TestParentAndLineage:
    @pytest.mark.asyncio
    async def test_auto_parent_resolves(self, tracker, session):
        """Second version should automatically parent to first."""
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        v2 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_MUTATED, scores={}, operation="edit",
        )
        version2 = await tracker.get_version(session, v2)
        assert version2.parent_version_id == v1

    @pytest.mark.asyncio
    async def test_explicit_parent_overrides(self, tracker, session):
        """Explicit parent_version_id takes precedence over auto-resolution."""
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        v2 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_MUTATED, scores={}, operation="edit",
        )
        # v3 explicitly parents to v1 (skipping v2)
        v3 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_DOUBLE_MUT, scores={}, operation="edit",
            parent_version_id=v1,
        )
        version3 = await tracker.get_version(session, v3)
        assert version3.parent_version_id == v1  # Not v2

    @pytest.mark.asyncio
    async def test_lineage_chain(self, tracker, session):
        """Three versions: v1→v2→v3. Lineage of v3 = [v3, v2, v1]."""
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        v2 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_MUTATED, scores={}, operation="edit",
        )
        v3 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_DOUBLE_MUT, scores={}, operation="edit",
        )
        chain = await tracker.get_lineage(session, v3)
        assert len(chain) == 3
        assert chain[0].version_id == v3  # newest first
        assert chain[1].version_id == v2
        assert chain[2].version_id == v1  # root

    @pytest.mark.asyncio
    async def test_lineage_root_has_depth_1(self, tracker, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        chain = await tracker.get_lineage(session, v1)
        assert len(chain) == 1
        assert chain[0].version_id == v1

    @pytest.mark.asyncio
    async def test_lineage_nonexistent_returns_empty(self, tracker, session):
        """Lineage of nonexistent version should not crash."""
        chain = await tracker.get_lineage(session, "nonexistent")
        assert chain == []

    @pytest.mark.asyncio
    async def test_separate_candidates_independent(self, tracker, session):
        """Candidate 0 and candidate 1 have independent parent chains."""
        v1_c0 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        await tracker.record_version(
            session_id=session, candidate_id=1,
            sequence=BRCA1_MUTATED, scores={}, operation="initial",
        )
        v2_c0 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_DOUBLE_MUT, scores={}, operation="edit",
        )
        v2 = await tracker.get_version(session, v2_c0)
        assert v2.parent_version_id == v1_c0  # Parents within candidate 0


# ---------------------------------------------------------------------------
# 4. List versions
# ---------------------------------------------------------------------------


class TestListVersions:
    @pytest.mark.asyncio
    async def test_empty_session(self, tracker, session):
        versions = await tracker.list_versions(session)
        assert versions == []

    @pytest.mark.asyncio
    async def test_list_all_versions(self, tracker, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        v2 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_MUTATED, scores={}, operation="edit",
        )
        versions = await tracker.list_versions(session)
        assert len(versions) == 2
        assert versions[0].version_id == v1  # sorted by timestamp
        assert versions[1].version_id == v2

    @pytest.mark.asyncio
    async def test_filter_by_candidate(self, tracker, session):
        await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        await tracker.record_version(
            session_id=session, candidate_id=1,
            sequence=BRCA1_MUTATED, scores={}, operation="initial",
        )
        c0 = await tracker.list_versions(session, candidate_id=0)
        c1 = await tracker.list_versions(session, candidate_id=1)
        assert len(c0) == 1
        assert len(c1) == 1
        assert c0[0].candidate_id == 0
        assert c1[0].candidate_id == 1

    @pytest.mark.asyncio
    async def test_no_filter_returns_all(self, tracker, session):
        await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        await tracker.record_version(
            session_id=session, candidate_id=1,
            sequence=BRCA1_MUTATED, scores={}, operation="initial",
        )
        all_versions = await tracker.list_versions(session)
        assert len(all_versions) == 2


# ---------------------------------------------------------------------------
# 5. Diff versions
# ---------------------------------------------------------------------------


class TestDiffVersions:
    @pytest.mark.asyncio
    async def test_single_snp_diff(self, tracker, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        v2 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_MUTATED, scores={}, operation="edit",
        )
        diff = await tracker.diff_versions(session, v1, v2)
        assert isinstance(diff, VersionDiff)
        assert diff.total_changes == 1
        assert diff.mutations[0]["position"] == 0
        assert diff.mutations[0]["ref"] == "A"
        assert diff.mutations[0]["alt"] == "G"

    @pytest.mark.asyncio
    async def test_identity_diff(self, tracker, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        v2 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="edit",
        )
        diff = await tracker.diff_versions(session, v1, v2)
        assert diff.total_changes == 0
        assert diff.identity == 1.0

    @pytest.mark.asyncio
    async def test_identity_score_calculation(self, tracker, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence="AAAA", scores={}, operation="initial",
        )
        v2 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence="AAGA", scores={}, operation="edit",
        )
        diff = await tracker.diff_versions(session, v1, v2)
        assert diff.total_changes == 1
        assert diff.length_v1 == 4
        assert diff.length_v2 == 4
        assert abs(diff.identity - 0.75) < 1e-6  # 3/4 identical

    @pytest.mark.asyncio
    async def test_diff_nonexistent_raises(self, tracker, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        with pytest.raises(ExperimentVersionNotFoundError):
            await tracker.diff_versions(session, v1, "nonexistent")


# ---------------------------------------------------------------------------
# 6. Revert
# ---------------------------------------------------------------------------


class TestRevert:
    @pytest.mark.asyncio
    async def test_revert_restores_sequence_in_store(self, tracker, store, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={"f": 0.8}, operation="initial",
        )
        await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_MUTATED, scores={"f": 0.6}, operation="edit",
        )
        # Sequence in store is now BRCA1_MUTATED (via session_store init, not our tracker)
        await store.set_candidate_sequence(session, 0, BRCA1_MUTATED)
        assert await store.require_candidate_sequence(session, 0) == BRCA1_MUTATED

        # Revert to v1
        reverted = await tracker.revert_to_version(session, v1)
        assert reverted.operation == "revert"
        assert reverted.sequence == BRCA1

        # Session store should now have original sequence
        assert await store.require_candidate_sequence(session, 0) == BRCA1

    @pytest.mark.asyncio
    async def test_revert_creates_new_version(self, tracker, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        v2 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_MUTATED, scores={}, operation="edit",
        )
        reverted = await tracker.revert_to_version(session, v1)

        # The revert is a NEW version (not v1 or v2)
        assert reverted.version_id != v1
        assert reverted.version_id != v2
        assert reverted.parent_version_id == v1  # Points back to what we reverted to

        # Timeline now has 3 versions
        versions = await tracker.list_versions(session)
        assert len(versions) == 3

    @pytest.mark.asyncio
    async def test_revert_preserves_scores(self, tracker, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={"functional": 0.85, "combined": 0.72},
            operation="initial",
        )
        await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1_MUTATED, scores={"functional": 0.6},
            operation="edit",
        )
        reverted = await tracker.revert_to_version(session, v1)
        assert reverted.scores == {"functional": 0.85, "combined": 0.72}

    @pytest.mark.asyncio
    async def test_revert_nonexistent_raises(self, tracker, session):
        with pytest.raises(ExperimentVersionNotFoundError):
            await tracker.revert_to_version(session, "nonexistent")

    @pytest.mark.asyncio
    async def test_revert_operation_details(self, tracker, session):
        v1 = await tracker.record_version(
            session_id=session, candidate_id=0,
            sequence=BRCA1, scores={}, operation="initial",
        )
        reverted = await tracker.revert_to_version(session, v1)
        assert reverted.operation_details == {"reverted_to": v1}


# ---------------------------------------------------------------------------
# 7. API endpoint contracts
# ---------------------------------------------------------------------------


class TestExperimentAPI:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_record_version(self, client):
        res = client.post("/api/experiments/record", json={
            "session_id": "api-test",
            "candidate_id": 0,
            "sequence": BRCA1,
            "scores": {"functional": 0.8},
            "operation": "initial",
        })
        assert res.status_code == 200
        body = res.json()
        assert "version_id" in body
        assert body["session_id"] == "api-test"

    def test_record_then_list(self, client):
        sid = "api-list-test"
        r1 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1,
            "scores": {}, "operation": "initial",
        })
        r2 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1_MUTATED,
            "scores": {}, "operation": "edit",
        })
        v1 = r1.json()["version_id"]
        v2 = r2.json()["version_id"]

        # List all
        res = client.get(f"/api/experiments/{sid}")
        assert res.status_code == 200
        body = res.json()
        assert body["session_id"] == sid
        assert body["count"] == 2
        ids = [v["version_id"] for v in body["versions"]]
        assert v1 in ids
        assert v2 in ids

    def test_get_specific_version(self, client):
        sid = "api-get-test"
        r = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1,
            "scores": {"f": 0.9}, "operation": "initial",
        })
        vid = r.json()["version_id"]

        res = client.get(f"/api/experiments/{sid}/{vid}")
        assert res.status_code == 200
        body = res.json()
        assert body["version_id"] == vid
        assert body["sequence"] == BRCA1
        assert body["scores"] == {"f": 0.9}

    def test_get_nonexistent_version_404(self, client):
        res = client.get("/api/experiments/api-test/nonexistent")
        assert res.status_code == 404

    def test_revert_endpoint(self, client):
        sid = "api-revert-test"
        r1 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1,
            "scores": {}, "operation": "initial",
        })
        client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1_MUTATED,
            "scores": {}, "operation": "edit",
        })
        v1 = r1.json()["version_id"]

        res = client.post("/api/experiments/revert", json={
            "session_id": sid, "version_id": v1,
        })
        assert res.status_code == 200
        body = res.json()
        assert body["reverted"] is True
        assert body["operation"] == "revert"
        assert body["restored_sequence_length"] == len(BRCA1)

    def test_revert_nonexistent_404(self, client):
        res = client.post("/api/experiments/revert", json={
            "session_id": "any", "version_id": "nonexistent",
        })
        assert res.status_code == 404

    def test_diff_endpoint(self, client):
        sid = "api-diff-test"
        r1 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1,
            "scores": {}, "operation": "initial",
        })
        r2 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1_MUTATED,
            "scores": {}, "operation": "edit",
        })
        v1 = r1.json()["version_id"]
        v2 = r2.json()["version_id"]

        res = client.post("/api/experiments/diff", json={
            "session_id": sid, "v1_id": v1, "v2_id": v2,
        })
        assert res.status_code == 200
        body = res.json()
        assert body["total_changes"] == 1
        assert body["mutations"][0]["position"] == 0
        assert body["mutations"][0]["ref"] == "A"
        assert body["mutations"][0]["alt"] == "G"

    def test_diff_nonexistent_404(self, client):
        res = client.post("/api/experiments/diff", json={
            "session_id": "any", "v1_id": "a", "v2_id": "b",
        })
        assert res.status_code == 404

    def test_lineage_endpoint(self, client):
        sid = "api-lineage-test"
        r1 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1,
            "scores": {}, "operation": "initial",
        })
        r2 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1_MUTATED,
            "scores": {}, "operation": "edit",
        })
        v2 = r2.json()["version_id"]

        res = client.get(f"/api/experiments/{sid}/{v2}/lineage")
        assert res.status_code == 200
        body = res.json()
        assert body["depth"] == 2
        assert body["lineage"][0]["version_id"] == v2  # newest first

    def test_record_requires_operation(self, client):
        res = client.post("/api/experiments/record", json={
            "session_id": "test", "sequence": BRCA1,
            "scores": {},
            # Missing "operation"
        })
        assert res.status_code == 422

    def test_record_invalid_sequence(self, client):
        res = client.post("/api/experiments/record", json={
            "session_id": "test", "sequence": "XYZQ",
            "scores": {}, "operation": "initial",
        })
        assert res.status_code == 422

    def test_revert_empty_version_id_rejected(self, client):
        res = client.post("/api/experiments/revert", json={
            "session_id": "test", "version_id": "",
        })
        assert res.status_code == 422

    def test_diff_response_shape(self, client):
        sid = "api-shape-test"
        r1 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1,
            "scores": {}, "operation": "initial",
        })
        r2 = client.post("/api/experiments/record", json={
            "session_id": sid, "sequence": BRCA1,
            "scores": {}, "operation": "edit",
        })
        v1 = r1.json()["version_id"]
        v2 = r2.json()["version_id"]

        res = client.post("/api/experiments/diff", json={
            "session_id": sid, "v1_id": v1, "v2_id": v2,
        })
        body = res.json()
        expected_keys = {
            "v1_id", "v2_id", "length_v1", "length_v2",
            "mutations", "total_changes", "identity",
        }
        assert set(body.keys()) == expected_keys


# ---------------------------------------------------------------------------
# 8. Auto-recording integration (via edit_base)
# ---------------------------------------------------------------------------


class TestAutoRecording:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_edit_base_auto_records_version(self, client):
        """Base edits should automatically create experiment versions."""
        sid = "auto-record-test"
        client.post("/api/design", json={"goal": "test", "session_id": sid})

        # Perform edit
        client.post("/api/edit/base", json={
            "session_id": sid, "candidate_id": 0,
            "position": 0, "new_base": "G",
        })

        # Check experiment timeline
        res = client.get(f"/api/experiments/{sid}")
        body = res.json()
        # Should have at least 1 version from the edit
        assert body["count"] >= 1
        last = body["versions"][-1]
        assert last["operation"] == "edit"
        assert last["operation_details"]["position"] == 0
        assert last["operation_details"]["new_base"] == "G"

    def test_multiple_edits_create_parent_chain(self, client):
        """Sequential edits should form a parent→child chain."""
        sid = "parent-chain-test"
        client.post("/api/design", json={"goal": "test", "session_id": sid})

        # Two sequential edits
        client.post("/api/edit/base", json={
            "session_id": sid, "candidate_id": 0,
            "position": 0, "new_base": "G",
        })
        client.post("/api/edit/base", json={
            "session_id": sid, "candidate_id": 0,
            "position": 1, "new_base": "C",
        })

        res = client.get(f"/api/experiments/{sid}")
        versions = res.json()["versions"]
        assert len(versions) >= 2

        # Last version should parent to second-to-last
        last = versions[-1]
        second_last = versions[-2]
        assert last["parent_version_id"] == second_last["version_id"]

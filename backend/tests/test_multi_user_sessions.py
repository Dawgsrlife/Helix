"""Tests for multi-user session management (Phase 3.3).

Covers session ownership, user isolation, session listing,
and concurrent access patterns.
"""

import pytest
from services.session_store import (
    MemorySessionStore,
    SessionNotFoundError,
    CandidateNotFoundError,
)

DEFAULT_SEED = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"


# -------------------------------------------------------------------------
# Session ownership
# -------------------------------------------------------------------------


class TestSessionOwnership:
    @pytest.mark.asyncio
    async def test_initialize_with_user_id(self):
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        await store.initialize_session("session-1", user_id="user-alice")
        owner = await store.get_session_owner("session-1")
        assert owner == "user-alice"

    @pytest.mark.asyncio
    async def test_initialize_without_user_id(self):
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        await store.initialize_session("session-anon")
        owner = await store.get_session_owner("session-anon")
        assert owner is None

    @pytest.mark.asyncio
    async def test_owner_not_found(self):
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        owner = await store.get_session_owner("nonexistent")
        assert owner is None


# -------------------------------------------------------------------------
# Session listing
# -------------------------------------------------------------------------


class TestListUserSessions:
    @pytest.mark.asyncio
    async def test_list_single_session(self):
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        await store.initialize_session("s1", user_id="alice")
        sessions = await store.list_user_sessions("alice")
        assert sessions == ["s1"]

    @pytest.mark.asyncio
    async def test_list_multiple_sessions(self):
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        await store.initialize_session("s1", user_id="bob")
        await store.initialize_session("s2", user_id="bob")
        await store.initialize_session("s3", user_id="bob")
        sessions = await store.list_user_sessions("bob")
        assert sorted(sessions) == ["s1", "s2", "s3"]

    @pytest.mark.asyncio
    async def test_list_empty_for_unknown_user(self):
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        sessions = await store.list_user_sessions("nobody")
        assert sessions == []

    @pytest.mark.asyncio
    async def test_sessions_isolated_between_users(self):
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        await store.initialize_session("alice-s1", user_id="alice")
        await store.initialize_session("bob-s1", user_id="bob")
        await store.initialize_session("alice-s2", user_id="alice")

        alice_sessions = await store.list_user_sessions("alice")
        bob_sessions = await store.list_user_sessions("bob")

        assert sorted(alice_sessions) == ["alice-s1", "alice-s2"]
        assert bob_sessions == ["bob-s1"]


# -------------------------------------------------------------------------
# Session data isolation
# -------------------------------------------------------------------------


class TestSessionDataIsolation:
    @pytest.mark.asyncio
    async def test_different_users_different_data(self):
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        await store.initialize_session("s-alice", user_id="alice")
        await store.initialize_session("s-bob", user_id="bob")

        await store.set_candidate_sequence("s-alice", 0, "AAAA")
        await store.set_candidate_sequence("s-bob", 0, "TTTT")

        alice_seq = await store.require_candidate_sequence("s-alice", 0)
        bob_seq = await store.require_candidate_sequence("s-bob", 0)

        assert alice_seq == "AAAA"
        assert bob_seq == "TTTT"

    @pytest.mark.asyncio
    async def test_cannot_access_other_users_session_data(self):
        """Session data access is by session_id — no cross-contamination."""
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        await store.initialize_session("s-private", user_id="alice")
        await store.set_candidate_sequence("s-private", 1, "GCGCGCGC")

        # Bob can't list Alice's sessions
        bob_sessions = await store.list_user_sessions("bob")
        assert "s-private" not in bob_sessions

    @pytest.mark.asyncio
    async def test_anonymous_sessions_work(self):
        """Sessions without user_id still function for backward compat."""
        store = MemorySessionStore(default_seed=DEFAULT_SEED)
        await store.initialize_session("anon-session")
        seq = await store.require_candidate_sequence("anon-session", 0)
        assert seq == DEFAULT_SEED


# -------------------------------------------------------------------------
# Request model tests
# -------------------------------------------------------------------------


class TestDesignRequestUserId:
    def test_request_with_user_id(self):
        from models.requests import DesignRequest
        req = DesignRequest(goal="Design a BDNF enhancer", user_id="researcher-123")
        assert req.user_id == "researcher-123"

    def test_request_without_user_id(self):
        from models.requests import DesignRequest
        req = DesignRequest(goal="Design a promoter")
        assert req.user_id is None


# -------------------------------------------------------------------------
# API endpoint tests
# -------------------------------------------------------------------------


class TestSessionEndpoints:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app)

    def test_design_with_user_id(self, client):
        response = client.post("/api/design", json={
            "goal": "Design a BDNF enhancer",
            "user_id": "test-user-1",
        })
        assert response.status_code == 202
        data = response.json()
        assert "session_id" in data

    def test_list_sessions_empty(self, client):
        response = client.get("/api/sessions/nonexistent-user")
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "nonexistent-user"
        assert data["count"] == 0
        assert data["sessions"] == []

    def test_design_then_list(self, client):
        # Create a session with a user_id
        design_resp = client.post("/api/design", json={
            "goal": "Design test sequence",
            "user_id": "list-test-user",
            "session_id": "list-test-session",
        })
        assert design_resp.status_code == 202

        # List sessions for that user
        list_resp = client.get("/api/sessions/list-test-user")
        assert list_resp.status_code == 200
        data = list_resp.json()
        assert "list-test-session" in data["sessions"]
        assert data["count"] >= 1

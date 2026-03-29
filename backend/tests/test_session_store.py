"""Tests for in-memory session state store."""

import pytest

from services.session_store import CandidateNotFoundError, SessionNotFoundError, SessionStore


def test_initialize_session_sets_default_candidate() -> None:
    store = SessionStore(default_seed="ATGC")
    store.initialize_session("s1")
    assert store.require_candidate_sequence("s1", 0) == "ATGC"


def test_seed_for_missing_session_returns_default_seed() -> None:
    store = SessionStore(default_seed="ATGC")
    assert store.seed_for_session("missing") == "ATGC"


def test_pending_goal_lifecycle() -> None:
    store = SessionStore(default_seed="ATGC")
    store.set_pending_goal("s1", "design promoter")
    assert store.pop_pending_goal("s1") == "design promoter"
    assert store.pop_pending_goal("s1") is None


def test_candidate_lifecycle_and_overwrite() -> None:
    store = SessionStore(default_seed="ATGC")
    store.initialize_session("s1")
    store.set_candidate_sequence("s1", 0, "ATGCGG")
    store.set_candidate_sequence("s1", 1, "TTAA")
    assert store.require_candidate_sequence("s1", 0) == "ATGCGG"
    assert store.require_candidate_sequence("s1", 1) == "TTAA"


def test_require_candidate_raises_for_missing_session() -> None:
    store = SessionStore(default_seed="ATGC")
    with pytest.raises(SessionNotFoundError):
        store.require_candidate_sequence("missing", 0)


def test_require_candidate_raises_for_missing_candidate() -> None:
    store = SessionStore(default_seed="ATGC")
    store.initialize_session("s1")
    with pytest.raises(CandidateNotFoundError):
        store.require_candidate_sequence("s1", 99)


"""Integration tests for FastAPI endpoints and websocket pipeline."""

from fastapi.testclient import TestClient
import pytest

import main
from main import app


def test_health_endpoint() -> None:
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in {"healthy", "unhealthy", "degraded"}
    assert "inference_mode" in body


def test_mutations_endpoint() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/mutations",
        json={"sequence": "ATGGATTTATCT", "position": 3, "alternate_base": "C"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["position"] == 3
    assert body["alternate_base"] == "C"
    assert body["predicted_impact"] in {"benign", "moderate", "deleterious"}


def test_edit_base_endpoint() -> None:
    client = TestClient(app)
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "abc"})
    res = client.post(
        "/api/edit/base",
        json={"session_id": "abc", "candidate_id": 0, "position": 4, "new_base": "G"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["position"] == 4
    assert "updated_scores" in body
    assert "functional" in body["updated_scores"]


def test_analyze_endpoint_shape() -> None:
    client = TestClient(app)
    res = client.post("/api/analyze", json={"sequence": "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"})
    assert res.status_code == 200
    body = res.json()
    assert body["sequence"].startswith("ATG")
    assert isinstance(body["scores"], list)
    assert isinstance(body["proteins"], list)


def test_design_and_websocket_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    session_id = "ws-test-session"

    async def fake_run_generation_pipeline(*, manager, service, session_id: str, goal: str, **_kwargs) -> None:
        await manager.send_event(
            session_id,
            {
                "event": "pipeline_manifest",
                "data": {
                    "session_id": session_id,
                    "requested_candidates": 1,
                    "candidate_ids": [0],
                    "run_profile": "demo",
                },
            },
        )
        await manager.send_event(
            session_id,
            {"event": "stage_status", "data": {"stage": "intent", "status": "active", "progress": 0.1}},
        )
        await manager.send_event(
            session_id,
            {"event": "candidate_status", "data": {"candidate_id": 0, "status": "running"}},
        )
        await manager.send_event(
            session_id,
            {"event": "intent_parsed", "data": {"spec": {"target_gene": "BDNF"}}},
        )
        await manager.send_event(
            session_id,
            {"event": "generation_token", "data": {"candidate_id": 0, "token": "A", "position": 3}},
        )
        await manager.send_event(
            session_id,
            {
                "event": "candidate_scored",
                "data": {
                    "candidate_id": 0,
                    "scores": {
                        "functional": 0.8,
                        "tissue_specificity": 0.6,
                        "off_target": 0.1,
                        "novelty": 0.4,
                        "combined": 0.68,
                    },
                },
            },
        )
        await manager.send_event(
            session_id,
            {
                "event": "pipeline_complete",
                "data": {
                    "requested_candidates": 1,
                    "completed_candidates": 1,
                    "failed_candidates": 0,
                    "candidates": [{"id": 0, "status": "structured", "sequence": "ATG"}],
                },
            },
        )

    monkeypatch.setattr(main, "run_generation_pipeline", fake_run_generation_pipeline)
    start = client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
    assert start.status_code == 202
    start_body = start.json()
    assert start_body["ws_url"] == f"ws://testserver/ws/pipeline/{session_id}"
    with client.websocket_connect(f"/ws/pipeline/{session_id}") as ws:
        events = []
        for _ in range(80):
            msg = ws.receive_json()
            events.append(msg["event"])
            if msg["event"] == "pipeline_complete":
                break

        assert events[0] == "pipeline_manifest"
        assert "stage_status" in events
        assert "candidate_status" in events
        assert "intent_parsed" in events
        assert "generation_token" in events
        assert "candidate_scored" in events
        assert "pipeline_complete" in events


def test_design_ws_url_uses_wss_for_https() -> None:
    client = TestClient(app, base_url="https://helix.example.com")
    session_id = "secure-session"
    res = client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
    assert res.status_code == 202
    body = res.json()
    assert body["ws_url"] == f"wss://helix.example.com/ws/pipeline/{session_id}"


def test_followup_endpoint() -> None:
    client = TestClient(app)
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "abc"})
    res = client.post(
        "/api/edit/followup",
        json={"session_id": "abc", "message": "make this more tissue-specific", "candidate_id": 0},
    )
    assert res.status_code == 202
    body = res.json()
    assert body["status"] == "partial_rerun_started"
    assert "evo2_scoring" in body["steps_rerunning"]


def test_agent_chat_explain_endpoint() -> None:
    client = TestClient(app)
    session_id = "agent-explain"
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})

    res = client.post(
        "/api/agent/chat",
        json={"session_id": session_id, "candidate_id": 0, "message": "explain this candidate"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "assistant_message" in body
    assert body["tool_calls"][0]["tool"] == "score_candidate"
    assert body["candidate_update"]["candidate_id"] == 0
    assert "combined" in body["candidate_update"]["scores"]


def test_agent_chat_explicit_edit_persists_sequence() -> None:
    client = TestClient(app)
    session_id = "agent-edit"
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})

    edit = client.post(
        "/api/agent/chat",
        json={"session_id": session_id, "candidate_id": 0, "message": "change base position 5 to G"},
    )
    assert edit.status_code == 200
    body = edit.json()
    assert body["candidate_update"]["mutation"]["position"] == 5
    assert body["candidate_update"]["mutation"]["new_base"] == "G"

    # Base should now be persisted as G; next mutation reports G as reference.
    verify = client.post(
        "/api/edit/base",
        json={"session_id": session_id, "candidate_id": 0, "position": 5, "new_base": "A"},
    )
    assert verify.status_code == 200
    assert verify.json()["reference_base"] == "G"


def test_agent_chat_failed_edit_falls_back_to_scoring() -> None:
    client = TestClient(app)
    session_id = "agent-failed-edit-fallback"
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})

    response = client.post(
        "/api/agent/chat",
        json={
            "session_id": session_id,
            "candidate_id": 0,
            "message": "change base position 99999 to G and explain impact",
        },
    )
    assert response.status_code == 200
    body = response.json()
    tools = body["tool_calls"]
    assert any(call["tool"] == "edit_base" and call["status"] == "failed" for call in tools)
    assert any(call["tool"] == "score_candidate" and call["status"] == "ok" for call in tools)
    assert body["candidate_update"] is not None
    assert "combined" in body["candidate_update"]["scores"]


def test_agent_chat_transform_all_ts_persists_sequence() -> None:
    client = TestClient(app)
    session_id = "agent-transform"
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})

    transform = client.post(
        "/api/agent/chat",
        json={
            "session_id": session_id,
            "candidate_id": 0,
            "message": "Make the genome all Ts for the fun of it",
        },
    )
    assert transform.status_code == 200
    body = transform.json()
    assert any(call["tool"] == "transform_sequence" for call in body["tool_calls"])
    transformed_sequence = body["candidate_update"]["sequence"]
    assert transformed_sequence
    assert set(transformed_sequence) == {"T"}
    assert isinstance(body["candidate_update"]["pdb_data"], str)
    assert body["candidate_update"]["pdb_data"].startswith("HEADER")

    # Verify transformed sequence persisted in session store.
    verify = client.post(
        "/api/edit/base",
        json={"session_id": session_id, "candidate_id": 0, "position": 10, "new_base": "A"},
    )
    assert verify.status_code == 200
    assert verify.json()["reference_base"] == "T"


def test_agent_chat_replace_all_g_to_c_only_replaces_g() -> None:
    client = TestClient(app)
    session_id = "agent-replace-gc"
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})

    baseline = client.post(
        "/api/agent/chat",
        json={"session_id": session_id, "candidate_id": 0, "message": "explain this candidate"},
    )
    assert baseline.status_code == 200
    original_sequence = baseline.json()["candidate_update"]["sequence"]

    transform = client.post(
        "/api/agent/chat",
        json={
            "session_id": session_id,
            "candidate_id": 0,
            "message": "change all Gs to Cs",
        },
    )
    assert transform.status_code == 200
    body = transform.json()
    assert any(call["tool"] == "transform_sequence" for call in body["tool_calls"])
    transformed_sequence = body["candidate_update"]["sequence"]

    assert len(transformed_sequence) == len(original_sequence)
    for before, after in zip(original_sequence, transformed_sequence, strict=True):
        if before == "G":
            assert after == "C"
        else:
            assert after == before


def test_design_accepts_run_profile() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/design",
        json={"goal": "Design BDNF enhancer", "session_id": "run-profile", "run_profile": "live"},
    )
    assert res.status_code == 202
    assert res.json()["session_id"] == "run-profile"


def test_design_defaults_to_ten_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    seen: dict[str, int] = {}

    async def fake_run_generation_pipeline(*, n_candidates: int, **_kwargs) -> None:
        seen["n_candidates"] = n_candidates

    monkeypatch.setattr(main, "run_generation_pipeline", fake_run_generation_pipeline)
    res = client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "default-ten"})
    assert res.status_code == 202
    # Allow scheduled task to run in TestClient event loop.
    import time

    timeout_at = time.time() + 1.0
    while "n_candidates" not in seen and time.time() < timeout_at:
        time.sleep(0.01)

    assert seen["n_candidates"] == 10


def test_edit_base_requires_existing_session() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/edit/base",
        json={"session_id": "missing", "candidate_id": 0, "position": 1, "new_base": "A"},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "session not found"


def test_edit_base_requires_existing_candidate() -> None:
    client = TestClient(app)
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "abc"})
    res = client.post(
        "/api/edit/base",
        json={"session_id": "abc", "candidate_id": 123, "position": 1, "new_base": "A"},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "candidate 123 not found"


def test_followup_requires_existing_session() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/edit/followup",
        json={"session_id": "missing", "message": "make it novel", "candidate_id": 0},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "session not found"


def test_followup_requires_existing_candidate() -> None:
    client = TestClient(app)
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "abc"})
    res = client.post(
        "/api/edit/followup",
        json={"session_id": "abc", "message": "make it novel", "candidate_id": 99},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "candidate 99 not found"


def test_edit_base_persists_mutation_across_calls() -> None:
    client = TestClient(app)
    session_id = "persist-edits"
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})

    first = client.post(
        "/api/edit/base",
        json={"session_id": session_id, "candidate_id": 0, "position": 0, "new_base": "T"},
    )
    assert first.status_code == 200
    assert first.json()["reference_base"] == "A"

    second = client.post(
        "/api/edit/base",
        json={"session_id": session_id, "candidate_id": 0, "position": 0, "new_base": "G"},
    )
    assert second.status_code == 200
    assert second.json()["reference_base"] == "T"


def test_followup_then_edit_reflects_updated_candidate_state() -> None:
    client = TestClient(app)
    session_id = "followup-persist"
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
    followup = client.post(
        "/api/edit/followup",
        json={"session_id": session_id, "message": "make this more tissue-specific", "candidate_id": 0},
    )
    assert followup.status_code == 202

    # followup mutates position 20 to C in the current heuristic pipeline
    edit = client.post(
        "/api/edit/base",
        json={"session_id": session_id, "candidate_id": 0, "position": 20, "new_base": "A"},
    )
    assert edit.status_code == 200
    assert edit.json()["reference_base"] == "C"


def test_edit_base_returns_423_when_candidate_locked(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "lock-session"})

    class _FailLock:
        async def __aenter__(self):
            raise main.SessionLockTimeoutError("lock-session", 0)

        async def __aexit__(self, _exc_type, _exc, _tb):
            return False

    monkeypatch.setattr(main.session_store, "candidate_guard", lambda _sid, _cid: _FailLock())

    res = client.post(
        "/api/edit/base",
        json={"session_id": "lock-session", "candidate_id": 0, "position": 0, "new_base": "A"},
    )
    assert res.status_code == 423
    assert res.json()["detail"] == "candidate is busy; retry shortly"

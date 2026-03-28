"""Integration tests for FastAPI endpoints and websocket pipeline."""

from fastapi.testclient import TestClient

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


def test_design_and_websocket_stream() -> None:
    client = TestClient(app)
    session_id = "ws-test-session"

    start = client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
    assert start.status_code == 202
    with client.websocket_connect(f"/ws/pipeline/{session_id}") as ws:
        events = []
        for _ in range(80):
            msg = ws.receive_json()
            events.append(msg["event"])
            if msg["event"] == "pipeline_complete":
                break

        assert "intent_parsed" in events
        assert "generation_token" in events
        assert "candidate_scored" in events
        assert "pipeline_complete" in events


def test_followup_endpoint() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/edit/followup",
        json={"session_id": "abc", "message": "make this more tissue-specific", "candidate_id": 0},
    )
    assert res.status_code == 202
    body = res.json()
    assert body["status"] == "partial_rerun_started"
    assert "evo2_scoring" in body["steps_rerunning"]

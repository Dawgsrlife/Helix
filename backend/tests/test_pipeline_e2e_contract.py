"""End-to-end pipeline contract tests with realistic workflow transitions."""

from fastapi.testclient import TestClient
import pytest

import main
from main import app


def test_post_then_ws_receives_full_event_chain(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    session_id = "e2e-post-then-ws"
    called = []

    async def fake_run_generation_pipeline(*, manager, service, session_id: str, goal: str, **kwargs) -> None:
        called.append(goal)
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
            {"event": "intent_parsed", "data": {"spec": {"target_gene": "BDNF"}}},
        )
        await manager.send_event(
            session_id,
            {"event": "retrieval_progress", "data": {"source": "ncbi", "status": "complete", "result": {}}},
        )
        await manager.send_event(
            session_id,
            {"event": "candidate_status", "data": {"candidate_id": 0, "status": "running"}},
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
                        "functional": 0.7,
                        "tissue_specificity": 0.6,
                        "off_target": 0.2,
                        "novelty": 0.4,
                        "combined": 0.62,
                    },
                },
            },
        )
        await manager.send_event(
            session_id,
            {"event": "structure_ready", "data": {"candidate_id": 0, "pdb_data": "ATOM ...", "confidence": 0.72}},
        )
        await manager.send_event(
            session_id,
            {"event": "explanation_chunk", "data": {"candidate_id": 0, "text": "Candidate explanation"}},
        )
        await manager.send_event(
            session_id,
            {
                "event": "pipeline_complete",
                "data": {
                    "requested_candidates": 1,
                    "completed_candidates": 1,
                    "failed_candidates": 0,
                    "candidates": [
                        {
                            "id": 0,
                            "status": "structured",
                            "sequence": "ATG",
                            "scores": {"functional": 0.7, "combined": 0.62},
                            "pdb_data": "ATOM ...",
                            "confidence": 0.72,
                            "error": None,
                        }
                    ],
                },
            },
        )

    monkeypatch.setattr(main, "run_generation_pipeline", fake_run_generation_pipeline)
    start = client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
    assert start.status_code == 202

    with client.websocket_connect(f"/ws/pipeline/{session_id}") as ws:
        events: list[str] = []
        final_candidate = None
        for _ in range(120):
            msg = ws.receive_json()
            events.append(msg["event"])
            if msg["event"] == "pipeline_complete":
                final_candidate = msg["data"]["candidates"][0]
                break

    assert events[0] == "pipeline_manifest"
    assert "intent_parsed" in events
    assert "stage_status" in events
    assert "candidate_status" in events
    assert "retrieval_progress" in events
    assert "generation_token" in events
    assert "candidate_scored" in events
    assert "structure_ready" in events
    assert "explanation_chunk" in events
    assert events[-1] == "pipeline_complete"
    assert final_candidate is not None
    assert final_candidate["id"] == 0
    assert final_candidate["status"] in {"structured", "failed", "scored"}
    assert isinstance(final_candidate["sequence"], str)
    assert len(final_candidate["sequence"]) > 0
    assert "scores" in final_candidate
    assert called


def test_ws_then_post_starts_pipeline_for_live_session(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    session_id = "e2e-ws-then-post"

    called = {"value": False}

    async def fake_run_generation_pipeline(*, manager, service, session_id: str, goal: str, **_kwargs) -> None:
        called["value"] = True
        await manager.send_event(
            session_id,
            {
                "event": "pipeline_complete",
                "data": {
                    "requested_candidates": 1,
                    "completed_candidates": 1,
                    "failed_candidates": 0,
                    "candidates": [{"id": 0, "sequence": "ATG", "status": "structured"}],
                },
            },
        )

    monkeypatch.setattr(main, "run_generation_pipeline", fake_run_generation_pipeline)

    with client.websocket_connect(f"/ws/pipeline/{session_id}") as ws:
        start = client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
        assert start.status_code == 202
        msg = ws.receive_json()
        assert msg["event"] == "pipeline_complete"
        assert called["value"] is True


def test_followup_e2e_updates_candidate_and_returns_expected_steps(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    session_id = "e2e-followup"

    async def fake_run_generation_pipeline(*, manager, service, session_id: str, goal: str, **kwargs) -> None:
        on_candidate_ready = kwargs.get("on_candidate_ready")
        if on_candidate_ready is not None:
            callback_result = on_candidate_ready(0, "ATGGATTTATCTGCTCTTCGCGTT")
            if hasattr(callback_result, "__await__"):
                await callback_result
        await manager.send_event(
            session_id,
            {
                "event": "pipeline_complete",
                "data": {
                    "requested_candidates": 1,
                    "completed_candidates": 1,
                    "failed_candidates": 0,
                    "candidates": [{"id": 0, "status": "structured", "sequence": "ATGGATTTATCTGCTCTTCGCGTT"}],
                },
            },
        )

    monkeypatch.setattr(main, "run_generation_pipeline", fake_run_generation_pipeline)
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
    with client.websocket_connect(f"/ws/pipeline/{session_id}") as ws:
        for _ in range(120):
            msg = ws.receive_json()
            if msg["event"] == "pipeline_complete":
                break

    followup = client.post(
        "/api/edit/followup",
        json={"session_id": session_id, "message": "make this more tissue-specific", "candidate_id": 0},
    )
    assert followup.status_code == 202
    body = followup.json()
    assert body["status"] == "partial_rerun_started"
    assert body["steps_rerunning"] == ["intent_parse", "evo2_generation", "evo2_scoring"]

    # Heuristic followup currently mutates position 20 to C; verify state transition via edit response
    edit = client.post(
        "/api/edit/base",
        json={"session_id": session_id, "candidate_id": 0, "position": 20, "new_base": "A"},
    )
    assert edit.status_code == 200
    assert edit.json()["reference_base"] == "C"

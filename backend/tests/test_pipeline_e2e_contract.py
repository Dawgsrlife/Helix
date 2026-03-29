"""End-to-end pipeline contract tests with realistic workflow transitions."""

import queue
import threading

from fastapi.testclient import TestClient
import pytest

import main
from main import app


def _receive_json_with_timeout(ws, timeout_seconds: float = 5.0) -> dict[str, object]:
    out: "queue.Queue[tuple[str, object]]" = queue.Queue()

    def _reader() -> None:
        try:
            out.put(("ok", ws.receive_json()))
        except Exception as exc:  # pragma: no cover - test utility
            out.put(("err", exc))

    thread = threading.Thread(target=_reader, daemon=True)
    thread.start()
    thread.join(timeout_seconds)
    if thread.is_alive():
        raise AssertionError("Timed out waiting for websocket message")

    kind, payload = out.get_nowait()
    if kind == "err":
        raise payload  # type: ignore[misc]
    return payload  # type: ignore[return-value]


def test_post_then_ws_receives_full_event_chain() -> None:
    client = TestClient(app)
    session_id = "e2e-post-then-ws"
    start = client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
    assert start.status_code == 202

    with client.websocket_connect(f"/ws/pipeline/{session_id}") as ws:
        events: list[str] = []
        final_candidate = None
        for _ in range(120):
            msg = _receive_json_with_timeout(ws)
            events.append(msg["event"])
            if msg["event"] == "pipeline_complete":
                final_candidate = msg["data"]["candidates"][0]
                break

    assert "intent_parsed" in events
    assert "retrieval_progress" in events
    assert "generation_token" in events
    assert "candidate_scored" in events
    assert "structure_ready" in events
    assert "explanation_chunk" in events
    assert events[-1] == "pipeline_complete"
    assert final_candidate is not None
    assert final_candidate["id"] == 0
    assert isinstance(final_candidate["sequence"], str)
    assert len(final_candidate["sequence"]) > 0
    assert "scores" in final_candidate


def test_ws_then_post_starts_pipeline_for_live_session(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    session_id = "e2e-ws-then-post"

    called = threading.Event()

    async def fake_run_generation_pipeline(*, manager, service, session_id: str, goal: str, **_kwargs) -> None:
        called.set()
        await manager.send_event(
            session_id,
            {"event": "pipeline_complete", "data": {"candidates": [{"id": 0, "sequence": "ATG"}]}},
        )

    monkeypatch.setattr(main, "run_generation_pipeline", fake_run_generation_pipeline)

    with client.websocket_connect(f"/ws/pipeline/{session_id}") as ws:
        status_code_box: dict[str, int] = {}

        def _post_design() -> None:
            start = client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
            status_code_box["code"] = start.status_code

        post_thread = threading.Thread(target=_post_design, daemon=True)
        post_thread.start()
        post_thread.join(5.0)
        assert status_code_box.get("code") == 202

        msg = _receive_json_with_timeout(ws)
        assert msg["event"] == "pipeline_complete"
        assert called.is_set()


def test_followup_e2e_updates_candidate_and_returns_expected_steps() -> None:
    client = TestClient(app)
    session_id = "e2e-followup"

    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": session_id})
    with client.websocket_connect(f"/ws/pipeline/{session_id}") as ws:
        for _ in range(120):
            msg = _receive_json_with_timeout(ws)
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

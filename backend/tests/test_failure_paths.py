"""Failure-path and degradation behavior tests with exact expected outputs."""

from fastapi.testclient import TestClient
import pytest

import main
from main import app


def test_followup_returns_423_when_candidate_locked(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "lock-followup"})

    class _FailLock:
        async def __aenter__(self):
            raise main.SessionLockTimeoutError("lock-followup", 0)

        async def __aexit__(self, _exc_type, _exc, _tb):
            return False

    monkeypatch.setattr(main.session_store, "candidate_guard", lambda _sid, _cid: _FailLock())

    res = client.post(
        "/api/edit/followup",
        json={"session_id": "lock-followup", "message": "make it novel", "candidate_id": 0},
    )
    assert res.status_code == 423
    assert res.json()["detail"] == "candidate is busy; retry shortly"


def test_structure_uses_mock_when_predict_structure_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)

    async def fake_predict(*_args, **_kwargs):
        return None

    monkeypatch.setattr(main, "predict_structure", fake_predict)

    res = client.post(
        "/api/structure",
        json={"sequence": "ATGGATTTATCTGCTCTTCGCGTTGAAGAAG", "region_start": 0, "region_end": 12},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["model"] == "mock"
    assert body["confidence"] == 0.71
    assert body["pdb_data"].startswith("HEADER")


def test_health_defaults_when_service_payload_missing_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)

    async def fake_health() -> dict[str, object]:
        return {"status": "healthy"}  # intentionally sparse

    monkeypatch.setattr(main.evo2_service, "health", fake_health)
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert body["model"] == "unknown"
    assert body["gpu_available"] is False
    assert body["inference_mode"] == "unknown"


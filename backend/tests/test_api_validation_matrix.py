"""Strict API validation matrix: invalid/edge payloads with exact contracts."""

from fastapi.testclient import TestClient
import pytest

from main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.mark.parametrize(
    ("payload", "expected_detail_substr"),
    [
        ({"sequence": ""}, "Sequence must not be empty"),
        ({"sequence": "ATXB"}, "Invalid nucleotides"),
    ],
)
def test_analyze_validation_errors(client: TestClient, payload: dict[str, object], expected_detail_substr: str) -> None:
    res = client.post("/api/analyze", json=payload)
    assert res.status_code == 422
    body = res.json()
    assert expected_detail_substr in str(body)


@pytest.mark.parametrize(
    "new_base",
    ["", "X", "U", "atx"],
)
def test_edit_base_invalid_new_base(client: TestClient, new_base: str) -> None:
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "vbase"})
    res = client.post(
        "/api/edit/base",
        json={"session_id": "vbase", "candidate_id": 0, "position": 0, "new_base": new_base},
    )
    assert res.status_code == 422
    assert "Invalid base" in str(res.json())


def test_edit_base_position_out_of_range(client: TestClient) -> None:
    client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "vrange"})
    res = client.post(
        "/api/edit/base",
        json={"session_id": "vrange", "candidate_id": 0, "position": 9999, "new_base": "A"},
    )
    assert res.status_code == 422
    assert res.json()["detail"] == "position out of range"


@pytest.mark.parametrize(
    ("payload", "expected_detail_substr"),
    [
        ({"sequence": "", "position": 0, "alternate_base": "A"}, "Sequence must not be empty"),
        ({"sequence": "ATGG", "position": 0, "alternate_base": "X"}, "Invalid base"),
    ],
)
def test_mutations_validation_errors(client: TestClient, payload: dict[str, object], expected_detail_substr: str) -> None:
    res = client.post("/api/mutations", json=payload)
    assert res.status_code == 422
    assert expected_detail_substr in str(res.json())


def test_mutations_position_out_of_range(client: TestClient) -> None:
    res = client.post(
        "/api/mutations",
        json={"sequence": "ATGG", "position": 99, "alternate_base": "A"},
    )
    assert res.status_code == 422
    assert res.json()["detail"] == "position out of range"


def test_structure_invalid_region_contract(client: TestClient) -> None:
    res = client.post(
        "/api/structure",
        json={"sequence": "ATGGATTTATCT", "region_start": 10, "region_end": 1},
    )
    assert res.status_code == 422
    assert res.json()["detail"] == "invalid structure region"


def test_design_response_contract_fields(client: TestClient) -> None:
    res = client.post("/api/design", json={"goal": "Design BDNF enhancer", "session_id": "contract-1"})
    assert res.status_code == 202
    body = res.json()
    assert body["session_id"] == "contract-1"
    assert body["status"] == "pipeline_started"
    assert body["ws_url"] == "ws://testserver/ws/pipeline/contract-1"


def test_design_rejects_invalid_run_profile(client: TestClient) -> None:
    res = client.post(
        "/api/design",
        json={"goal": "Design BDNF enhancer", "session_id": "contract-bad-profile", "run_profile": "fast"},
    )
    assert res.status_code == 422

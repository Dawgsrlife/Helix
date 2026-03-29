"""Tests for async pipeline orchestrator event flow."""

import pytest

import pipeline.orchestrator as orchestrator
from pipeline.orchestrator import run_followup_pipeline, run_generation_pipeline
from config import StructureMode
from services.evo2 import Evo2MockService
from ws.manager import WebSocketManager


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, object]] = []

    async def accept(self) -> None:
        return

    async def send_json(self, payload: dict[str, object]) -> None:
        self.sent.append(payload)


@pytest.mark.asyncio
async def test_generation_pipeline_emits_key_events() -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-gen")

    await run_generation_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-gen",
        goal="Design a regulatory element for BDNF in hippocampal neurons",
        n_tokens=5,
    )

    events = [e["event"] for e in ws.sent]
    assert events[0] == "pipeline_manifest"
    assert "intent_parsed" in events
    assert "stage_status" in events
    assert "retrieval_progress" in events
    assert "candidate_status" in events
    assert "generation_token" in events
    assert "candidate_scored" in events
    assert "structure_ready" in events
    assert "explanation_chunk" in events
    assert events[-1] == "pipeline_complete"


@pytest.mark.asyncio
async def test_generation_pipeline_uses_custom_seed() -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-custom-seed")

    custom_seed = "ATGCGT"
    await run_generation_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-custom-seed",
        goal="Design promoter",
        n_tokens=2,
        seed_sequence=custom_seed,
    )

    complete = ws.sent[-1]
    assert complete["event"] == "pipeline_complete"
    assert complete["data"]["requested_candidates"] == 1
    generated_sequence = complete["data"]["candidates"][0]["sequence"]
    assert generated_sequence.startswith(custom_seed)
    assert len(generated_sequence) == len(custom_seed) + 2


@pytest.mark.asyncio
async def test_generation_pipeline_requested_candidates_are_all_present() -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-multi")

    await run_generation_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-multi",
        goal="Design promoter",
        n_tokens=2,
        n_candidates=5,
        run_profile="demo",
    )

    complete = ws.sent[-1]
    assert complete["event"] == "pipeline_complete"
    assert complete["data"]["requested_candidates"] == 5
    ids = [candidate["id"] for candidate in complete["data"]["candidates"]]
    assert ids == [0, 1, 2, 3, 4]

    manifest = ws.sent[0]
    assert manifest["event"] == "pipeline_manifest"
    assert manifest["data"]["truth_mode"] == "demo_fallback"
    seeded_events = [event for event in ws.sent if event["event"] == "candidate_seeded"]
    assert sorted(event["data"]["candidate_id"] for event in seeded_events) == [0, 1, 2, 3, 4]


@pytest.mark.asyncio
async def test_followup_pipeline_returns_steps_and_emits_complete() -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-follow")

    steps = await run_followup_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-follow",
        message="make this more tissue-specific",
        candidate_id=0,
    )

    assert steps == ["intent_parse", "evo2_generation", "evo2_scoring"]
    events = [e["event"] for e in ws.sent]
    assert "structure_ready" in events
    assert ws.sent[-1]["event"] == "pipeline_complete"
    assert ws.sent[-1]["data"]["candidates"][0]["status"] == "structured"


@pytest.mark.asyncio
async def test_followup_pipeline_uses_provided_base_sequence() -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-follow-base")

    base_sequence = "ATGCCGATGCCGATGCCG"
    await run_followup_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-follow-base",
        message="make this more tissue-specific",
        candidate_id=0,
        base_sequence=base_sequence,
    )

    complete = ws.sent[-1]
    assert complete["event"] == "pipeline_complete"
    candidate_sequence = complete["data"]["candidates"][0]["sequence"]
    assert len(candidate_sequence) == len(base_sequence)


@pytest.mark.asyncio
async def test_generation_pipeline_invokes_candidate_callback() -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-cb")

    seen: dict[str, object] = {}

    async def capture(candidate_id: int, sequence: str) -> None:
        seen["candidate_id"] = candidate_id
        seen["sequence"] = sequence

    await run_generation_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-cb",
        goal="Design promoter",
        n_tokens=3,
        on_candidate_ready=capture,
    )

    assert seen["candidate_id"] == 0
    assert isinstance(seen["sequence"], str)
    assert len(str(seen["sequence"])) > 0


@pytest.mark.asyncio
async def test_generation_pipeline_caps_requested_candidates_at_ten() -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-max-ten")

    await run_generation_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-max-ten",
        goal="Design promoter",
        n_tokens=1,
        n_candidates=42,
    )

    complete = ws.sent[-1]
    assert complete["event"] == "pipeline_complete"
    assert complete["data"]["requested_candidates"] == 10
    assert len(complete["data"]["candidates"]) == 10


@pytest.mark.asyncio
async def test_stage_status_never_regresses() -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-stages")

    await run_generation_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-stages",
        goal="Design promoter",
        n_tokens=3,
    )

    rank = {"pending": 0, "active": 1, "done": 2, "failed": 2}
    seen: dict[str, int] = {}
    for event in ws.sent:
        if event["event"] != "stage_status":
            continue
        stage = event["data"]["stage"]
        status = event["data"]["status"]
        value = rank[status]
        previous = seen.get(stage, -1)
        assert value >= previous
        seen[stage] = value


@pytest.mark.asyncio
async def test_demo_profile_uses_structure_fallback_when_structure_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-demo-fallback")

    async def _no_structure(*_args, **_kwargs):
        return None

    monkeypatch.setattr(orchestrator.settings, "structure_mode", StructureMode.ESMFOLD)
    monkeypatch.setattr(orchestrator, "predict_structure", _no_structure)

    await run_generation_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-demo-fallback",
        goal="Design promoter",
        n_tokens=2,
        run_profile="demo",
    )

    complete = ws.sent[-1]
    assert complete["event"] == "pipeline_complete"
    assert complete["data"]["failed_candidates"] == 0
    assert complete["data"]["candidates"][0]["status"] == "structured"
    assert complete["data"]["candidates"][0]["pdb_data"]


@pytest.mark.asyncio
async def test_live_profile_uses_structure_fallback_when_structure_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-live-fail")

    async def _no_structure(*_args, **_kwargs):
        return None

    monkeypatch.setattr(orchestrator.settings, "structure_mode", StructureMode.ESMFOLD)
    monkeypatch.setattr(orchestrator, "predict_structure", _no_structure)

    await run_generation_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-live-fail",
        goal="Design promoter",
        n_tokens=2,
        run_profile="live",
    )

    complete = ws.sent[-1]
    assert complete["event"] == "pipeline_complete"
    assert complete["data"]["failed_candidates"] == 0
    assert complete["data"]["candidates"][0]["status"] == "structured"


@pytest.mark.asyncio
async def test_followup_pipeline_invokes_candidate_callback() -> None:
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-follow-cb")

    seen: dict[str, object] = {}

    def capture(candidate_id: int, sequence: str) -> None:
        seen["candidate_id"] = candidate_id
        seen["sequence"] = sequence

    await run_followup_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-follow-cb",
        message="make this more tissue-specific",
        candidate_id=2,
        base_sequence="ATGCCGATGCCGATGCCG",
        on_candidate_ready=capture,
    )

    assert seen["candidate_id"] == 2
    assert isinstance(seen["sequence"], str)


@pytest.mark.asyncio
async def test_ten_candidates_all_complete_in_demo_mode() -> None:
    """All 10 candidates must reach structured status in demo mode with mock services."""
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-ten")

    await run_generation_pipeline(
        manager=manager,
        service=Evo2MockService(),
        session_id="session-ten",
        goal="Design a regulatory element for BDNF in hippocampal neurons",
        n_tokens=5,
        n_candidates=10,
        run_profile="demo",
    )

    complete = ws.sent[-1]
    assert complete["event"] == "pipeline_complete"
    data = complete["data"]
    assert data["requested_candidates"] == 10
    assert data["completed_candidates"] == 10
    assert data["failed_candidates"] == 0
    assert len(data["candidates"]) == 10
    for candidate in data["candidates"]:
        assert candidate["status"] == "structured"
        assert candidate["pdb_data"]
        assert candidate["sequence"]


@pytest.mark.asyncio
async def test_demo_profile_recovers_when_generation_service_raises() -> None:
    """Even if upstream generation fails (e.g., NIM 422), demo mode must still complete all candidates."""

    class _FailingGenerateService(Evo2MockService):
        async def generate(self, seed: str, n_tokens: int, temperature: float = 1.0):
            raise RuntimeError("simulated generation failure")
            yield  # pragma: no cover

    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-demo-recover-generate")

    await run_generation_pipeline(
        manager=manager,
        service=_FailingGenerateService(),
        session_id="session-demo-recover-generate",
        goal="Design promoter",
        n_tokens=4,
        n_candidates=10,
        run_profile="demo",
    )

    complete = ws.sent[-1]
    assert complete["event"] == "pipeline_complete"
    assert complete["data"]["requested_candidates"] == 10
    assert complete["data"]["failed_candidates"] == 0
    assert len(complete["data"]["candidates"]) == 10


def test_mock_pdb_has_backbone_atoms_for_cartoon_rendering() -> None:
    """Mock PDB must have N, CA, C, O atoms per residue so 3dmol cartoon works."""
    from services.mock_pdb import build_mock_pdb_from_dna

    pdb, _confidence = build_mock_pdb_from_dna("ATGGCTGATTCAGATCTTGCTACCAAAGCAGCTGCAATGGCTGATCTTGCTACCAAAGCATAA")
    lines = [line for line in pdb.split("\n") if line.startswith("ATOM")]
    assert len(lines) >= 60, f"Need at least 15 residues × 4 atoms; got {len(lines)} ATOM lines"

    atom_names = {line[12:16].strip() for line in lines}
    for required in ("N", "CA", "C", "O"):
        assert required in atom_names, f"Missing backbone atom {required}"

    residue_nums = {int(line[22:26]) for line in lines}
    assert len(residue_nums) >= 15, f"Need at least 15 residues; got {len(residue_nums)}"


@pytest.mark.asyncio
async def test_candidate_temperature_stays_within_api_bounds() -> None:
    """Temperature for all 10 candidates must stay in [0.0, 1.0] for NIM API compatibility."""
    manager = WebSocketManager()
    ws = _FakeWebSocket()
    await manager.connect(ws, "session-temp")

    captured_temps: list[float] = []
    original_generate = Evo2MockService.generate

    async def tracking_generate(self, seed, n_tokens=50, temperature=1.0):
        captured_temps.append(temperature)
        async for token in original_generate(self, seed, n_tokens=n_tokens, temperature=temperature):
            yield token

    Evo2MockService.generate = tracking_generate  # type: ignore[assignment]
    try:
        await run_generation_pipeline(
            manager=manager,
            service=Evo2MockService(),
            session_id="session-temp",
            goal="Design promoter",
            n_tokens=2,
            n_candidates=10,
            run_profile="demo",
        )
    finally:
        Evo2MockService.generate = original_generate  # type: ignore[assignment]

    assert len(captured_temps) == 10
    for temp in captured_temps:
        assert 0.0 <= temp <= 1.0, f"Temperature {temp} exceeds API safe range [0.0, 1.0]"

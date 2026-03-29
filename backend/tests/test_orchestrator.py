"""Tests for async pipeline orchestrator event flow."""

import pytest

from pipeline.orchestrator import run_followup_pipeline, run_generation_pipeline
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
    assert "intent_parsed" in events
    assert "retrieval_progress" in events
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
    generated_sequence = complete["data"]["candidates"][0]["sequence"]
    assert generated_sequence.startswith(custom_seed)
    assert len(generated_sequence) == len(custom_seed) + 2


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
    assert ws.sent[-1]["event"] == "pipeline_complete"


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

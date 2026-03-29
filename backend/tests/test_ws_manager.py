"""Tests for websocket connection manager behavior."""

import asyncio

from ws.manager import WebSocketManager


class _FakeWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.sent: list[dict[str, object]] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, payload: dict[str, object]) -> None:
        self.sent.append(payload)


async def _connect(manager: WebSocketManager, session_id: str) -> _FakeWebSocket:
    ws = _FakeWebSocket()
    await manager.connect(ws, session_id)
    return ws


import pytest


@pytest.mark.asyncio
async def test_connect_and_send() -> None:
    manager = WebSocketManager()
    ws = await _connect(manager, "s1")
    await manager.send_event("s1", {"event": "x", "data": {}})
    assert ws.accepted is True
    assert ws.sent[0]["event"] == "x"


@pytest.mark.asyncio
async def test_pending_events_flushed_on_connect() -> None:
    manager = WebSocketManager()
    await manager.send_event("s2", {"event": "queued", "data": {"n": 1}})
    assert manager.pending_count("s2") == 1

    ws = await _connect(manager, "s2")
    await asyncio.sleep(0)
    assert ws.sent[0]["event"] == "queued"
    assert manager.pending_count("s2") == 0


@pytest.mark.asyncio
async def test_concurrent_send_event_calls_are_serialized() -> None:
    manager = WebSocketManager()
    ws = await _connect(manager, "s3")

    await asyncio.gather(
        *[
            manager.send_event("s3", {"event": f"e{i}", "data": {"i": i}})
            for i in range(25)
        ]
    )

    assert len(ws.sent) == 25
    assert {msg["event"] for msg in ws.sent} == {f"e{i}" for i in range(25)}


def test_disconnect_removes_session() -> None:
    manager = WebSocketManager()
    manager.disconnect("missing")
    assert manager.has_session("missing") is False

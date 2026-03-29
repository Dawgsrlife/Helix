"""In-process WebSocket connection manager for pipeline sessions."""

from __future__ import annotations

import asyncio

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._pending_events: dict[str, list[dict[str, object]]] = {}
        self._send_locks: dict[str, asyncio.Lock] = {}

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        await websocket.accept()
        self._connections[session_id] = websocket
        self._send_locks.setdefault(session_id, asyncio.Lock())
        pending = self._pending_events.pop(session_id, [])
        for event in pending:
            await self._send_json(session_id, event)

    def disconnect(self, session_id: str) -> None:
        self._connections.pop(session_id, None)
        self._send_locks.pop(session_id, None)

    async def send_event(self, session_id: str, event: dict[str, object]) -> None:
        websocket = self._connections.get(session_id)
        if websocket is None:
            self._pending_events.setdefault(session_id, []).append(event)
            return
        await self._send_json(session_id, event)

    async def _send_json(self, session_id: str, event: dict[str, object]) -> None:
        lock = self._send_locks.setdefault(session_id, asyncio.Lock())
        websocket = self._connections.get(session_id)
        if websocket is None:
            self._pending_events.setdefault(session_id, []).append(event)
            return
        async with lock:
            websocket = self._connections.get(session_id)
            if websocket is None:
                self._pending_events.setdefault(session_id, []).append(event)
                return
            try:
                await websocket.send_json(event)
            except Exception:
                # If a socket dies mid-send, preserve event ordering by re-queuing.
                self._connections.pop(session_id, None)
                self._pending_events.setdefault(session_id, []).append(event)

    async def _flush_pending(self, session_id: str, events: list[dict[str, object]]) -> None:
        websocket = self._connections.get(session_id)
        if websocket is None:
            self._pending_events.setdefault(session_id, []).extend(events)
            return
        for event in events:
            await self._send_json(session_id, event)

    def has_session(self, session_id: str) -> bool:
        return session_id in self._connections

    def pending_count(self, session_id: str) -> int:
        return len(self._pending_events.get(session_id, []))

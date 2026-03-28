"""In-process WebSocket connection manager for pipeline sessions."""

from __future__ import annotations

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._pending_events: dict[str, list[dict[str, object]]] = {}

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        await websocket.accept()
        self._connections[session_id] = websocket
        pending = self._pending_events.pop(session_id, [])
        for event in pending:
            await websocket.send_json(event)

    def disconnect(self, session_id: str) -> None:
        self._connections.pop(session_id, None)

    async def send_event(self, session_id: str, event: dict[str, object]) -> None:
        websocket = self._connections.get(session_id)
        if websocket is None:
            self._pending_events.setdefault(session_id, []).append(event)
            return
        await websocket.send_json(event)

    def has_session(self, session_id: str) -> bool:
        return session_id in self._connections

    def pending_count(self, session_id: str) -> int:
        return len(self._pending_events.get(session_id, []))

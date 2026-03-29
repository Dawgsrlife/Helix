"""Session state backends for pipeline and edit lifecycle."""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

import redis.asyncio as redis

from config import SessionStoreMode, Settings


class SessionNotFoundError(KeyError):
    def __init__(self, session_id: str) -> None:
        super().__init__(f"session not found: {session_id}")
        self.session_id = session_id


class CandidateNotFoundError(KeyError):
    def __init__(self, session_id: str, candidate_id: int) -> None:
        super().__init__(f"candidate {candidate_id} not found in session {session_id}")
        self.session_id = session_id
        self.candidate_id = candidate_id


class SessionLockTimeoutError(TimeoutError):
    def __init__(self, session_id: str, candidate_id: int) -> None:
        super().__init__(f"timed out waiting for candidate lock {session_id}:{candidate_id}")
        self.session_id = session_id
        self.candidate_id = candidate_id


class SessionStore(ABC):
    @abstractmethod
    async def initialize_session(self, session_id: str) -> None:
        pass

    @abstractmethod
    async def set_pending_goal(self, session_id: str, goal: str) -> None:
        pass

    @abstractmethod
    async def pop_pending_goal(self, session_id: str) -> str | None:
        pass

    @abstractmethod
    async def seed_for_session(self, session_id: str) -> str:
        pass

    @abstractmethod
    async def set_candidate_sequence(self, session_id: str, candidate_id: int, sequence: str) -> None:
        pass

    @abstractmethod
    async def require_candidate_sequence(self, session_id: str, candidate_id: int) -> str:
        pass

    @abstractmethod
    async def list_candidate_sequences(self, session_id: str) -> dict[int, str]:
        pass

    @abstractmethod
    def candidate_guard(self, session_id: str, candidate_id: int) -> AsyncIterator[None]:
        pass

    @abstractmethod
    async def close(self) -> None:
        pass

    @abstractmethod
    async def ping(self) -> bool:
        pass


class MemorySessionStore(SessionStore):
    """Single-process in-memory store protected by an asyncio lock."""

    def __init__(self, default_seed: str) -> None:
        self._default_seed = default_seed
        self._pending_goals: dict[str, str] = {}
        self._candidates: dict[str, dict[int, str]] = {}
        self._lock = asyncio.Lock()
        self._candidate_locks: dict[str, asyncio.Lock] = {}

    def _candidate_lock_key(self, session_id: str, candidate_id: int) -> str:
        return f"{session_id}:{candidate_id}"

    async def initialize_session(self, session_id: str) -> None:
        await self.set_candidate_sequence(session_id, 0, self._default_seed)

    async def set_pending_goal(self, session_id: str, goal: str) -> None:
        async with self._lock:
            self._pending_goals[session_id] = goal

    async def pop_pending_goal(self, session_id: str) -> str | None:
        async with self._lock:
            return self._pending_goals.pop(session_id, None)

    async def seed_for_session(self, session_id: str) -> str:
        async with self._lock:
            return self._candidates.get(session_id, {}).get(0, self._default_seed)

    async def set_candidate_sequence(self, session_id: str, candidate_id: int, sequence: str) -> None:
        async with self._lock:
            self._candidates.setdefault(session_id, {})[candidate_id] = sequence

    async def require_candidate_sequence(self, session_id: str, candidate_id: int) -> str:
        async with self._lock:
            candidates = self._candidates.get(session_id)
            if candidates is None:
                raise SessionNotFoundError(session_id)

            sequence = candidates.get(candidate_id)
            if sequence is None:
                raise CandidateNotFoundError(session_id, candidate_id)
            return sequence

    async def list_candidate_sequences(self, session_id: str) -> dict[int, str]:
        async with self._lock:
            candidates = self._candidates.get(session_id)
            if candidates is None:
                raise SessionNotFoundError(session_id)
            return dict(candidates)

    @asynccontextmanager
    async def candidate_guard(self, session_id: str, candidate_id: int) -> AsyncIterator[None]:
        key = self._candidate_lock_key(session_id, candidate_id)
        async with self._lock:
            lock = self._candidate_locks.setdefault(key, asyncio.Lock())
        async with lock:
            yield

    async def close(self) -> None:
        return

    async def ping(self) -> bool:
        return True


class RedisSessionStore(SessionStore):
    """Redis-backed store safe across processes and workers."""

    def __init__(self, *, client: redis.Redis, default_seed: str, key_prefix: str, ttl_seconds: int) -> None:
        self._client = client
        self._default_seed = default_seed
        self._key_prefix = key_prefix
        self._ttl_seconds = ttl_seconds
        self._lock_timeout_seconds = 60
        self._blocking_timeout_seconds = 5

    def _candidate_key(self, session_id: str) -> str:
        return f"{self._key_prefix}:{session_id}:candidates"

    def _pending_goal_key(self, session_id: str) -> str:
        return f"{self._key_prefix}:{session_id}:pending_goal"

    def _candidate_lock_key(self, session_id: str, candidate_id: int) -> str:
        return f"{self._key_prefix}:{session_id}:lock:{candidate_id}"

    async def initialize_session(self, session_id: str) -> None:
        await self.set_candidate_sequence(session_id, 0, self._default_seed)

    async def set_pending_goal(self, session_id: str, goal: str) -> None:
        key = self._pending_goal_key(session_id)
        await self._client.set(key, goal, ex=self._ttl_seconds)

    async def pop_pending_goal(self, session_id: str) -> str | None:
        key = self._pending_goal_key(session_id)
        value = await self._client.getdel(key)
        if value is None:
            return None
        return str(value)

    async def seed_for_session(self, session_id: str) -> str:
        key = self._candidate_key(session_id)
        value = await self._client.hget(key, "0")
        if value is None:
            return self._default_seed
        return str(value)

    async def set_candidate_sequence(self, session_id: str, candidate_id: int, sequence: str) -> None:
        key = self._candidate_key(session_id)
        pipe = self._client.pipeline(transaction=True)
        pipe.hset(key, str(candidate_id), sequence)
        pipe.expire(key, self._ttl_seconds)
        await pipe.execute()

    async def require_candidate_sequence(self, session_id: str, candidate_id: int) -> str:
        key = self._candidate_key(session_id)
        sequence = await self._client.hget(key, str(candidate_id))
        if sequence is not None:
            return str(sequence)

        exists = await self._client.exists(key)
        if not exists:
            raise SessionNotFoundError(session_id)
        raise CandidateNotFoundError(session_id, candidate_id)

    async def list_candidate_sequences(self, session_id: str) -> dict[int, str]:
        key = self._candidate_key(session_id)
        if not await self._client.exists(key):
            raise SessionNotFoundError(session_id)

        payload = await self._client.hgetall(key)
        out: dict[int, str] = {}
        for candidate_id, sequence in payload.items():
            try:
                out[int(candidate_id)] = str(sequence)
            except ValueError:
                continue
        return out

    @asynccontextmanager
    async def candidate_guard(self, session_id: str, candidate_id: int) -> AsyncIterator[None]:
        lock = self._client.lock(
            self._candidate_lock_key(session_id, candidate_id),
            timeout=self._lock_timeout_seconds,
            blocking_timeout=self._blocking_timeout_seconds,
        )
        acquired = await lock.acquire()
        if not acquired:
            raise SessionLockTimeoutError(session_id, candidate_id)
        try:
            yield
        finally:
            # Lock ownership can expire mid-operation under high latency.
            # Never let cleanup errors mask the original request outcome.
            with suppress(Exception):
                await lock.release()

    async def close(self) -> None:
        await self._client.aclose()

    async def ping(self) -> bool:
        return bool(await self._client.ping())


def create_session_store(settings: Settings, default_seed: str) -> SessionStore:
    if settings.session_store_mode == SessionStoreMode.REDIS:
        client = redis.from_url(settings.redis_url, decode_responses=True)
        return RedisSessionStore(
            client=client,
            default_seed=default_seed,
            key_prefix=settings.session_key_prefix,
            ttl_seconds=settings.session_ttl_seconds,
        )
    return MemorySessionStore(default_seed=default_seed)

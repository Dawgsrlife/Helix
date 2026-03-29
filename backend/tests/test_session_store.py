"""Tests for session store backends (memory + redis integration seams)."""

import asyncio

import pytest

from config import SessionStoreMode, Settings
from services.session_store import (
    CandidateNotFoundError,
    MemorySessionStore,
    RedisSessionStore,
    SessionLockTimeoutError,
    SessionNotFoundError,
    create_session_store,
)


class _FakePipeline:
    def __init__(self, client: "_FakeRedisClient") -> None:
        self._client = client
        self._ops: list[tuple[str, tuple[object, ...]]] = []

    def hset(self, key: str, field: str, value: str) -> "_FakePipeline":
        self._ops.append(("hset", (key, field, value)))
        return self

    def expire(self, key: str, ttl: int) -> "_FakePipeline":
        self._ops.append(("expire", (key, ttl)))
        return self

    async def execute(self) -> list[object]:
        out: list[object] = []
        for op, args in self._ops:
            if op == "hset":
                out.append(await self._client.hset(*args))  # type: ignore[arg-type]
            elif op == "expire":
                out.append(await self._client.expire(*args))  # type: ignore[arg-type]
        return out


class _FakeRedisLock:
    def __init__(self, key: str, should_acquire: bool = True) -> None:
        self.key = key
        self.should_acquire = should_acquire
        self.acquired = False

    async def acquire(self) -> bool:
        self.acquired = self.should_acquire
        return self.should_acquire

    async def release(self) -> None:
        self.acquired = False


class _FakeRedisClient:
    def __init__(self) -> None:
        self.kv: dict[str, str] = {}
        self.hashes: dict[str, dict[str, str]] = {}
        self.ttl: dict[str, int] = {}
        self.lock_should_acquire = True

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.kv[key] = value
        if ex is not None:
            self.ttl[key] = ex
        return True

    async def getdel(self, key: str) -> str | None:
        value = self.kv.pop(key, None)
        self.ttl.pop(key, None)
        return value

    async def hget(self, key: str, field: str) -> str | None:
        return self.hashes.get(key, {}).get(field)

    async def hset(self, key: str, field: str, value: str) -> int:
        self.hashes.setdefault(key, {})[field] = value
        return 1

    async def expire(self, key: str, ttl: int) -> bool:
        self.ttl[key] = ttl
        return True

    async def exists(self, key: str) -> int:
        return 1 if key in self.hashes else 0

    def pipeline(self, transaction: bool = True) -> _FakePipeline:
        assert transaction is True
        return _FakePipeline(self)

    def lock(self, key: str, timeout: int, blocking_timeout: int) -> _FakeRedisLock:
        assert timeout > 0
        assert blocking_timeout > 0
        return _FakeRedisLock(key, should_acquire=self.lock_should_acquire)


def test_factory_returns_memory_store_by_default() -> None:
    settings = Settings(session_store_mode=SessionStoreMode.MEMORY)
    store = create_session_store(settings, default_seed="ATGC")
    assert isinstance(store, MemorySessionStore)


def test_factory_returns_redis_store_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = _FakeRedisClient()

    def fake_from_url(_url: str, decode_responses: bool = True) -> _FakeRedisClient:
        assert decode_responses is True
        return fake_client

    monkeypatch.setattr("services.session_store.redis.from_url", fake_from_url)
    settings = Settings(session_store_mode=SessionStoreMode.REDIS, redis_url="redis://localtest/0")
    store = create_session_store(settings, default_seed="ATGC")
    assert isinstance(store, RedisSessionStore)


@pytest.mark.asyncio
async def test_memory_store_lifecycle() -> None:
    store = MemorySessionStore(default_seed="ATGC")
    await store.initialize_session("s1")
    assert await store.require_candidate_sequence("s1", 0) == "ATGC"

    await store.set_pending_goal("s1", "design promoter")
    assert await store.pop_pending_goal("s1") == "design promoter"
    assert await store.pop_pending_goal("s1") is None

    await store.set_candidate_sequence("s1", 0, "ATGCGG")
    assert await store.require_candidate_sequence("s1", 0) == "ATGCGG"


@pytest.mark.asyncio
async def test_memory_store_missing_session_and_candidate_errors() -> None:
    store = MemorySessionStore(default_seed="ATGC")
    with pytest.raises(SessionNotFoundError):
        await store.require_candidate_sequence("missing", 0)

    await store.initialize_session("s1")
    with pytest.raises(CandidateNotFoundError):
        await store.require_candidate_sequence("s1", 99)


@pytest.mark.asyncio
async def test_memory_store_concurrent_updates() -> None:
    store = MemorySessionStore(default_seed="ATGC")
    await store.initialize_session("s1")

    async def write(seq: str) -> None:
        await store.set_candidate_sequence("s1", 0, seq)

    await asyncio.gather(
        write("AAAA"),
        write("CCCC"),
        write("GGGG"),
        write("TTTT"),
    )
    final = await store.require_candidate_sequence("s1", 0)
    assert final in {"AAAA", "CCCC", "GGGG", "TTTT"}


@pytest.mark.asyncio
async def test_memory_store_candidate_guard_serializes_access() -> None:
    store = MemorySessionStore(default_seed="ATGC")
    await store.initialize_session("s1")

    order: list[str] = []

    async def worker(name: str) -> None:
        async with store.candidate_guard("s1", 0):
            order.append(f"start-{name}")
            await asyncio.sleep(0.01)
            current = await store.require_candidate_sequence("s1", 0)
            await store.set_candidate_sequence("s1", 0, current + name)
            order.append(f"end-{name}")

    await asyncio.gather(worker("A"), worker("B"))

    assert order[0].startswith("start-")
    assert order[1].startswith("end-")
    assert order[2].startswith("start-")
    assert order[3].startswith("end-")


@pytest.mark.asyncio
async def test_redis_store_pending_goal_and_candidate_ttl() -> None:
    fake = _FakeRedisClient()
    store = RedisSessionStore(
        client=fake,  # type: ignore[arg-type]
        default_seed="ATGC",
        key_prefix="helix:test",
        ttl_seconds=123,
    )

    await store.set_pending_goal("s1", "goal")
    assert fake.kv["helix:test:s1:pending_goal"] == "goal"
    assert fake.ttl["helix:test:s1:pending_goal"] == 123
    assert await store.pop_pending_goal("s1") == "goal"
    assert await store.pop_pending_goal("s1") is None

    await store.set_candidate_sequence("s1", 0, "ATGCGG")
    assert fake.hashes["helix:test:s1:candidates"]["0"] == "ATGCGG"
    assert fake.ttl["helix:test:s1:candidates"] == 123


@pytest.mark.asyncio
async def test_redis_store_missing_behavior_and_seed_fallback() -> None:
    fake = _FakeRedisClient()
    store = RedisSessionStore(
        client=fake,  # type: ignore[arg-type]
        default_seed="ATGC",
        key_prefix="helix:test",
        ttl_seconds=60,
    )

    assert await store.seed_for_session("missing") == "ATGC"

    with pytest.raises(SessionNotFoundError):
        await store.require_candidate_sequence("missing", 0)

    await store.set_candidate_sequence("s1", 0, "AAAA")
    with pytest.raises(CandidateNotFoundError):
        await store.require_candidate_sequence("s1", 1)


@pytest.mark.asyncio
async def test_redis_store_candidate_guard_uses_lock() -> None:
    fake = _FakeRedisClient()
    store = RedisSessionStore(
        client=fake,  # type: ignore[arg-type]
        default_seed="ATGC",
        key_prefix="helix:test",
        ttl_seconds=60,
    )

    async with store.candidate_guard("s1", 0):
        await store.set_candidate_sequence("s1", 0, "AAAA")

    assert fake.hashes["helix:test:s1:candidates"]["0"] == "AAAA"


@pytest.mark.asyncio
async def test_redis_store_candidate_guard_timeout() -> None:
    fake = _FakeRedisClient()
    fake.lock_should_acquire = False
    store = RedisSessionStore(
        client=fake,  # type: ignore[arg-type]
        default_seed="ATGC",
        key_prefix="helix:test",
        ttl_seconds=60,
    )

    with pytest.raises(SessionLockTimeoutError):
        async with store.candidate_guard("s1", 0):
            pass

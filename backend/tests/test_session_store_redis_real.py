"""Real Redis integration tests for RedisSessionStore (no fakes)."""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest
import pytest_asyncio
import redis.asyncio as redis

from services.session_store import CandidateNotFoundError, RedisSessionStore, SessionLockTimeoutError, SessionNotFoundError


@pytest.fixture
def redis_port() -> int:
    return int(os.environ.get("HELIX_TEST_REDIS_PORT", "6390"))


@pytest.fixture
def redis_server(redis_port: int):
    if shutil.which("redis-server") is None:
        pytest.skip("redis-server binary not available; skipping real Redis integration tests")

    redis_dir = Path(".pytest-redis")
    redis_dir.mkdir(exist_ok=True)
    conf_path = redis_dir / "redis-test.conf"
    conf_path.write_text(
        "\n".join(
            [
                f"port {redis_port}",
                "bind 127.0.0.1",
                "save \"\"",
                "appendonly no",
                f"dir {redis_dir.resolve()}",
                "loglevel warning",
            ]
        ),
        encoding="utf-8",
    )

    proc = subprocess.Popen(  # noqa: S603
        ["redis-server", str(conf_path)],  # noqa: S607
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # wait for server to accept connections
    client = redis.from_url(f"redis://127.0.0.1:{redis_port}/0", decode_responses=True)
    for _ in range(50):
        try:
            if awaitable_result(client.ping()):
                break
        except Exception:
            time.sleep(0.1)
    else:
        proc.terminate()
        pytest.skip("redis-server did not become ready in time")

    try:
        yield
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


def awaitable_result(awaitable):
    import asyncio

    return asyncio.run(awaitable)


@pytest_asyncio.fixture
async def redis_store(redis_server, redis_port: int):
    client = redis.from_url(f"redis://127.0.0.1:{redis_port}/0", decode_responses=True)
    await client.flushdb()
    store = RedisSessionStore(
        client=client,
        default_seed="ATGC",
        key_prefix="helix:itest",
        ttl_seconds=60,
    )
    try:
        yield store
    finally:
        await store.close()


@pytest.mark.asyncio
async def test_redis_store_round_trip(redis_store: RedisSessionStore) -> None:
    await redis_store.initialize_session("s1")
    assert await redis_store.require_candidate_sequence("s1", 0) == "ATGC"

    await redis_store.set_candidate_sequence("s1", 0, "AAAA")
    assert await redis_store.require_candidate_sequence("s1", 0) == "AAAA"

    await redis_store.set_pending_goal("s1", "design promoter")
    assert await redis_store.pop_pending_goal("s1") == "design promoter"
    assert await redis_store.pop_pending_goal("s1") is None


@pytest.mark.asyncio
async def test_redis_store_missing_errors(redis_store: RedisSessionStore) -> None:
    with pytest.raises(SessionNotFoundError):
        await redis_store.require_candidate_sequence("missing", 0)

    await redis_store.initialize_session("s1")
    with pytest.raises(CandidateNotFoundError):
        await redis_store.require_candidate_sequence("s1", 9)


@pytest.mark.asyncio
async def test_redis_store_real_lock_contention(redis_store: RedisSessionStore) -> None:
    await redis_store.initialize_session("lock-s")

    async with redis_store.candidate_guard("lock-s", 0):
        with pytest.raises(SessionLockTimeoutError):
            async with redis_store.candidate_guard("lock-s", 0):
                pass

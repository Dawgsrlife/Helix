"""Tests for CLI service resolution and non-interactive commands."""

from cli import evo2_playground as pg
from config import Evo2Mode, Settings
from services.evo2 import Evo2MockService


def test_resolve_service_fallback(monkeypatch):
    monkeypatch.delenv("EVO2_KEY", raising=False)
    monkeypatch.delenv("EVO2_NIM_API_KEY", raising=False)

    class _BadSettings:
        evo2_mode = Evo2Mode.NIM_API
        evo2_nim_api_key = ""
        evo2_key = ""
        evo2_nim_api_url = ""
        evo2_model_path = ""

    monkeypatch.setattr(pg, "settings", _BadSettings())
    service = pg.resolve_service()
    assert isinstance(service, Evo2MockService)
    assert pg.service_source == "mock-fallback"


def test_resolve_service_uses_configured_mode(monkeypatch):
    cfg = Settings(evo2_mode=Evo2Mode.MOCK)
    monkeypatch.setattr(pg, "settings", cfg)
    service = pg.resolve_service()
    assert isinstance(service, Evo2MockService)
    assert pg.service_source == "mock"


def test_cmd_forward_handles_short_logits(monkeypatch):
    class _ShortLogitsService:
        async def forward(self, _sequence: str):
            from models.domain import ForwardResult

            return ForwardResult(logits=[0.4], sequence_score=0.4, embeddings=None)

    monkeypatch.setattr(pg, "service", _ShortLogitsService())
    # Should not raise, even when logits length is shorter than sequence length.
    import asyncio

    asyncio.run(pg.cmd_forward("ATCGGATCGATCTACTACGATCGATCGATC"))

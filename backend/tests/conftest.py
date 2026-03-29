"""Shared test fixtures."""

import os
import sys
from pathlib import Path

import pytest

# Tests run with in-memory session state unless a test explicitly opts into Redis.
os.environ.setdefault("SESSION_STORE_MODE", "memory")

# Add backend root to path so imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.evo2 import Evo2MockService  # noqa: E402


@pytest.fixture
def evo2_mock() -> Evo2MockService:
    return Evo2MockService()


@pytest.fixture
def sample_sequence() -> str:
    """BDNF-like coding region fragment (realistic test input)."""
    return "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCCCCTGCAGAACTGA"


@pytest.fixture
def long_sequence() -> str:
    """Longer sequence with known motifs embedded for scoring tests."""
    return (
        "GGGCGGCCAATTATAAAGCATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATG"
        "TCATTAATGCCCCTGCAGAACTGAAAGAAGTCTATTTGGAAGCGATGCCTTTGTATTCT"
        "GAAATATAAATGGCACACTCAAATCTGACTGACGTCAGCGCGGCGGCTTGACGTCATGA"
    )


@pytest.fixture
def pathogenic_sequence() -> str:
    """Sequence with known pathogenic motifs for off-target testing."""
    return (
        "ATGGATTTATCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCTTCGCGTTGAA"
        "CGGCGGCGGCGGCGGCGGCGGAAGTACAAAATGTCATTAAT"
    )

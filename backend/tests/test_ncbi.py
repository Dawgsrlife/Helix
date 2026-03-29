"""Tests for NCBI gene info service."""

import asyncio
import time
import pytest
from services.ncbi import fetch_gene_info, NCBIResult

# NCBI E-utilities rate limit: 3 requests/sec without API key.
# Each test that hits the live API sleeps briefly to stay under the limit.
_RATE_DELAY = 1.0  # seconds between API-hitting tests


class TestFetchGeneInfo:
    def test_returns_ncbi_result(self):
        result = asyncio.run(fetch_gene_info("BDNF", "human"))
        assert isinstance(result, NCBIResult)
        time.sleep(_RATE_DELAY)

    def test_known_gene_has_id(self):
        result = asyncio.run(fetch_gene_info("BDNF", "human"))
        assert result.gene_id
        assert result.symbol
        time.sleep(_RATE_DELAY)

    def test_known_gene_has_description(self):
        result = asyncio.run(fetch_gene_info("BDNF", "human"))
        assert result.description
        time.sleep(_RATE_DELAY)

    def test_with_organism_filter(self):
        result = asyncio.run(fetch_gene_info("BDNF", "human"))
        assert "sapiens" in result.organism.lower() or "homo" in result.organism.lower()
        time.sleep(_RATE_DELAY)

    def test_without_organism(self):
        result = asyncio.run(fetch_gene_info("BDNF"))
        assert isinstance(result, NCBIResult)
        assert result.gene_id
        time.sleep(_RATE_DELAY)

    def test_empty_gene_returns_empty(self):
        result = asyncio.run(fetch_gene_info(""))
        assert result.gene_id == ""

    def test_unknown_gene_returns_partial(self):
        result = asyncio.run(fetch_gene_info("ZZZZNOTAREALGENE999"))
        assert isinstance(result, NCBIResult)

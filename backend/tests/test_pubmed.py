"""Tests for PubMed literature search service."""

import asyncio
import pytest
from backend.services.pubmed import (
    search_literature,
    PubMedResult,
    PubMedArticle,
    _build_query,
)


class TestBuildQuery:
    def test_gene_only(self):
        assert _build_query("BDNF") == "BDNF"

    def test_gene_and_context(self):
        q = _build_query("BDNF", therapeutic_context="Alzheimer's disease")
        assert "BDNF" in q
        assert "Alzheimer" in q

    def test_gene_context_and_type(self):
        q = _build_query("BDNF", "Alzheimer's disease", "regulatory_element")
        assert "BDNF" in q
        assert "Alzheimer" in q
        assert "regulatory element" in q


class TestSearchLiterature:
    def test_returns_pubmed_result(self):
        result = asyncio.run(search_literature("BDNF"))
        assert isinstance(result, PubMedResult)

    def test_known_gene_has_articles(self):
        result = asyncio.run(search_literature("BDNF"))
        assert result.total_count > 0
        assert len(result.articles) > 0

    def test_article_has_fields(self):
        result = asyncio.run(search_literature("BDNF"))
        if result.articles:
            a = result.articles[0]
            assert isinstance(a, PubMedArticle)
            assert a.pmid
            assert a.title

    def test_with_therapeutic_context(self):
        result = asyncio.run(
            search_literature("BDNF", therapeutic_context="Alzheimer's disease")
        )
        assert isinstance(result, PubMedResult)
        assert "Alzheimer" in result.query

    def test_empty_gene_returns_empty(self):
        result = asyncio.run(search_literature(""))
        assert result.articles == []
        assert result.query == ""

    def test_max_results_respected(self):
        result = asyncio.run(search_literature("BRCA1", max_results=3))
        assert len(result.articles) <= 3

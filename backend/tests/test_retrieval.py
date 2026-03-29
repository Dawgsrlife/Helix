"""Tests for the parallel retrieval orchestrator."""

import asyncio
import pytest
from models.domain import DesignSpec
from pipeline.retrieval import retrieve_context, RetrievalResult
from services.ncbi import NCBIResult
from services.pubmed import PubMedResult
from services.clinvar import ClinVarResult


class TestRetrieveContext:
    def test_returns_retrieval_result(self):
        spec = DesignSpec(
            design_type="regulatory_element",
            target_gene="BDNF",
            organism="human",
            therapeutic_context="Alzheimer's disease",
        )
        result = asyncio.run(retrieve_context(spec))
        assert isinstance(result, RetrievalResult)

    def test_all_services_return_data(self):
        spec = DesignSpec(
            design_type="regulatory_element",
            target_gene="BDNF",
            organism="human",
            therapeutic_context="Alzheimer's disease",
        )
        result = asyncio.run(retrieve_context(spec))
        assert result.ncbi is not None
        assert isinstance(result.ncbi, NCBIResult)
        assert result.pubmed is not None
        assert isinstance(result.pubmed, PubMedResult)
        assert result.clinvar is not None
        assert isinstance(result.clinvar, ClinVarResult)

    def test_ncbi_has_gene_data(self):
        spec = DesignSpec(
            design_type="regulatory_element",
            target_gene="BDNF",
            organism="human",
        )
        result = asyncio.run(retrieve_context(spec))
        assert result.ncbi is not None
        assert result.ncbi.gene_id

    def test_pubmed_has_articles(self):
        spec = DesignSpec(
            design_type="regulatory_element",
            target_gene="BDNF",
            therapeutic_context="Alzheimer's disease",
        )
        result = asyncio.run(retrieve_context(spec))
        assert result.pubmed is not None
        assert len(result.pubmed.articles) > 0

    def test_clinvar_has_variants(self):
        spec = DesignSpec(
            design_type="regulatory_element",
            target_gene="BRCA1",
        )
        result = asyncio.run(retrieve_context(spec))
        assert result.clinvar is not None
        assert result.clinvar.total_count > 0

    def test_missing_gene_still_works(self):
        spec = DesignSpec(design_type="promoter")
        result = asyncio.run(retrieve_context(spec))
        assert isinstance(result, RetrievalResult)

    def test_unknown_gene_graceful(self):
        spec = DesignSpec(
            design_type="regulatory_element",
            target_gene="ZZZZNOTAREALGENE999",
        )
        result = asyncio.run(retrieve_context(spec))
        assert isinstance(result, RetrievalResult)

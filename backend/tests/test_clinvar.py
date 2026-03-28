"""Tests for ClinVar lookup service."""

import asyncio
import pytest
from backend.services.clinvar import lookup_variants, ClinVarResult, ClinVarVariant


@pytest.fixture(scope="module")
def brca1_result():
    """Single live API call shared across all BRCA1 tests."""
    return asyncio.run(lookup_variants("BRCA1"))


class TestLookupVariants:
    def test_returns_clinvar_result(self, brca1_result):
        assert isinstance(brca1_result, ClinVarResult)
        assert brca1_result.gene == "BRCA1"

    def test_has_variants_for_known_gene(self, brca1_result):
        assert brca1_result.total_count > 0
        assert len(brca1_result.variants) > 0

    def test_variant_has_fields(self, brca1_result):
        if brca1_result.variants:
            v = brca1_result.variants[0]
            assert isinstance(v, ClinVarVariant)
            assert v.uid
            assert v.title

    def test_empty_gene_returns_empty(self):
        result = asyncio.run(lookup_variants(""))
        assert result.variants == []
        assert result.gene == ""

    def test_unknown_gene_returns_empty_variants(self):
        result = asyncio.run(lookup_variants("ZZZZNOTAREALGENE999"))
        assert isinstance(result, ClinVarResult)
        assert result.variants == []

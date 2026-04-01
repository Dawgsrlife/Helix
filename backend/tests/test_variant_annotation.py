"""Tests for variant annotation service — HGVS parsing, position mapping, API contract.

Uses deterministic mock ClinVar data so tests don't hit the network.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from main import app
from services.variant_annotation import (
    AnnotationResult,
    VariantAnnotation,
    annotate_variants,
    annotate_sequence_region,
    parse_hgvs_position,
    _review_status_to_stars,
)
from services.clinvar import ClinVarResult, ClinVarVariant


# ---------------------------------------------------------------------------
# HGVS parsing — exact outputs for known nomenclature patterns
# ---------------------------------------------------------------------------

class TestHGVSParsing:
    def test_standard_snv(self):
        """NM_007294.4(BRCA1):c.5123C>A → position 5123, C→A"""
        pos, ref, alt = parse_hgvs_position("NM_007294.4(BRCA1):c.5123C>A")
        assert pos == 5123
        assert ref == "C"
        assert alt == "A"

    def test_genomic_snv(self):
        """NC_000017.11:g.43094064G>A → position 43094064, G→A"""
        pos, ref, alt = parse_hgvs_position("NC_000017.11:g.43094064G>A")
        assert pos == 43094064
        assert ref == "G"
        assert alt == "A"

    def test_coding_position_only(self):
        """c.68_69delAG → position 68, no base change"""
        pos, ref, alt = parse_hgvs_position("NM_007294.4(BRCA1):c.68_69delAG")
        assert pos == 68
        assert ref is None
        assert alt is None

    def test_no_hgvs(self):
        """Plain text with no HGVS → (None, None, None)"""
        pos, ref, alt = parse_hgvs_position("BRCA1 pathogenic variant")
        assert pos is None
        assert ref is None
        assert alt is None

    def test_lowercase_bases(self):
        """c.100a>t should still parse (case-insensitive)"""
        pos, ref, alt = parse_hgvs_position("NM_000059.4(BRCA2):c.100a>t")
        assert pos == 100
        assert ref == "A"
        assert alt == "T"

    def test_multiple_hgvs_takes_first(self):
        """If multiple HGVS patterns, take the first match"""
        pos, ref, alt = parse_hgvs_position("c.100A>G and c.200T>C")
        assert pos == 100
        assert ref == "A"
        assert alt == "G"

    def test_empty_string(self):
        pos, ref, alt = parse_hgvs_position("")
        assert pos is None


# ---------------------------------------------------------------------------
# Review status → star rating
# ---------------------------------------------------------------------------

class TestReviewStars:
    def test_practice_guideline(self):
        assert _review_status_to_stars("practice guideline") == 4

    def test_expert_panel(self):
        assert _review_status_to_stars("reviewed by expert panel") == 3

    def test_multiple_submitters(self):
        assert _review_status_to_stars("criteria provided, multiple submitters, no conflicts") == 2

    def test_single_submitter(self):
        assert _review_status_to_stars("criteria provided, single submitter") == 1

    def test_no_assertion(self):
        assert _review_status_to_stars("no assertion criteria provided") == 0

    def test_empty(self):
        assert _review_status_to_stars("") == 0


# ---------------------------------------------------------------------------
# annotate_variants with mocked ClinVar
# ---------------------------------------------------------------------------

def _mock_clinvar_result(gene: str) -> ClinVarResult:
    """Deterministic ClinVar result for testing."""
    return ClinVarResult(
        gene=gene,
        total_count=3,
        variants=[
            ClinVarVariant(
                uid="12345",
                title=f"NM_007294.4({gene}):c.5123C>A (p.Ala1708Glu)",
                clinical_significance="Pathogenic",
                condition="Breast-ovarian cancer",
                variation_type="single nucleotide variant",
            ),
            ClinVarVariant(
                uid="12346",
                title=f"NM_007294.4({gene}):c.68_69delAG",
                clinical_significance="Pathogenic",
                condition="Hereditary breast cancer",
                variation_type="Deletion",
            ),
            ClinVarVariant(
                uid="12347",
                title=f"{gene} large deletion exon 1-2",
                clinical_significance="Likely pathogenic",
                condition="Breast cancer",
                variation_type="copy number loss",
            ),
        ],
    )


@pytest.fixture
def mock_clinvar():
    with patch("services.variant_annotation.lookup_variants", new_callable=AsyncMock) as mock_lv:
        mock_lv.side_effect = lambda gene, **kwargs: _mock_clinvar_result(gene)
        with patch("services.variant_annotation._fetch_variant_details", new_callable=AsyncMock) as mock_details:
            mock_details.return_value = {
                "12345": {"review_stars": 3, "chrom_start": None, "chrom_stop": None},
                "12346": {"review_stars": 1, "chrom_start": None, "chrom_stop": None},
                "12347": {"review_stars": 0, "chrom_start": None, "chrom_stop": None},
            }
            yield mock_lv, mock_details


class TestAnnotateVariants:
    @pytest.mark.asyncio
    async def test_basic_annotation(self, mock_clinvar):
        result = await annotate_variants("BRCA1")
        assert result.gene == "BRCA1"
        assert result.total_variants_in_gene == 3
        # Two variants have HGVS positions, one doesn't
        assert len(result.annotations) == 2
        assert result.unmapped_variants == 1

    @pytest.mark.asyncio
    async def test_snv_annotation_fields(self, mock_clinvar):
        result = await annotate_variants("BRCA1")
        snv = result.annotations[1]  # c.5123C>A (sorted by position: 67, 5122)
        assert snv.position == 5122  # 5123 - 1 (0-indexed)
        assert snv.ref_base == "C"
        assert snv.alt_base == "A"
        assert snv.clinical_significance == "Pathogenic"
        assert snv.condition == "Breast-ovarian cancer"
        assert snv.variant_id == "12345"
        assert snv.review_stars == 3

    @pytest.mark.asyncio
    async def test_deletion_annotation_position(self, mock_clinvar):
        result = await annotate_variants("BRCA1")
        deletion = result.annotations[0]  # c.68 (sorted first)
        assert deletion.position == 67  # 68 - 1 (0-indexed)
        assert deletion.ref_base == ""  # deletion, no ref/alt bases parsed
        assert deletion.alt_base == ""
        assert deletion.review_stars == 1

    @pytest.mark.asyncio
    async def test_sorted_by_position(self, mock_clinvar):
        result = await annotate_variants("BRCA1")
        positions = [a.position for a in result.annotations]
        assert positions == sorted(positions)

    @pytest.mark.asyncio
    async def test_empty_gene(self, mock_clinvar):
        result = await annotate_variants("")
        assert result.gene == ""
        assert result.total_variants_in_gene == 0
        assert len(result.annotations) == 0

    @pytest.mark.asyncio
    async def test_with_sequence_filters_out_of_range(self, mock_clinvar):
        """When sequence is provided, variants beyond seq length are unmapped."""
        short_seq = "A" * 100  # Only 100 bp
        result = await annotate_variants("BRCA1", sequence=short_seq)
        # c.68 is position 67 (in range), c.5123 is position 5122 (out of range)
        assert len(result.annotations) == 1
        assert result.annotations[0].position == 67
        assert result.unmapped_variants == 2  # one has no HGVS, one out of range


class TestAnnotateSequenceRegion:
    @pytest.mark.asyncio
    async def test_region_filter(self, mock_clinvar):
        """Only variants within [region_start, region_end) should be returned."""
        seq = "A" * 10000
        result = await annotate_sequence_region("BRCA1", seq, region_start=60, region_end=80)
        # c.68 = position 67, which is in [60, 80) → adjusted to 67-60 = 7
        assert len(result.annotations) == 1
        assert result.annotations[0].position == 7

    @pytest.mark.asyncio
    async def test_region_adjusts_positions(self, mock_clinvar):
        """Positions should be relative to region_start."""
        seq = "A" * 10000
        result = await annotate_sequence_region("BRCA1", seq, region_start=50, region_end=100)
        assert result.annotations[0].position == 17  # 67 - 50

    @pytest.mark.asyncio
    async def test_invalid_region_raises(self, mock_clinvar):
        with pytest.raises(ValueError, match="Invalid region"):
            await annotate_sequence_region("BRCA1", "ATCG", region_start=5, region_end=3)

    @pytest.mark.asyncio
    async def test_region_start_equals_end_raises(self, mock_clinvar):
        with pytest.raises(ValueError, match="Invalid region"):
            await annotate_sequence_region("BRCA1", "ATCG", region_start=2, region_end=2)


# ---------------------------------------------------------------------------
# API endpoint contract
# ---------------------------------------------------------------------------

class TestVariantAnnotationAPI:
    @pytest.fixture
    def client(self, mock_clinvar):
        return TestClient(app)

    def test_basic_request(self, client):
        res = client.post("/api/variants", json={"gene": "BRCA1"})
        assert res.status_code == 200
        body = res.json()
        assert body["gene"] == "BRCA1"
        assert body["total_variants_in_gene"] == 3
        assert body["count"] == 2
        assert body["unmapped_variants"] == 1
        # Verify annotation shape
        ann = body["annotations"][0]
        assert "position" in ann
        assert "ref_base" in ann
        assert "alt_base" in ann
        assert "clinical_significance" in ann
        assert "condition" in ann
        assert "variant_id" in ann
        assert "review_stars" in ann

    def test_with_sequence(self, client):
        seq = "A" * 100
        res = client.post("/api/variants", json={"gene": "BRCA1", "sequence": seq})
        assert res.status_code == 200
        body = res.json()
        # Only position 67 is in range
        assert body["count"] == 1
        assert body["annotations"][0]["position"] == 67

    def test_with_region(self, client):
        seq = "A" * 10000
        res = client.post("/api/variants", json={
            "gene": "BRCA1", "sequence": seq,
            "region_start": 60, "region_end": 80,
        })
        assert res.status_code == 200
        body = res.json()
        assert body["count"] == 1
        assert body["annotations"][0]["position"] == 7  # 67 - 60

    def test_empty_gene_rejected(self, client):
        res = client.post("/api/variants", json={"gene": ""})
        assert res.status_code == 422

    def test_invalid_sequence(self, client):
        res = client.post("/api/variants", json={"gene": "BRCA1", "sequence": "XYZQ"})
        assert res.status_code == 422

    def test_max_variants_bounds(self, client):
        res = client.post("/api/variants", json={"gene": "BRCA1", "max_variants": 0})
        assert res.status_code == 422
        res = client.post("/api/variants", json={"gene": "BRCA1", "max_variants": 101})
        assert res.status_code == 422

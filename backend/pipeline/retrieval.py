"""Parallel genomic context retrieval — runs NCBI, PubMed, and ClinVar concurrently.

"Partial success is success." If any service fails or times out,
the pipeline continues with whatever succeeded.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from models.domain import DesignSpec
from services.clinvar import ClinVarResult, lookup_variants
from services.ncbi import NCBIResult, fetch_gene_info
from services.pubmed import PubMedResult, search_literature

logger = logging.getLogger(__name__)

RETRIEVAL_TIMEOUT = 30.0


@dataclass
class RetrievalResult:
    ncbi: NCBIResult | None = None
    pubmed: PubMedResult | None = None
    clinvar: ClinVarResult | None = None


async def _safe_fetch(coro, name: str):
    """Run a coroutine with timeout and error handling. Returns None on failure."""
    try:
        return await asyncio.wait_for(coro, timeout=RETRIEVAL_TIMEOUT)
    except asyncio.TimeoutError:
        logger.warning("Retrieval service %s timed out after %.0fs", name, RETRIEVAL_TIMEOUT)
        return None
    except Exception:
        logger.warning("Retrieval service %s failed", name, exc_info=True)
        return None


async def retrieve_context(spec: DesignSpec) -> RetrievalResult:
    """Run all three retrieval services in parallel."""
    gene = spec.target_gene or ""
    organism = spec.organism
    therapeutic_context = spec.therapeutic_context
    design_type = spec.design_type

    ncbi_result, pubmed_result, clinvar_result = await asyncio.gather(
        _safe_fetch(fetch_gene_info(gene, organism), "NCBI"),
        _safe_fetch(search_literature(gene, therapeutic_context, design_type), "PubMed"),
        _safe_fetch(lookup_variants(gene), "ClinVar"),
    )

    return RetrievalResult(
        ncbi=ncbi_result,
        pubmed=pubmed_result,
        clinvar=clinvar_result,
    )

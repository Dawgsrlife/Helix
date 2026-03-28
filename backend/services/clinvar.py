"""ClinVar pathogenic variant lookup via NCBI E-utilities."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


@dataclass(frozen=True)
class ClinVarVariant:
    uid: str
    title: str
    clinical_significance: str
    condition: str
    variation_type: str


@dataclass
class ClinVarResult:
    gene: str
    variants: list[ClinVarVariant] = field(default_factory=list)
    total_count: int = 0


async def _get_with_retry(client: httpx.AsyncClient, url: str, params: dict, max_retries: int = 3) -> httpx.Response:
    """GET request with exponential backoff on 429."""
    for attempt in range(max_retries):
        resp = await client.get(url, params=params)
        if resp.status_code == 429:
            wait = 1.0 * (2 ** attempt)
            logger.debug("Rate limited by NCBI (attempt %d), sleeping %.1fs", attempt + 1, wait)
            await asyncio.sleep(wait)
            continue
        resp.raise_for_status()
        return resp
    # Final attempt — let raise_for_status bubble up
    resp = await client.get(url, params=params)
    resp.raise_for_status()
    return resp


async def lookup_variants(gene: str, max_results: int = 10) -> ClinVarResult:
    """Fetch pathogenic/likely-pathogenic ClinVar variants for a gene."""
    if not gene:
        return ClinVarResult(gene="")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            search_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/esearch.fcgi",
                params={
                    "db": "clinvar",
                    "term": f"{gene}[gene] AND (pathogenic[clinsig] OR likely_pathogenic[clinsig])",
                    "retmax": max_results,
                    "retmode": "json",
                },
            )
            search_data = search_resp.json()

            id_list = search_data.get("esearchresult", {}).get("idlist", [])
            total_count = int(search_data.get("esearchresult", {}).get("count", 0))

            if not id_list:
                return ClinVarResult(gene=gene, total_count=total_count)

            await asyncio.sleep(0.4)

            summary_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/esummary.fcgi",
                params={
                    "db": "clinvar",
                    "id": ",".join(id_list),
                    "retmode": "json",
                },
            )
            summary_data = summary_resp.json()

            variants = []
            result_map = summary_data.get("result", {})
            for uid in id_list:
                entry = result_map.get(uid, {})
                if not entry or uid == "uids":
                    continue
                variants.append(ClinVarVariant(
                    uid=uid,
                    title=entry.get("title", ""),
                    clinical_significance=entry.get("clinical_significance", {}).get("description", "")
                        if isinstance(entry.get("clinical_significance"), dict)
                        else str(entry.get("clinical_significance", "")),
                    condition=entry.get("trait_set", [{}])[0].get("trait_name", "")
                        if entry.get("trait_set")
                        else "",
                    variation_type=entry.get("variation_type", ""),
                ))

            return ClinVarResult(gene=gene, variants=variants, total_count=total_count)

    except Exception:
        logger.warning("ClinVar lookup failed for gene=%s", gene, exc_info=True)
        return ClinVarResult(gene=gene)

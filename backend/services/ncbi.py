"""NCBI gene info fetcher via E-utilities."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import asyncio

import httpx
from backend.config import NCBI_API_KEY

logger = logging.getLogger(__name__)

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


@dataclass
class NCBIResult:
    gene_id: str = ""
    symbol: str = ""
    description: str = ""
    organism: str = ""
    chromosome: str = ""
    location: str = ""
    aliases: list[str] = field(default_factory=list)


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


async def fetch_gene_info(gene: str, organism: str | None = None) -> NCBIResult:
    """Fetch gene summary from NCBI Gene database."""
    if not gene:
        return NCBIResult()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            term = f"{gene}[gene]"
            if organism:
                term += f" AND {organism}[orgn]"

            search_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/esearch.fcgi",
                params={
                    "db": "gene",
                    "term": term,
                    "retmax": 1,
                    "retmode": "json",
                    **({} if not NCBI_API_KEY else {"api_key": NCBI_API_KEY}),
                },
            )
            search_data = search_resp.json()

            id_list = search_data.get("esearchresult", {}).get("idlist", [])
            if not id_list:
                return NCBIResult(symbol=gene)

            gene_id = id_list[0]

            # Respect NCBI rate limit: max 3 req/sec without an API key.
            await asyncio.sleep(0.34)

            summary_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/esummary.fcgi",
                params={
                    "db": "gene",
                    "id": gene_id,
                    "retmode": "json",
                    **({} if not NCBI_API_KEY else {"api_key": NCBI_API_KEY}),
                },
            )
            summary_data = summary_resp.json()

            entry = summary_data.get("result", {}).get(gene_id, {})
            if not entry:
                return NCBIResult(gene_id=gene_id, symbol=gene)

            return NCBIResult(
                gene_id=gene_id,
                symbol=entry.get("name", gene),
                description=entry.get("description", ""),
                organism=entry.get("organism", {}).get("scientificname", "")
                    if isinstance(entry.get("organism"), dict)
                    else str(entry.get("organism", "")),
                chromosome=entry.get("chromosome", ""),
                location=entry.get("maplocation", ""),
                aliases=entry.get("otheraliases", "").split(", ")
                    if entry.get("otheraliases")
                    else [],
            )

    except Exception:
        logger.warning("NCBI gene lookup failed for gene=%s", gene, exc_info=True)
        return NCBIResult(symbol=gene)

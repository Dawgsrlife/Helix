"""NCBI gene info fetcher via E-utilities."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import asyncio

import httpx
from config import NCBI_API_KEY

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
    reference_accession: str = ""
    reference_sequence: str = ""


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

            accession, reference_sequence = await _fetch_reference_sequence(client, gene, organism)

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
                reference_accession=accession,
                reference_sequence=reference_sequence,
            )

    except Exception:
        logger.warning("NCBI gene lookup failed for gene=%s", gene, exc_info=True)
        return NCBIResult(symbol=gene)


def _clean_fasta_sequence(text: str) -> str:
    lines = [line.strip().upper() for line in text.splitlines() if line.strip()]
    if not lines:
        return ""
    if lines[0].startswith(">"):
        lines = lines[1:]
    sequence = "".join(lines)
    return "".join(base for base in sequence if base in {"A", "T", "C", "G", "N"})


async def _fetch_reference_sequence(
    client: httpx.AsyncClient,
    gene: str,
    organism: str | None = None,
) -> tuple[str, str]:
    try:
        term = f"{gene}[Gene Name] AND biomol_genomic[PROP] AND srcdb_refseq[PROP]"
        if organism:
            term += f" AND {organism}[Organism]"
        search_resp = await _get_with_retry(
            client,
            f"{EUTILS_BASE}/esearch.fcgi",
            params={
                "db": "nuccore",
                "term": term,
                "retmax": 1,
                "retmode": "json",
                **({} if not NCBI_API_KEY else {"api_key": NCBI_API_KEY}),
            },
        )
        id_list = search_resp.json().get("esearchresult", {}).get("idlist", [])
        if not id_list:
            return "", ""
        nuccore_id = id_list[0]
        await asyncio.sleep(0.34)
        fasta_resp = await _get_with_retry(
            client,
            f"{EUTILS_BASE}/efetch.fcgi",
            params={
                "db": "nuccore",
                "id": nuccore_id,
                "rettype": "fasta",
                "retmode": "text",
                **({} if not NCBI_API_KEY else {"api_key": NCBI_API_KEY}),
            },
        )
        fasta_text = fasta_resp.text
        lines = [line.strip() for line in fasta_text.splitlines() if line.strip()]
        accession = ""
        if lines and lines[0].startswith(">"):
            accession = lines[0].split()[0].replace(">", "")
        seq = _clean_fasta_sequence(fasta_text)
        if not seq:
            return accession, ""
        # Use a bounded window so generation remains fast while being context-grounded.
        window = 260
        if len(seq) <= window:
            return accession, seq
        center = len(seq) // 2
        start = max(0, center - window // 2)
        end = min(len(seq), start + window)
        return accession, seq[start:end]
    except Exception:
        logger.warning("NCBI reference sequence fetch failed for gene=%s", gene, exc_info=True)
        return "", ""

"""NCBI gene info fetcher via E-utilities."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

import asyncio

import httpx
from config import NCBI_API_KEY, NCBI_EMAIL, NCBI_TOOL

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


def _eutils_params(params: dict[str, object]) -> dict[str, object]:
    merged = dict(params)
    if NCBI_API_KEY:
        merged["api_key"] = NCBI_API_KEY
    if NCBI_TOOL:
        merged["tool"] = NCBI_TOOL
    if NCBI_EMAIL:
        merged["email"] = NCBI_EMAIL
    return merged


def _safe_json_response(response: httpx.Response) -> dict:
    try:
        parsed = response.json()
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        # NCBI can return malformed JSON with raw control chars in ERROR fields.
        cleaned = re.sub(r"[\x00-\x1f]", "", response.text)
        try:
            parsed = json.loads(cleaned)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            logger.warning("Failed to parse NCBI JSON payload", exc_info=True)
            return {}


def _extract_id_list(search_data: dict) -> list[str]:
    payload = search_data.get("esearchresult")
    if not isinstance(payload, dict):
        return []
    if payload.get("ERROR"):
        logger.warning("NCBI esearch error: %s", payload.get("ERROR"))
    ids = payload.get("idlist")
    return [str(item) for item in ids] if isinstance(ids, list) else []


async def fetch_gene_info(gene: str, organism: str | None = None) -> NCBIResult:
    """Fetch gene summary from NCBI Gene database."""
    if not gene:
        return NCBIResult()

    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            headers={"User-Agent": "Helix/0.1 (genomic-design-ide)"},
        ) as client:
            terms = [f"{gene}[gene]"]
            if organism:
                terms.insert(0, f"{gene}[gene] AND {organism}[orgn]")
                terms.append(f"{gene}[gene] AND {organism}[organism]")

            id_list: list[str] = []
            for term in terms:
                search_resp = await _get_with_retry(
                    client,
                    f"{EUTILS_BASE}/esearch.fcgi",
                    params=_eutils_params({
                        "db": "gene",
                        "term": term,
                        "retmax": 1,
                        "retmode": "json",
                    }),
                )
                search_data = _safe_json_response(search_resp)
                id_list = _extract_id_list(search_data)
                if id_list:
                    break
            if not id_list:
                return NCBIResult(symbol=gene)

            gene_id = id_list[0]

            # Respect NCBI rate limit: max 3 req/sec without an API key.
            await asyncio.sleep(0.34)

            summary_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/esummary.fcgi",
                params=_eutils_params({
                    "db": "gene",
                    "id": gene_id,
                    "retmode": "json",
                }),
            )
            summary_data = _safe_json_response(summary_resp)

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
        terms = [term]
        if organism:
            terms[0] += f" AND {organism}[Organism]"
            terms.append(f"{gene}[Gene Name] AND {organism}[Organism] AND srcdb_refseq[PROP]")
            terms.append(f"{gene}[Gene] AND {organism}[Organism]")
        terms.append(f"{gene}[Gene Name] AND srcdb_refseq[PROP]")
        terms.append(f"{gene}[Gene]")

        id_list: list[str] = []
        for query in terms:
            search_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/esearch.fcgi",
                params=_eutils_params({
                    "db": "nuccore",
                    "term": query,
                    "retmax": 1,
                    "retmode": "json",
                }),
            )
            search_data = _safe_json_response(search_resp)
            id_list = _extract_id_list(search_data)
            if id_list:
                break
        if not id_list:
            return "", ""
        nuccore_id = id_list[0]
        await asyncio.sleep(0.34)
        fasta_resp = await _get_with_retry(
            client,
            f"{EUTILS_BASE}/efetch.fcgi",
            params=_eutils_params({
                "db": "nuccore",
                "id": nuccore_id,
                "rettype": "fasta",
                "retmode": "text",
            }),
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

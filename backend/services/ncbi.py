"""NCBI gene info fetcher via E-utilities."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

import httpx

from services.eutils import (
    EUTILS_BASE,
    eutils_client,
    eutils_params,
    get_with_retry,
    safe_json_response,
)

logger = logging.getLogger(__name__)


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
        async with eutils_client() as client:
            terms = [f"{gene}[gene]"]
            if organism:
                terms.insert(0, f"{gene}[gene] AND {organism}[orgn]")
                terms.append(f"{gene}[gene] AND {organism}[organism]")

            id_list: list[str] = []
            for term in terms:
                search_resp = await get_with_retry(
                    client,
                    f"{EUTILS_BASE}/esearch.fcgi",
                    params=eutils_params({
                        "db": "gene",
                        "term": term,
                        "retmax": 1,
                        "retmode": "json",
                    }),
                )
                search_data = safe_json_response(search_resp)
                id_list = _extract_id_list(search_data)
                if id_list:
                    break
            if not id_list:
                return NCBIResult(symbol=gene)

            gene_id = id_list[0]

            # Respect NCBI rate limit: max 3 req/sec without an API key.
            await asyncio.sleep(0.34)

            summary_resp = await get_with_retry(
                client,
                f"{EUTILS_BASE}/esummary.fcgi",
                params=eutils_params({
                    "db": "gene",
                    "id": gene_id,
                    "retmode": "json",
                }),
            )
            summary_data = safe_json_response(summary_resp)

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
            search_resp = await get_with_retry(
                client,
                f"{EUTILS_BASE}/esearch.fcgi",
                params=eutils_params({
                    "db": "nuccore",
                    "term": query,
                    "retmax": 1,
                    "retmode": "json",
                }),
            )
            search_data = safe_json_response(search_resp)
            id_list = _extract_id_list(search_data)
            if id_list:
                break
        if not id_list:
            return "", ""
        nuccore_id = id_list[0]
        await asyncio.sleep(0.34)
        fasta_resp = await get_with_retry(
            client,
            f"{EUTILS_BASE}/efetch.fcgi",
            params=eutils_params({
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

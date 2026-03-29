"""ClinVar pathogenic variant lookup via NCBI E-utilities."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field

import httpx

from config import NCBI_API_KEY, NCBI_EMAIL, NCBI_TOOL

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
        cleaned = re.sub(r"[\x00-\x1f]", "", response.text)
        try:
            parsed = json.loads(cleaned)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            logger.warning("Failed to parse ClinVar JSON payload", exc_info=True)
            return {}


async def lookup_variants(gene: str, max_results: int = 10) -> ClinVarResult:
    """Fetch pathogenic/likely-pathogenic ClinVar variants for a gene."""
    if not gene:
        return ClinVarResult(gene="")

    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            headers={"User-Agent": "Helix/0.1 (genomic-design-ide)"},
        ) as client:
            search_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/esearch.fcgi",
                params=_eutils_params({
                    "db": "clinvar",
                    "term": f"{gene}[gene] AND (pathogenic[clinsig] OR likely_pathogenic[clinsig])",
                    "retmax": max_results,
                    "retmode": "json",
                }),
            )
            search_data = _safe_json_response(search_resp)

            id_list = search_data.get("esearchresult", {}).get("idlist", [])
            total_count = int(search_data.get("esearchresult", {}).get("count", 0))

            if not id_list:
                return ClinVarResult(gene=gene, total_count=total_count)

            await asyncio.sleep(0.4)

            summary_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/esummary.fcgi",
                params=_eutils_params({
                    "db": "clinvar",
                    "id": ",".join(id_list),
                    "retmode": "json",
                }),
            )
            summary_data = _safe_json_response(summary_resp)

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

"""ClinVar pathogenic variant lookup via NCBI E-utilities."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

from services.eutils import (
    EUTILS_BASE,
    eutils_client,
    eutils_params,
    get_with_retry,
    safe_json_response,
)

logger = logging.getLogger(__name__)


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


async def lookup_variants(gene: str, max_results: int = 10) -> ClinVarResult:
    """Fetch pathogenic/likely-pathogenic ClinVar variants for a gene."""
    if not gene:
        return ClinVarResult(gene="")

    try:
        async with eutils_client() as client:
            search_resp = await get_with_retry(
                client,
                f"{EUTILS_BASE}/esearch.fcgi",
                params=eutils_params({
                    "db": "clinvar",
                    "term": f"{gene}[gene] AND (pathogenic[clinsig] OR likely_pathogenic[clinsig])",
                    "retmax": max_results,
                    "retmode": "json",
                }),
            )
            search_data = safe_json_response(search_resp)

            id_list = search_data.get("esearchresult", {}).get("idlist", [])
            total_count = int(search_data.get("esearchresult", {}).get("count", 0))

            if not id_list:
                return ClinVarResult(gene=gene, total_count=total_count)

            await asyncio.sleep(0.4)

            summary_resp = await get_with_retry(
                client,
                f"{EUTILS_BASE}/esummary.fcgi",
                params=eutils_params({
                    "db": "clinvar",
                    "id": ",".join(id_list),
                    "retmode": "json",
                }),
            )
            summary_data = safe_json_response(summary_resp)

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

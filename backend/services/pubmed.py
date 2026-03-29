"""PubMed literature search via NCBI E-utilities."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

import httpx

from config import NCBI_API_KEY, NCBI_EMAIL, NCBI_TOOL

logger = logging.getLogger(__name__)

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


@dataclass(frozen=True)
class PubMedArticle:
    pmid: str
    title: str
    authors: list[str]
    abstract: str
    year: str
    journal: str


@dataclass
class PubMedResult:
    query: str
    articles: list[PubMedArticle] = field(default_factory=list)
    total_count: int = 0


def _build_query(
    gene: str,
    therapeutic_context: str | None = None,
    design_type: str | None = None,
) -> str:
    """Build a PubMed search query from DesignSpec fields."""
    parts = [gene]
    if therapeutic_context:
        parts.append(therapeutic_context)
    if design_type:
        parts.append(design_type.replace("_", " "))
    return " AND ".join(parts)


def _parse_articles_xml(xml_text: str) -> list[PubMedArticle]:
    """Parse PubMed efetch XML response into article objects."""
    articles = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return articles

    for article_el in root.findall(".//PubmedArticle"):
        medline = article_el.find(".//MedlineCitation")
        if medline is None:
            continue

        pmid_el = medline.find("PMID")
        pmid = pmid_el.text if pmid_el is not None else ""

        article_data = medline.find("Article")
        if article_data is None:
            continue

        title_el = article_data.find("ArticleTitle")
        title = title_el.text if title_el is not None else ""

        authors = []
        for author_el in article_data.findall(".//Author"):
            last = author_el.find("LastName")
            first = author_el.find("ForeName")
            if last is not None and last.text:
                name = last.text
                if first is not None and first.text:
                    name = f"{first.text} {last.text}"
                authors.append(name)

        abstract_parts = []
        for abs_el in article_data.findall(".//AbstractText"):
            if abs_el.text:
                abstract_parts.append(abs_el.text)
        abstract = " ".join(abstract_parts)

        pub_date = article_data.find(".//PubDate")
        year = ""
        if pub_date is not None:
            year_el = pub_date.find("Year")
            if year_el is not None and year_el.text:
                year = year_el.text

        journal_el = article_data.find(".//Journal/Title")
        journal = journal_el.text if journal_el is not None else ""

        articles.append(PubMedArticle(
            pmid=pmid,
            title=title or "",
            authors=authors,
            abstract=abstract,
            year=year,
            journal=journal,
        ))

    return articles


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
            logger.warning("Failed to parse PubMed JSON payload", exc_info=True)
            return {}


async def _get_with_retry(client: httpx.AsyncClient, url: str, params: dict, max_retries: int = 3) -> httpx.Response:
    for attempt in range(max_retries):
        resp = await client.get(url, params=params)
        if resp.status_code == 429:
            wait = 0.8 * (2 ** attempt)
            await asyncio.sleep(wait)
            continue
        resp.raise_for_status()
        return resp
    resp = await client.get(url, params=params)
    resp.raise_for_status()
    return resp


async def search_literature(
    gene: str,
    therapeutic_context: str | None = None,
    design_type: str | None = None,
    max_results: int = 5,
) -> PubMedResult:
    """Search PubMed for relevant literature based on DesignSpec fields."""
    if not gene:
        return PubMedResult(query="")

    query = _build_query(gene, therapeutic_context, design_type)

    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            headers={"User-Agent": "Helix/0.1 (genomic-design-ide)"},
        ) as client:
            search_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/esearch.fcgi",
                params=_eutils_params({
                    "db": "pubmed",
                    "term": query,
                    "retmax": max_results,
                    "sort": "relevance",
                    "retmode": "json",
                }),
            )
            search_data = _safe_json_response(search_resp)

            pmid_list = search_data.get("esearchresult", {}).get("idlist", [])
            total_count = int(search_data.get("esearchresult", {}).get("count", 0))

            if not pmid_list:
                return PubMedResult(query=query, total_count=total_count)

            # Respect NCBI rate limit (3 req/s without API key) with a brief pause
            await asyncio.sleep(0.4)
            fetch_resp = await _get_with_retry(
                client,
                f"{EUTILS_BASE}/efetch.fcgi",
                params=_eutils_params({
                    "db": "pubmed",
                    "id": ",".join(pmid_list),
                    "rettype": "xml",
                }),
            )

            articles = _parse_articles_xml(fetch_resp.text)
            return PubMedResult(query=query, articles=articles, total_count=total_count)

    except Exception:
        logger.warning("PubMed search failed for query=%s", query, exc_info=True)
        return PubMedResult(query=query)

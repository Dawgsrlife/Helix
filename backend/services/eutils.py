"""Shared NCBI E-utilities helpers.

Used by ncbi.py, clinvar.py, and pubmed.py. Centralises retry logic,
rate-limit handling, and malformed-JSON sanitisation so each service
module only owns its domain-specific parsing.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re

import httpx

from config import NCBI_API_KEY, NCBI_EMAIL, NCBI_TOOL

logger = logging.getLogger(__name__)

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

HELIX_USER_AGENT = "Helix/0.1 (genomic-design-ide)"


def eutils_params(params: dict[str, object]) -> dict[str, object]:
    """Merge NCBI credential/tool params into an existing param dict."""
    merged = dict(params)
    if NCBI_API_KEY:
        merged["api_key"] = NCBI_API_KEY
    if NCBI_TOOL:
        merged["tool"] = NCBI_TOOL
    if NCBI_EMAIL:
        merged["email"] = NCBI_EMAIL
    return merged


async def get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
    *,
    max_retries: int = 3,
    backoff_base: float = 1.0,
) -> httpx.Response:
    """GET request with exponential backoff on 429 (rate-limit)."""
    for attempt in range(max_retries):
        resp = await client.get(url, params=params)
        if resp.status_code == 429:
            wait = backoff_base * (2 ** attempt)
            logger.debug("Rate limited by NCBI (attempt %d), sleeping %.1fs", attempt + 1, wait)
            await asyncio.sleep(wait)
            continue
        resp.raise_for_status()
        return resp
    # Final attempt — let raise_for_status bubble up
    resp = await client.get(url, params=params)
    resp.raise_for_status()
    return resp


def safe_json_response(response: httpx.Response, *, source: str = "NCBI") -> dict:
    """Parse an NCBI JSON response, sanitising control chars if needed.

    NCBI endpoints sometimes return JSON with embedded control characters
    in ERROR fields, which breaks stdlib json. We strip those and retry.
    """
    try:
        parsed = response.json()
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        cleaned = re.sub(r"[\x00-\x1f]", "", response.text)
        try:
            parsed = json.loads(cleaned)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            logger.warning("Failed to parse %s JSON payload", source, exc_info=True)
            return {}


def eutils_client(timeout: float = 15.0) -> httpx.AsyncClient:
    """Create a pre-configured httpx client for E-utilities."""
    return httpx.AsyncClient(
        timeout=timeout,
        headers={"User-Agent": HELIX_USER_AGENT},
    )

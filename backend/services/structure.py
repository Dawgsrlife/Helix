"""ESMFold structure prediction via Meta's ESM Atlas API.

Takes a DNA sequence, translates to protein, sends to ESMFold,
returns PDB with pLDDT confidence scores.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from backend.services.translation import translate

logger = logging.getLogger(__name__)

ESMFOLD_API_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/"
MIN_PROTEIN_LENGTH = 10


@dataclass
class StructurePrediction:
    pdb_data: str
    protein_sequence: str
    confidence: float  # mean pLDDT (0-1 scale)
    model: str = "esmfold"


def _extract_mean_plddt(pdb_text: str) -> float:
    """Extract mean pLDDT from PDB B-factor column (cols 61-66).

    ESMFold stores pLDDT (0-100) in the B-factor field of ATOM records.
    Returns 0-1 scale.
    """
    b_factors = []
    for line in pdb_text.splitlines():
        if line.startswith("ATOM"):
            try:
                b_factor = float(line[60:66].strip())
                b_factors.append(b_factor)
            except (ValueError, IndexError):
                continue
    if not b_factors:
        return 0.0
    return sum(b_factors) / len(b_factors) / 100.0


async def predict_structure(
    dna_sequence: str,
    region_start: int = 0,
    region_end: int | None = None,
) -> StructurePrediction | None:
    """Predict protein structure from a DNA sequence region using ESMFold.

    Translates DNA to protein, then calls the ESM Atlas API.
    Returns None on API failure (caller handles gracefully).
    """
    region = dna_sequence[region_start:region_end]
    protein = translate(region, to_stop=True)

    if len(protein) < MIN_PROTEIN_LENGTH:
        logger.warning(
            "Protein too short for structure prediction: %d residues (min %d)",
            len(protein),
            MIN_PROTEIN_LENGTH,
        )
        return None

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                ESMFOLD_API_URL,
                content=protein,
                headers={"Content-Type": "text/plain"},
            )
            resp.raise_for_status()

            pdb_data = resp.text
            if not pdb_data or "ATOM" not in pdb_data:
                logger.warning("ESMFold returned invalid PDB response")
                return None

            confidence = _extract_mean_plddt(pdb_data)

            return StructurePrediction(
                pdb_data=pdb_data,
                protein_sequence=protein,
                confidence=round(confidence, 4),
            )

    except Exception:
        logger.warning("ESMFold API call failed", exc_info=True)
        return None

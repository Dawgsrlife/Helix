"""ESMFold structure prediction via Meta's ESM Atlas API.

Takes a DNA sequence, translates to protein, sends to ESMFold,
returns PDB with pLDDT confidence scores.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import httpx

from services.translation import find_orfs, translate

logger = logging.getLogger(__name__)

ESMFOLD_API_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/"
MIN_PROTEIN_LENGTH = 40
MAX_RETRIES = 2
PDB_RECORD_PREFIXES = {
    "HEADER",
    "TITLE",
    "MODEL",
    "ATOM",
    "HETATM",
    "TER",
    "ENDMDL",
    "END",
    "REMARK",
}


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
    mean_b = sum(b_factors) / len(b_factors)
    # Some providers return pLDDT in [0,100], others normalize to [0,1].
    return mean_b if mean_b <= 1.5 else (mean_b / 100.0)


def _extract_pdb_text(raw_text: str) -> str:
    """Normalize raw API text into valid PDB records only.

    Handles plain-PDB responses and fenced-code payloads.
    """
    text = raw_text.strip()
    if not text:
        return ""

    fenced = re.search(r"```(?:pdb)?\s*(.*?)```", text, flags=re.IGNORECASE | re.DOTALL)
    if fenced is not None:
        text = fenced.group(1).strip()

    lines: list[str] = []
    for line in text.splitlines():
        cleaned = line.rstrip()
        if not cleaned:
            continue
        prefix = cleaned[:6].strip().upper()
        if prefix in PDB_RECORD_PREFIXES:
            lines.append(cleaned)

    if not lines:
        return ""
    if lines[-1].strip().upper() != "END":
        lines.append("END")
    return "\n".join(lines)


def _has_backbone_atoms(pdb_text: str) -> bool:
    atom_names: set[str] = set()
    atom_count = 0
    for line in pdb_text.splitlines():
        if not line.startswith("ATOM"):
            continue
        atom_count += 1
        atom_names.add(line[12:16].strip())
    # Require at least a minimal number of atoms plus full backbone markers.
    if atom_count < 20:
        return False
    return {"N", "CA", "C", "O"}.issubset(atom_names)


def _select_protein_for_folding(dna_sequence: str) -> str:
    """Extract the most foldable protein-like segment from DNA.

    Priority:
    1) Longest ORF protein.
    2) Longest stop-free frame segment.
    """
    cleaned_dna = dna_sequence.upper().replace("N", "A")
    if len(cleaned_dna) < 9:
        return ""

    orfs = find_orfs(cleaned_dna, min_length=45)
    if orfs:
        best_orf = max(orfs, key=lambda o: len(o.protein))
        if best_orf.protein:
            return best_orf.protein

    best = ""
    for frame in range(3):
        translated = translate(cleaned_dna[frame:], to_stop=False)
        for segment in translated.split("*"):
            candidate = "".join(aa for aa in segment if aa.isalpha() and aa != "X")
            if len(candidate) > len(best):
                best = candidate
    return best


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
    protein = _select_protein_for_folding(region)

    if len(protein) < MIN_PROTEIN_LENGTH:
        logger.warning(
            "Protein too short for structure prediction: %d residues (min %d)",
            len(protein),
            MIN_PROTEIN_LENGTH,
        )
        return None

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(
                    ESMFOLD_API_URL,
                    content=protein,
                    headers={"Content-Type": "text/plain"},
                )
                if resp.status_code == 429:
                    logger.warning("ESMFold rate limited (attempt %d/%d)", attempt + 1, MAX_RETRIES + 1)
                    last_error = httpx.HTTPStatusError(
                        "Rate limited", request=resp.request, response=resp
                    )
                    continue
                resp.raise_for_status()

                pdb_data = _extract_pdb_text(resp.text)
                if not pdb_data or not _has_backbone_atoms(pdb_data):
                    logger.warning("ESMFold returned invalid PDB response")
                    return None

                confidence = _extract_mean_plddt(pdb_data)

                return StructurePrediction(
                    pdb_data=pdb_data,
                    protein_sequence=protein,
                    confidence=round(confidence, 4),
                )

        except httpx.HTTPStatusError:
            raise
        except Exception as exc:
            last_error = exc
            logger.warning("ESMFold API call failed (attempt %d/%d)", attempt + 1, MAX_RETRIES + 1, exc_info=True)

    logger.error("ESMFold API exhausted all retries: %s", last_error)
    return None

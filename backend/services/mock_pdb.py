"""Generate rich synthetic protein-like PDBs for demos/fallbacks.

The goal is not biochemical accuracy, but a visually convincing
backbone with sidechain geometry so 3D viewers render a real-looking fold
instead of a tiny 5-atom line.
"""

from __future__ import annotations

import math

from services.translation import translate

AA3: dict[str, str] = {
    "A": "ALA",
    "R": "ARG",
    "N": "ASN",
    "D": "ASP",
    "C": "CYS",
    "Q": "GLN",
    "E": "GLU",
    "G": "GLY",
    "H": "HIS",
    "I": "ILE",
    "L": "LEU",
    "K": "LYS",
    "M": "MET",
    "F": "PHE",
    "P": "PRO",
    "S": "SER",
    "T": "THR",
    "W": "TRP",
    "Y": "TYR",
    "V": "VAL",
}

_FALLBACK_PROTEIN = "MSTNPKPQRKTKRNTNRRPQDVKFPGGGQIVGGVLTGKTANVCK"


def _to_protein_for_render(dna_sequence: str, min_residues: int) -> str:
    translated = translate(dna_sequence, to_stop=True)
    cleaned = "".join(aa for aa in translated if aa in AA3)
    if len(cleaned) >= min_residues:
        return cleaned
    out = cleaned or "M"
    while len(out) < min_residues:
        out += _FALLBACK_PROTEIN
    return out[:max(min_residues, len(cleaned))]


def _atom_line(
    *,
    serial: int,
    atom_name: str,
    residue_name: str,
    residue_id: int,
    x: float,
    y: float,
    z: float,
    b_factor: float,
    element: str,
) -> str:
    return (
        f"ATOM  {serial:5d} {atom_name:>4s} {residue_name:>3s} A{residue_id:4d}    "
        f"{x:8.3f}{y:8.3f}{z:8.3f}  1.00{b_factor:6.2f}          {element:>2s}"
    )


def build_mock_pdb_from_dna(
    dna_sequence: str,
    *,
    candidate_id: int = 0,
    min_residues: int = 28,
) -> tuple[str, float]:
    """Return (pdb_text, confidence_0_to_1)."""
    protein = _to_protein_for_render(dna_sequence, min_residues=min_residues)

    # Alpha-helix-like scaffold with slight candidate-specific phase shift.
    radius = 2.3
    rise = 1.5
    phase = (candidate_id % 12) * 7.0

    lines: list[str] = [
        "HEADER    HELIX SYNTHETIC FALLBACK",
        "TITLE     HELIX DEMO STRUCTURE (MOCK BACKBONE)",
    ]
    if len(protein) >= 6:
        lines.append(
            f"HELIX    1   1 {AA3.get(protein[0], 'ALA')} A   1  "
            f"{AA3.get(protein[-1], 'GLY')} A{len(protein):4d}  1{len(protein):36d}"
        )

    serial = 1
    ca_b_factors: list[float] = []

    for idx, aa in enumerate(protein, start=1):
        residue_name = AA3.get(aa, "GLY")
        theta = math.radians((idx - 1) * 100.0 + phase)

        ca_x = radius * math.cos(theta)
        ca_y = radius * math.sin(theta)
        ca_z = rise * (idx - 1)

        n_theta = theta - math.radians(18.0)
        c_theta = theta + math.radians(20.0)
        o_theta = theta + math.radians(34.0)
        cb_theta = theta + math.radians(120.0)

        # Confidence-like b-factor (70-92 range, lower at termini).
        center_distance = abs((idx - 1) - (len(protein) - 1) / 2) / max(1.0, len(protein) / 2)
        b = 92.0 - (22.0 * center_distance)
        b = max(70.0, min(92.0, b))
        ca_b_factors.append(b)

        atoms = [
            ("N", radius - 0.35, n_theta, ca_z - 0.48, "N"),
            ("CA", radius, theta, ca_z, "C"),
            ("C", radius + 0.25, c_theta, ca_z + 0.50, "C"),
            ("O", radius + 0.55, o_theta, ca_z + 1.12, "O"),
        ]
        if residue_name != "GLY":
            atoms.append(("CB", radius + 1.40, cb_theta, ca_z + 0.22, "C"))

        for atom_name, atom_radius, atom_theta, atom_z, element in atoms:
            atom_x = atom_radius * math.cos(atom_theta)
            atom_y = atom_radius * math.sin(atom_theta)
            lines.append(
                _atom_line(
                    serial=serial,
                    atom_name=atom_name,
                    residue_name=residue_name,
                    residue_id=idx,
                    x=atom_x,
                    y=atom_y,
                    z=atom_z,
                    b_factor=b,
                    element=element,
                )
            )
            serial += 1

    lines.append("TER")
    lines.append("END")

    confidence = (sum(ca_b_factors) / len(ca_b_factors)) / 100.0 if ca_b_factors else 0.75
    return "\n".join(lines), round(confidence, 4)

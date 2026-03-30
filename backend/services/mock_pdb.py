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


def _sub(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _scale(v: tuple[float, float, float], s: float) -> tuple[float, float, float]:
    return (v[0] * s, v[1] * s, v[2] * s)


def _cross(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _norm(v: tuple[float, float, float]) -> float:
    return math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)


def _unit(v: tuple[float, float, float]) -> tuple[float, float, float]:
    mag = _norm(v)
    if mag < 1e-9:
        return (1.0, 0.0, 0.0)
    return (v[0] / mag, v[1] / mag, v[2] / mag)


def _compact_ca_path(length: int, phase: float) -> list[tuple[float, float, float]]:
    """Generate a compact, fold-like CA trajectory (not a straight helix)."""
    points: list[tuple[float, float, float]] = []
    for i in range(length):
        t = i * 0.32 + phase
        x = 11.0 * math.sin(0.73 * t) + 3.2 * math.sin(1.91 * t + 0.4)
        y = 9.0 * math.cos(0.57 * t + 0.6) + 2.4 * math.sin(1.33 * t + 1.2)
        z = 7.2 * math.sin(0.49 * t + 1.1) + 2.1 * math.cos(1.17 * t + 0.2)
        points.append((x, y, z))
    return points


def build_mock_pdb_from_dna(
    dna_sequence: str,
    *,
    candidate_id: int = 0,
    min_residues: int = 180,
) -> tuple[str, float]:
    """Return (pdb_text, confidence_0_to_1)."""
    protein = _to_protein_for_render(dna_sequence, min_residues=min_residues)

    # Candidate-specific phase yields visibly different folds while staying stable.
    phase = (candidate_id % 12) * 0.37
    ca_points = _compact_ca_path(len(protein), phase)

    lines: list[str] = [
        "HEADER    GLOBULAR SYNTHETIC FALLBACK",
        "TITLE     HELIX DEMO STRUCTURE (MOCK FOLD)",
        "MODEL     1",
    ]
    if len(protein) >= 10:
        lines.append(
            f"HELIX    1   1 {AA3.get(protein[0], 'ALA')} A   1  "
            f"{AA3.get(protein[min(19, len(protein)-1)], 'GLY')} A{min(20, len(protein)):4d}  1{20:36d}"
        )
    if len(protein) >= 30:
        lines.append(
            f"SHEET    1   A 2 {AA3.get(protein[24], 'GLY')} A  25  {AA3.get(protein[min(35, len(protein)-1)], 'GLY')} A{min(36, len(protein)):4d}  0"
        )

    serial = 1
    ca_b_factors: list[float] = []

    for idx, (aa, ca) in enumerate(zip(protein, ca_points, strict=True), start=1):
        residue_name = AA3.get(aa, "GLY")
        ca_x, ca_y, ca_z = ca

        prev_ca = ca_points[max(0, idx - 2)]
        next_ca = ca_points[min(len(ca_points) - 1, idx)]
        tangent = _unit(_sub(next_ca, prev_ca))
        ref_up = (0.0, 0.0, 1.0)
        if abs(tangent[2]) > 0.95:
            ref_up = (0.0, 1.0, 0.0)
        normal = _unit(_cross(tangent, ref_up))
        binormal = _unit(_cross(tangent, normal))

        # Confidence-like b-factor (70-92 range, lower at termini).
        center_distance = abs((idx - 1) - (len(protein) - 1) / 2) / max(1.0, len(protein) / 2)
        b = 92.0 - (22.0 * center_distance)
        b = max(70.0, min(92.0, b))
        ca_b_factors.append(b)

        ca_vec = (ca_x, ca_y, ca_z)
        n_vec = _add(_add(ca_vec, _scale(tangent, -1.30)), _scale(normal, 0.34))
        c_vec = _add(_add(ca_vec, _scale(tangent, 1.42)), _scale(normal, -0.28))
        o_vec = _add(_add(c_vec, _scale(binormal, 0.78)), _scale(tangent, -0.22))

        atoms = [
            ("N", n_vec[0], n_vec[1], n_vec[2], "N"),
            ("CA", ca_x, ca_y, ca_z, "C"),
            ("C", c_vec[0], c_vec[1], c_vec[2], "C"),
            ("O", o_vec[0], o_vec[1], o_vec[2], "O"),
        ]
        if residue_name != "GLY":
            cb_vec = _add(_add(ca_vec, _scale(normal, 1.44)), _scale(binormal, 0.26))
            atoms.append(("CB", cb_vec[0], cb_vec[1], cb_vec[2], "C"))

            # Extended sidechains for larger residues (richer surface rendering)
            large_residues = {"ARG", "LYS", "GLU", "GLN", "MET", "LEU", "ILE", "PHE", "TRP", "TYR", "HIS", "PRO"}
            if residue_name in large_residues:
                cg_vec = _add(cb_vec, _scale(normal, 1.38))
                atoms.append(("CG", cg_vec[0], cg_vec[1], cg_vec[2], "C"))
                aromatic = {"PHE", "TRP", "TYR", "HIS"}
                if residue_name in aromatic:
                    cd1_vec = _add(cg_vec, _scale(binormal, 1.22))
                    cd2_vec = _add(cg_vec, _scale(binormal, -1.22))
                    atoms.append(("CD1", cd1_vec[0], cd1_vec[1], cd1_vec[2], "C"))
                    atoms.append(("CD2", cd2_vec[0], cd2_vec[1], cd2_vec[2], "C"))
                elif residue_name in {"ARG", "LYS", "GLU", "GLN", "MET"}:
                    cd_vec = _add(cg_vec, _scale(normal, 1.34))
                    atoms.append(("CD", cd_vec[0], cd_vec[1], cd_vec[2], "C"))

        for atom_name, atom_x, atom_y, atom_z, element in atoms:
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
    lines.append("ENDMDL")
    lines.append("END")

    confidence = (sum(ca_b_factors) / len(ca_b_factors)) / 100.0 if ca_b_factors else 0.75
    return "\n".join(lines), round(confidence, 4)

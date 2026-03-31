"""FASTA and GenBank parsing and export.

Pure functions for converting between raw DNA sequences and standard
bioinformatics file formats. No external dependencies (no BioPython) —
we handle the subset of these formats that genomic IDE users actually need.
"""

from __future__ import annotations

import re
import textwrap
from dataclasses import dataclass, field
from datetime import datetime, timezone

VALID_BASES = frozenset("ATCGNRYSWKMBDHV")


@dataclass
class FastaRecord:
    """A single FASTA record."""
    header: str
    sequence: str
    description: str = ""

    @property
    def id(self) -> str:
        return self.header.split()[0] if self.header else "unknown"


@dataclass
class GenBankFeature:
    """A single GenBank feature (CDS, gene, promoter, etc.)."""
    type: str
    start: int
    end: int
    strand: int = 1  # 1 = forward, -1 = complement
    qualifiers: dict[str, str] = field(default_factory=dict)


@dataclass
class GenBankRecord:
    """A parsed GenBank record."""
    locus: str
    definition: str
    accession: str
    sequence: str
    organism: str = ""
    features: list[GenBankFeature] = field(default_factory=list)


# ---------------------------------------------------------------------------
# FASTA parsing
# ---------------------------------------------------------------------------


def parse_fasta(text: str) -> list[FastaRecord]:
    """Parse one or more FASTA records from text.

    Handles:
    - Standard multi-line FASTA with >header lines
    - Raw sequences (no header) treated as a single record
    - Mixed case, whitespace, line numbers
    """
    text = text.strip()
    if not text:
        return []

    # If no header, treat entire text as a single raw sequence
    if not text.startswith(">"):
        seq = _clean_sequence(text)
        if seq:
            return [FastaRecord(header="imported_sequence", sequence=seq)]
        return []

    records: list[FastaRecord] = []
    current_header = ""
    current_description = ""
    current_lines: list[str] = []

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith(">"):
            # Flush previous record
            if current_header or current_lines:
                seq = _clean_sequence("\n".join(current_lines))
                if seq:
                    records.append(FastaRecord(
                        header=current_header,
                        sequence=seq,
                        description=current_description,
                    ))
            # Parse new header
            header_line = line[1:].strip()
            parts = header_line.split(None, 1)
            current_header = parts[0] if parts else "unknown"
            current_description = parts[1] if len(parts) > 1 else ""
            current_lines = []
        else:
            current_lines.append(line)

    # Flush last record
    if current_header or current_lines:
        seq = _clean_sequence("\n".join(current_lines))
        if seq:
            records.append(FastaRecord(
                header=current_header,
                sequence=seq,
                description=current_description,
            ))

    return records


def export_fasta(
    sequences: list[dict[str, str]],
    line_width: int = 80,
) -> str:
    """Export sequences to FASTA format.

    Args:
        sequences: List of dicts with 'id', 'sequence', and optional 'description'.
        line_width: Characters per sequence line (standard: 80).
    """
    lines: list[str] = []
    for entry in sequences:
        seq_id = entry.get("id", "sequence")
        description = entry.get("description", "")
        sequence = entry.get("sequence", "")
        header = f">{seq_id}"
        if description:
            header += f" {description}"
        lines.append(header)
        for i in range(0, len(sequence), line_width):
            lines.append(sequence[i : i + line_width])
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# GenBank parsing (subset — enough for import)
# ---------------------------------------------------------------------------

_LOCATION_RE = re.compile(
    r"(?:complement\()?"
    r"<?(\d+)\.\.>?(\d+)"
    r"\)?"
)


def parse_genbank(text: str) -> list[GenBankRecord]:
    """Parse GenBank flat file format (subset).

    Handles LOCUS, DEFINITION, ACCESSION, ORGANISM, FEATURES, and ORIGIN.
    """
    text = text.strip()
    if not text:
        return []

    records: list[GenBankRecord] = []
    # Split on // (record separator)
    raw_records = re.split(r"\n//\s*\n?", text)

    for raw in raw_records:
        raw = raw.strip()
        if not raw:
            continue

        locus = _extract_field(raw, "LOCUS")
        definition = _extract_field(raw, "DEFINITION")
        accession = _extract_field(raw, "ACCESSION")
        organism = ""

        # Extract organism from SOURCE section
        org_match = re.search(r"ORGANISM\s+(.+?)(?:\n\s{12}|\n[A-Z])", raw, re.DOTALL)
        if org_match:
            organism = org_match.group(1).strip().split("\n")[0].strip()

        # Extract features
        features = _parse_features(raw)

        # Extract sequence from ORIGIN section
        origin_match = re.search(r"ORIGIN\s*\n(.*?)(?://|\Z)", raw, re.DOTALL)
        sequence = ""
        if origin_match:
            origin_text = origin_match.group(1)
            # Remove line numbers and spaces
            sequence = re.sub(r"[\s\d]+", "", origin_text).upper()
            sequence = "".join(b for b in sequence if b in VALID_BASES)

        if sequence:
            records.append(GenBankRecord(
                locus=locus,
                definition=definition,
                accession=accession,
                sequence=sequence,
                organism=organism,
                features=features,
            ))

    return records


def export_genbank(
    *,
    sequence: str,
    locus: str = "HELIX_SEQ",
    definition: str = "Helix-designed sequence",
    organism: str = "synthetic construct",
    features: list[dict[str, object]] | None = None,
    scores: dict[str, float] | None = None,
) -> str:
    """Export a sequence to GenBank flat file format."""
    now = datetime.now(timezone.utc).strftime("%d-%b-%Y").upper()
    length = len(sequence)
    lines: list[str] = []

    # LOCUS
    lines.append(f"LOCUS       {locus:<16} {length} bp    DNA     linear   SYN {now}")
    lines.append(f"DEFINITION  {definition}")
    lines.append(f"ACCESSION   {locus}")
    lines.append(f"VERSION     {locus}.1")
    lines.append(f"SOURCE      {organism}")
    lines.append(f"  ORGANISM  {organism}")

    # Scores as comment
    if scores:
        lines.append("COMMENT     Helix candidate scores:")
        for key, val in scores.items():
            lines.append(f"            {key}: {val:.4f}")

    # Features
    lines.append("FEATURES             Location/Qualifiers")
    lines.append(f"     source          1..{length}")
    lines.append(f'                     /organism="{organism}"')
    lines.append('                     /mol_type="genomic DNA"')

    if features:
        for feat in features:
            feat_type = str(feat.get("type", "misc_feature"))
            start = int(feat.get("start", 1))
            end = int(feat.get("end", length))
            location = f"{start}..{end}"
            if feat.get("strand") == -1:
                location = f"complement({location})"
            lines.append(f"     {feat_type:<16}{location}")
            for key, val in feat.items():
                if key not in ("type", "start", "end", "strand"):
                    lines.append(f'                     /{key}="{val}"')

    # ORIGIN (sequence in GenBank format: 10-char groups, 6 per line)
    lines.append("ORIGIN")
    seq_lower = sequence.lower()
    for i in range(0, length, 60):
        chunk = seq_lower[i : i + 60]
        groups = " ".join(chunk[j : j + 10] for j in range(0, len(chunk), 10))
        lines.append(f"{i + 1:>9} {groups}")

    lines.append("//")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clean_sequence(text: str) -> str:
    """Strip non-sequence characters, keeping only valid bases."""
    # Remove line numbers (e.g., from GenBank ORIGIN or numbered FASTA)
    text = re.sub(r"^\s*\d+\s*", "", text, flags=re.MULTILINE)
    return "".join(b for b in text.upper() if b in VALID_BASES)


def _extract_field(text: str, field_name: str) -> str:
    """Extract a GenBank header field value."""
    match = re.search(rf"^{field_name}\s+(.+?)$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def _parse_features(text: str) -> list[GenBankFeature]:
    """Parse GenBank FEATURES table."""
    features: list[GenBankFeature] = []
    feat_section = re.search(r"FEATURES\s+Location/Qualifiers\n(.*?)(?=ORIGIN|\Z)", text, re.DOTALL)
    if not feat_section:
        return features

    feat_text = feat_section.group(1)
    # Match feature lines (5 spaces + type + spaces + location)
    feat_pattern = re.compile(r"^\s{5}(\S+)\s+([\S]+)", re.MULTILINE)

    for match in feat_pattern.finditer(feat_text):
        feat_type = match.group(1)
        location = match.group(2)

        strand = -1 if "complement" in location else 1
        loc_match = _LOCATION_RE.search(location)
        if loc_match:
            start = int(loc_match.group(1))
            end = int(loc_match.group(2))
        else:
            continue

        # Collect qualifiers (lines starting with 21 spaces + /)
        qual_start = match.end()
        qualifiers: dict[str, str] = {}
        for qline in feat_text[qual_start:].splitlines():
            if not qline.startswith("                     /"):
                if qline.strip() and not qline.startswith("                     "):
                    break
                continue
            qtext = qline.strip().lstrip("/")
            if "=" in qtext:
                qkey, qval = qtext.split("=", 1)
                qualifiers[qkey] = qval.strip('"')

        features.append(GenBankFeature(
            type=feat_type, start=start, end=end, strand=strand, qualifiers=qualifiers,
        ))

    return features

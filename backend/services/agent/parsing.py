"""Pure parsing functions for agent input interpretation and sequence transforms."""

from __future__ import annotations

import json
import re
from typing import Any

from models.domain import CandidateScores
from services.translation import reverse_complement

BASES = ("A", "T", "C", "G")

EDIT_RE = re.compile(
    r"(?:position|pos|base|bp)\s*(\d+)\D+(?:to|with|as|=)\s*([ATCG])\b",
    flags=re.IGNORECASE,
)

ALLOWED_TOOLS = frozenset({
    "explain_candidate",
    "edit_base",
    "optimize_candidate",
    "compare_candidates",
    "transform_sequence",
    "restore_sequence",
    "codon_optimize",
    "offtarget_scan",
    "insert_bases",
    "delete_bases",
    "restriction_sites",
})


def parse_explicit_edit(message: str) -> tuple[int, str] | None:
    match = EDIT_RE.search(message)
    if match is None:
        return None
    return int(match.group(1)), match.group(2).upper()


def parse_transform_mode(text: str) -> str | None:
    if "reverse complement" in text:
        return "reverse_complement"
    if re.search(r"\ball\s+t(?:s|'s)?\b", text) or "all thymine" in text:
        return "all_t"
    if re.search(r"\ball\s+a(?:s|'s)?\b", text) or "all adenine" in text:
        return "all_a"
    if re.search(r"\ball\s+c(?:s|'s)?\b", text) or "all cytosine" in text:
        return "all_c"
    if re.search(r"\ball\s+g(?:s|'s)?\b", text) or "all guanine" in text:
        return "all_g"
    return None


def parse_base_replacement(text: str) -> tuple[str, str] | None:
    match = re.search(
        r"(?:change|replace|convert|swap|turn)\s+all\s+([atcg])(?:['']s|s)?\s+(?:to|with|into)\s+([atcg])(?:['']s|s)?",
        text,
        flags=re.IGNORECASE,
    )
    if match is None:
        return None
    from_base = match.group(1).upper()
    to_base = match.group(2).upper()
    if from_base == to_base:
        return None
    return from_base, to_base


def apply_transform(
    sequence: str,
    mode: str,
    *,
    from_base: str | None = None,
    to_base: str | None = None,
) -> str:
    sequence = sequence.upper()
    mode = mode.strip().lower()
    if mode == "all_t":
        return "T" * len(sequence)
    if mode == "all_a":
        return "A" * len(sequence)
    if mode == "all_c":
        return "C" * len(sequence)
    if mode == "all_g":
        return "G" * len(sequence)
    if mode == "reverse_complement":
        return reverse_complement(sequence)
    if mode == "replace_base":
        from_base = (from_base or "").upper()
        to_base = (to_base or "").upper()
        if from_base not in BASES or to_base not in BASES or from_base == to_base:
            return sequence
        return sequence.replace(from_base, to_base)
    return sequence


def objective_from_prompt(text: str) -> str:
    if "off-target" in text or "safer" in text or "safety" in text:
        return "safety"
    if "functional" in text or "plausibility" in text:
        return "functional"
    if "novel" in text:
        return "novelty"
    return "tissue_specificity"


def objective_score(scores: CandidateScores, objective: str) -> float:
    if objective == "safety":
        return (1.0 - scores.off_target) * 0.7 + scores.functional * 0.2 + scores.tissue_specificity * 0.1
    if objective == "functional":
        return scores.functional * 0.7 + scores.tissue_specificity * 0.2 + (1.0 - scores.off_target) * 0.1
    if objective == "novelty":
        return scores.novelty * 0.7 + scores.functional * 0.2 + (1.0 - scores.off_target) * 0.1
    return scores.tissue_specificity * 0.7 + scores.functional * 0.2 + (1.0 - scores.off_target) * 0.1


def band(value: float) -> str:
    if value >= 0.75:
        return "strong"
    if value >= 0.55:
        return "promising"
    if value >= 0.40:
        return "mixed"
    return "weak"


def extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        snippet = text[start : end + 1]
        try:
            parsed = json.loads(snippet)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def normalize_action(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    tool = str(entry.get("tool", "")).strip()
    args = entry.get("args", {})
    if not isinstance(args, dict):
        args = {}
    if tool not in ALLOWED_TOOLS:
        return None
    return {"tool": tool, "args": args}


def message_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, str):
                chunks.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    chunks.append(text)
        return "\n".join(chunks)
    return str(content)

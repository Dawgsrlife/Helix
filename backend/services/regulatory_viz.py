"""Regulatory visualization payload builder for non-coding design modes."""

from __future__ import annotations

from dataclasses import dataclass

MOTIFS: dict[str, str] = {
    "TATA_box": "TATAAA",
    "CAAT_box": "CCAAT",
    "GC_box": "GGGCGG",
    "polyA_signal": "AATAAA",
    "CpG": "CG",
}


@dataclass(frozen=True)
class RegulatoryFeature:
    name: str
    start: int
    end: int
    score: float


@dataclass(frozen=True)
class GCWindow:
    start: int
    end: int
    gc: float


def _find_occurrences(sequence: str, motif: str) -> list[int]:
    out: list[int] = []
    start = 0
    while True:
        idx = sequence.find(motif, start)
        if idx < 0:
            break
        out.append(idx)
        start = idx + 1
    return out


def _window_gc(sequence: str, start: int, end: int) -> float:
    window = sequence[start:end]
    if not window:
        return 0.0
    gc_count = sum(1 for base in window if base in {"G", "C"})
    return gc_count / len(window)


def build_regulatory_map(sequence: str) -> dict[str, object]:
    seq = sequence.upper()
    features: list[RegulatoryFeature] = []

    for name, motif in MOTIFS.items():
        for start in _find_occurrences(seq, motif):
            end = start + len(motif)
            motif_len_bonus = min(0.2, len(motif) / 40.0)
            features.append(
                RegulatoryFeature(
                    name=name,
                    start=start,
                    end=end,
                    score=round(0.55 + motif_len_bonus, 4),
                )
            )

    window_size = 24
    step = 6
    windows: list[GCWindow] = []
    for start in range(0, max(1, len(seq) - window_size + 1), step):
        end = min(len(seq), start + window_size)
        windows.append(GCWindow(start=start, end=end, gc=round(_window_gc(seq, start, end), 4)))

    global_gc = round(_window_gc(seq, 0, len(seq)), 4)

    # Build coarse hotspot map (0-1) for quick frontend rendering.
    hotspots: list[float] = [0.0 for _ in seq]
    for feature in features:
        for pos in range(feature.start, min(feature.end, len(hotspots))):
            hotspots[pos] = max(hotspots[pos], feature.score)

    return {
        "sequence_length": len(seq),
        "gc_content": global_gc,
        "features": [
            {
                "name": feature.name,
                "start": feature.start,
                "end": feature.end,
                "score": feature.score,
            }
            for feature in features
        ],
        "gc_windows": [
            {
                "start": window.start,
                "end": window.end,
                "gc": window.gc,
            }
            for window in windows
        ],
        "hotspots": hotspots,
    }

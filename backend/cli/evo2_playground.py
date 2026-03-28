#!/usr/bin/env python3
"""Interactive Evo2 playground — test every operation with visual feedback.

Run from backend/:
    source .venv/bin/activate
    python -m cli.evo2_playground

Commands:
    forward <sequence>              Per-position log-likelihoods with heatmap
    score <sequence>                Total sequence log-likelihood
    mutate <sequence> <pos> <base>  Score a single mutation
    generate <seed> [n_tokens]      Stream-generate bases from a seed
    multiscore <sequence>           Full 4-dimensional scoring pipeline
    compare <seq1> <seq2>           Side-by-side 4D scoring comparison
    translate <sequence>            DNA -> protein translation + ORF finding
    help                            Show this help
    quit / exit                     Exit
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, TextColumn
from rich.table import Table
from rich.text import Text

from models.domain import CandidateScores
from pipeline.evo2_score import score_candidate, rescore_mutation
from services.evo2 import Evo2MockService
from services.translation import (
    find_orfs,
    gc_content,
    translate as dna_translate,
    reverse_complement,
)

console = Console()
service = Evo2MockService()

# Color scale for log-likelihoods (green = high, red = low)
_LL_COLORS = [
    (-0.6, "red"),
    (-0.45, "bright_red"),
    (-0.35, "yellow"),
    (-0.25, "bright_green"),
    (-0.1, "green"),
]


def _ll_color(ll: float) -> str:
    for threshold, color in _LL_COLORS:
        if ll <= threshold:
            return color
    return "bold green"


def _impact_color(impact: str) -> str:
    return {"benign": "green", "moderate": "yellow", "deleterious": "red"}.get(
        impact, "white"
    )


def _score_bar(label: str, value: float, invert: bool = False) -> str:
    """Render a score as a colored bar."""
    display = value if not invert else 1.0 - value
    blocks = int(display * 20)
    bar = "█" * blocks + "░" * (20 - blocks)
    if display >= 0.7:
        color = "green"
    elif display >= 0.4:
        color = "yellow"
    else:
        color = "red"
    return f"  {label:22s} [{color}]{bar}[/] {value:.4f}"


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


async def cmd_forward(sequence: str) -> None:
    result = await service.forward(sequence)

    # Render bases with heatmap coloring
    text = Text()
    for i, (base, ll) in enumerate(zip(sequence.upper(), result.logits)):
        text.append(base, style=_ll_color(ll))

    console.print(Panel(text, title="Sequence (colored by log-likelihood)", border_style="blue"))

    # Stats
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_row("Sequence length", str(len(sequence)))
    table.add_row("Mean log-likelihood", f"{result.sequence_score:.6f}")
    table.add_row("Min", f"{min(result.logits):.6f}")
    table.add_row("Max", f"{max(result.logits):.6f}")
    table.add_row("GC content", f"{gc_content(sequence):.2%}")
    console.print(table)

    # Per-position detail (first 60 bases)
    display_len = min(len(sequence), 60)
    console.print(f"\n  Per-position log-likelihoods (first {display_len}):")
    line1 = Text("  ")
    line2 = Text("  ")
    for i in range(display_len):
        base = sequence[i].upper()
        ll = result.logits[i]
        line1.append(f"{base:>6s}", style=_ll_color(ll))
        line2.append(f"{ll:>6.3f}", style=_ll_color(ll))
    console.print(line1)
    console.print(line2)


async def cmd_score(sequence: str) -> None:
    score = await service.score(sequence)
    console.print(f"  Total log-likelihood: [bold]{score:.6f}[/]")
    console.print(f"  GC content: {gc_content(sequence):.2%}")


async def cmd_mutate(sequence: str, position: int, alt_base: str) -> None:
    mutation = await service.score_mutation(sequence, position, alt_base)

    table = Table(title="Mutation Effect", show_header=False, border_style="cyan")
    table.add_column("Field", style="bold")
    table.add_column("Value")
    table.add_row("Position", str(mutation.position))
    table.add_row("Reference", mutation.reference_base)
    table.add_row("Alternate", mutation.alternate_base)
    table.add_row("Delta likelihood", f"{mutation.delta_likelihood:+.6f}")
    table.add_row(
        "Predicted impact",
        f"[{_impact_color(mutation.predicted_impact.value)}]{mutation.predicted_impact.value}[/]",
    )
    console.print(table)

    # Show context around mutation
    seq = sequence.upper()
    ctx_start = max(0, position - 10)
    ctx_end = min(len(seq), position + 11)
    text = Text("  Context: ")
    for i in range(ctx_start, ctx_end):
        if i == position:
            text.append(f"[{seq[i]}->{alt_base.upper()}]", style="bold red")
        else:
            text.append(seq[i], style="dim")
    console.print(text)


async def cmd_generate(seed: str, n_tokens: int) -> None:
    console.print(f"  Seed: [dim]{seed}[/]")
    console.print(f"  Generating {n_tokens} tokens...\n")

    generated = Text("  ")
    generated.append(seed, style="dim")
    tokens: list[str] = []

    async for token in service.generate(seed, n_tokens):
        tokens.append(token)
        generated.append(token, style="bold bright_green")

    console.print(generated)
    full_seq = seed + "".join(tokens)
    console.print(f"\n  Full sequence ({len(full_seq)} bp): {full_seq}")
    console.print(f"  GC content: {gc_content(full_seq):.2%}")


async def cmd_multiscore(sequence: str) -> None:
    console.print("  Running 4-dimensional scoring pipeline...\n")
    scores, per_pos = await score_candidate(
        service, sequence, target_tissues=["hippocampal_neurons"]
    )

    console.print(_score_bar("Functional", scores.functional))
    console.print(_score_bar("Tissue specificity", scores.tissue_specificity))
    console.print(_score_bar("Off-target risk", scores.off_target, invert=True))
    console.print(_score_bar("Novelty", scores.novelty))
    console.print(f"\n  [bold]Combined score: {scores.combined:.4f}[/]")

    # Heatmap
    display_len = min(len(sequence), 60)
    text = Text("\n  Heatmap: ")
    for i in range(display_len):
        text.append(sequence[i].upper(), style=_ll_color(per_pos[i].score))
    if len(sequence) > 60:
        text.append(f"... (+{len(sequence) - 60} more)", style="dim")
    console.print(text)


async def cmd_compare(seq1: str, seq2: str) -> None:
    s1, _ = await score_candidate(service, seq1, target_tissues=["hippocampal_neurons"])
    s2, _ = await score_candidate(service, seq2, target_tissues=["hippocampal_neurons"])

    table = Table(title="Candidate Comparison", border_style="magenta")
    table.add_column("Dimension", style="bold")
    table.add_column("Candidate A", justify="right")
    table.add_column("Candidate B", justify="right")
    table.add_column("Winner", justify="center")

    for label, a, b, lower_better in [
        ("Functional", s1.functional, s2.functional, False),
        ("Tissue specificity", s1.tissue_specificity, s2.tissue_specificity, False),
        ("Off-target risk", s1.off_target, s2.off_target, True),
        ("Novelty", s1.novelty, s2.novelty, False),
        ("Combined", s1.combined, s2.combined, False),
    ]:
        if lower_better:
            winner = "A" if a < b else "B" if b < a else "="
        else:
            winner = "A" if a > b else "B" if b > a else "="
        color = "green" if winner != "=" else "yellow"
        table.add_row(label, f"{a:.4f}", f"{b:.4f}", f"[{color}]{winner}[/]")

    console.print(table)


async def cmd_translate(sequence: str) -> None:
    protein = dna_translate(sequence, to_stop=False)
    rev_comp = reverse_complement(sequence)
    gc = gc_content(sequence)
    orfs = find_orfs(sequence, min_length=30)

    table = Table(title="Translation & Analysis", show_header=False, border_style="green")
    table.add_column("Field", style="bold")
    table.add_column("Value")
    table.add_row("DNA length", f"{len(sequence)} bp")
    table.add_row("GC content", f"{gc:.2%}")
    table.add_row("Protein (frame 1)", protein[:80] + ("..." if len(protein) > 80 else ""))
    table.add_row("Protein length", f"{len(protein)} aa")
    table.add_row("Rev complement (first 50)", rev_comp[:50] + "...")
    table.add_row("ORFs found (>=30 nt)", str(len(orfs)))
    console.print(table)

    if orfs:
        console.print("\n  [bold]Open Reading Frames:[/]")
        for i, orf in enumerate(orfs[:5]):
            console.print(
                f"    ORF {i+1}: {orf.strand} strand, frame {orf.frame}, "
                f"pos {orf.start}-{orf.end} ({orf.end - orf.start} nt), "
                f"protein: {orf.protein[:30]}{'...' if len(orf.protein) > 30 else ''}"
            )


def show_help() -> None:
    console.print(Panel(
        __doc__ or "",
        title="Evo2 Playground",
        border_style="bright_blue",
    ))


# ---------------------------------------------------------------------------
# REPL
# ---------------------------------------------------------------------------


async def main() -> None:
    console.print(Panel(
        "[bold bright_blue]Helix Evo2 Playground[/]\n"
        "Interactive testing interface for the Evo2 service layer.\n"
        "Type [bold]help[/] for commands.",
        border_style="bright_blue",
    ))

    # Sample sequence for quick testing
    sample = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCCCCTGCAGAACTGA"
    console.print(f"  [dim]Sample sequence loaded ({len(sample)} bp): {sample[:40]}...[/]\n")

    while True:
        try:
            raw = console.input("[bold cyan]helix>[/] ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n  Bye!")
            break

        if not raw:
            continue

        parts = raw.split()
        cmd = parts[0].lower()

        try:
            if cmd in ("quit", "exit", "q"):
                console.print("  Bye!")
                break
            elif cmd == "help":
                show_help()
            elif cmd == "forward":
                seq = parts[1] if len(parts) > 1 else sample
                await cmd_forward(seq)
            elif cmd == "score":
                seq = parts[1] if len(parts) > 1 else sample
                await cmd_score(seq)
            elif cmd == "mutate":
                seq = parts[1] if len(parts) > 1 else sample
                pos = int(parts[2]) if len(parts) > 2 else 5
                base = parts[3] if len(parts) > 3 else "G"
                await cmd_mutate(seq, pos, base)
            elif cmd == "generate":
                seed = parts[1] if len(parts) > 1 else "ATG"
                n = int(parts[2]) if len(parts) > 2 else 30
                await cmd_generate(seed, n)
            elif cmd == "multiscore":
                seq = parts[1] if len(parts) > 1 else sample
                await cmd_multiscore(seq)
            elif cmd == "compare":
                if len(parts) < 3:
                    console.print("  Usage: compare <seq1> <seq2>")
                    continue
                await cmd_compare(parts[1], parts[2])
            elif cmd == "translate":
                seq = parts[1] if len(parts) > 1 else sample
                await cmd_translate(seq)
            elif cmd == "sample":
                console.print(f"  {sample}")
            else:
                console.print(f"  [red]Unknown command: {cmd}[/]. Type [bold]help[/].")
        except Exception as e:
            console.print(f"  [red]Error: {e}[/]")

        console.print()


if __name__ == "__main__":
    asyncio.run(main())

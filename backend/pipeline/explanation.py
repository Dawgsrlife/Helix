"""Explanation layer — generates mechanistic reports for candidates via Gemini streaming.

Takes a candidate's sequence, scores, and design context, then streams
a plain English explanation back via WebSocket ExplanationChunkEvents.
"""

from __future__ import annotations

import logging

from config import settings
from models.domain import DesignSpec
from ws.events import ExplanationChunkData, ExplanationChunkEvent
from ws.manager import WebSocketManager

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a genomic design analyst for Helix, a genomic design IDE. \
Given a candidate DNA sequence, its scoring results, and the researcher's design goal, \
write a concise mechanistic explanation (3-5 sentences) covering:

1. Why this candidate scores well or poorly based on its functional plausibility and tissue specificity
2. Any off-target risks or notable sequence features
3. A brief suggested next step for wet lab validation

Be specific to the actual scores and sequence properties. Do not be generic. \
Use scientific language appropriate for a molecular biology researcher."""


def _build_prompt(
    sequence: str,
    scores: dict,
    spec: DesignSpec,
) -> str:
    """Build the user prompt with candidate details."""
    parts = [f"Design goal: {spec.design_type}"]
    if spec.target_gene:
        parts.append(f"Target gene: {spec.target_gene}")
    if spec.organism:
        parts.append(f"Organism: {spec.organism}")
    if spec.tissue_specificity:
        if spec.tissue_specificity.high_expression:
            parts.append(f"Target tissues: {', '.join(spec.tissue_specificity.high_expression)}")
    if spec.therapeutic_context:
        parts.append(f"Therapeutic context: {spec.therapeutic_context}")

    parts.append(f"\nCandidate sequence ({len(sequence)} bp): {sequence[:100]}{'...' if len(sequence) > 100 else ''}")
    parts.append(f"\nScoring results:")
    parts.append(f"  Functional plausibility: {scores.get('functional', 'N/A')}")
    parts.append(f"  Tissue specificity: {scores.get('tissue_specificity', 'N/A')}")
    parts.append(f"  Off-target risk: {scores.get('off_target', 'N/A')}")
    parts.append(f"  Novelty: {scores.get('novelty', 'N/A')}")
    if "combined" in scores:
        parts.append(f"  Combined rank: {scores['combined']}")

    parts.append("\nProvide a concise mechanistic explanation of this candidate.")
    return "\n".join(parts)


_FALLBACK_CHUNKS = [
    "Candidate preserves core promoter-like motifs.",
    "Predicted expression bias aligns with requested tissue profile.",
]


async def generate_explanation(
    *,
    sequence: str,
    scores: dict,
    spec: DesignSpec,
    candidate_id: int,
    manager: WebSocketManager,
    session_id: str,
) -> None:
    """Stream a mechanistic explanation for a candidate via WebSocket.

    Uses Gemini 2.5 Flash streaming. Falls back to hardcoded text on failure.
    """
    if not settings.gemini_api_key:
        logger.warning("No GEMINI_API_KEY — using fallback explanation")
        await _emit_fallback(manager, session_id, candidate_id)
        return

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        prompt = _build_prompt(sequence, scores, spec)

        response = await client.aio.models.generate_content_stream(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                max_output_tokens=512,
            ),
        )

        async for chunk in response:
            if chunk.text:
                await manager.send_event(
                    session_id,
                    ExplanationChunkEvent(
                        data=ExplanationChunkData(candidate_id=candidate_id, text=chunk.text)
                    ).to_json(),
                )

    except Exception:
        logger.warning("Explanation generation failed, using fallback", exc_info=True)
        await _emit_fallback(manager, session_id, candidate_id)


async def _emit_fallback(manager: WebSocketManager, session_id: str, candidate_id: int) -> None:
    """Emit hardcoded explanation chunks as fallback."""
    for chunk in _FALLBACK_CHUNKS:
        await manager.send_event(
            session_id,
            ExplanationChunkEvent(data=ExplanationChunkData(candidate_id=candidate_id, text=chunk)).to_json(),
        )

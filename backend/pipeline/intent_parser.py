import json
from backend.config import settings
from backend.models.domain import DesignSpec

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

SYSTEM_PROMPT = """You are a genomic design assistant. Your role is to decompose \
a researcher's natural language design goal into a structured biological specification.

The specification will drive a DNA sequence generation pipeline. Extract as much \
structured information as possible from the goal. Only populate fields that are \
clearly mentioned or strongly implied — do not guess at values the researcher \
did not specify.

Examples of design_type values: regulatory_element, coding_sequence, promoter, \
enhancer, genome_fragment, terminator, ribosome_binding_site, origin_of_replication.

For organism, use common names (e.g., "human", "E. coli", "mouse") when clear \
from context.

For constraints, extract specific requirements like "novel_sequence", \
"no_known_pathogenic_variants", "high_gc_content", "codon_optimized", etc."""


async def parse_intent(goal: str) -> DesignSpec:
    """Decompose a natural language design goal into a structured DesignSpec.

    Uses Gemini's structured output (response_schema) to guarantee valid JSON
    matching the DesignSpec Pydantic model.
    """
    use_gemini = settings.intent_llm.lower() in {"gemini", "google"} and settings.intent_allow_live_calls
    if not use_gemini or not settings.gemini_api_key or genai is None or types is None:
        return _heuristic_intent(goal)

    client = genai.Client(api_key=settings.gemini_api_key)

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=goal,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=DesignSpec,
        ),
    )

    parsed = json.loads(response.text)
    return DesignSpec.model_validate(parsed)


def _heuristic_intent(goal: str) -> DesignSpec:
    goal_lower = goal.lower()
    design_type = "regulatory_element"
    if "promoter" in goal_lower:
        design_type = "promoter"
    elif "enhancer" in goal_lower:
        design_type = "enhancer"
    elif "coding" in goal_lower:
        design_type = "coding_sequence"

    constraints: list[str] = []
    if "novel" in goal_lower:
        constraints.append("novel_sequence")
    if "pathogenic" in goal_lower:
        constraints.append("no_known_pathogenic_variants")

    return DesignSpec(
        design_type=design_type,
        target_gene=_extract_target_gene(goal),
        tissue_specificity=_extract_tissue(goal_lower),
        constraints=constraints,
    )


def _extract_target_gene(goal: str) -> str | None:
    tokens = goal.replace(",", " ").replace(".", " ").split()
    for token in tokens:
        cleaned = token.strip()
        if cleaned.isalpha() and 2 <= len(cleaned) <= 8 and cleaned.upper() == cleaned:
            return cleaned
    return None


def _extract_tissue(goal_lower: str) -> "TissueSpec | None":
    from backend.models.domain import TissueSpec

    high: list[str] = []
    if "hippocamp" in goal_lower:
        high.append("hippocampal_neurons")
    elif "neuron" in goal_lower or "brain" in goal_lower:
        high.append("neurons")
    elif "heart" in goal_lower or "cardiac" in goal_lower:
        high.append("cardiac_tissue")
    if not high:
        return None
    return TissueSpec(high_expression=high)

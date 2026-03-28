import json
from google import genai
from google.genai import types
from backend.config import GEMINI_API_KEY
from backend.models.domain import DesignSpec

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
    client = genai.Client(api_key=GEMINI_API_KEY)

    response = await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=goal,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=DesignSpec,
        ),
    )

    parsed = json.loads(response.text)
    return DesignSpec.model_validate(parsed)

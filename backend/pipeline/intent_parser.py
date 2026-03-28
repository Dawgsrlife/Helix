import anthropic
from backend.config import CLAUDE_API_KEY
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

TOOL_NAME = "parse_design_spec"

TOOL_DEFINITION = {
    "name": TOOL_NAME,
    "description": (
        "Parse a natural language genomic design goal into a structured "
        "biological specification."
    ),
    "input_schema": DesignSpec.model_json_schema(),
}


async def parse_intent(goal: str) -> DesignSpec:
    client = anthropic.AsyncAnthropic(api_key=CLAUDE_API_KEY)
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        tools=[TOOL_DEFINITION],
        tool_choice={"type": "tool", "name": TOOL_NAME},
        messages=[{"role": "user", "content": goal}],
    )
    tool_use_block = next(
        block for block in response.content if block.type == "tool_use"
    )
    return DesignSpec.model_validate(tool_use_block.input)

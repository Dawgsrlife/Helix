"""Pydantic response models — serialized to JSON at the API boundary.

These must match what the frontend expects in lib/api.ts.
"""

from pydantic import BaseModel


class DesignAcceptedResponse(BaseModel):
    session_id: str
    status: str = "pipeline_started"
    ws_url: str


class CandidateScoresResponse(BaseModel):
    functional: float
    tissue_specificity: float
    off_target: float
    novelty: float
    combined: float | None = None


class BaseEditResponse(BaseModel):
    position: int
    reference_base: str
    new_base: str
    delta_likelihood: float
    predicted_impact: str  # "benign" | "moderate" | "deleterious"
    updated_scores: CandidateScoresResponse


class MutationResponse(BaseModel):
    position: int
    reference_base: str
    alternate_base: str
    delta_likelihood: float
    predicted_impact: str


class FollowupAcceptedResponse(BaseModel):
    status: str = "partial_rerun_started"
    steps_rerunning: list[str]


class AgentToolCallResponse(BaseModel):
    tool: str
    status: str
    summary: str


class AgentCandidateUpdateResponse(BaseModel):
    candidate_id: int
    sequence: str
    scores: CandidateScoresResponse
    mutation: dict[str, object] | None = None
    per_position_scores: list[dict[str, float | int]] | None = None


class AgentChatResponse(BaseModel):
    assistant_message: str
    tool_calls: list[AgentToolCallResponse]
    candidate_update: AgentCandidateUpdateResponse | None = None
    comparison: list[dict[str, object]] | None = None


class StructureResponse(BaseModel):
    pdb_data: str
    model: str = "mock"
    confidence: float = 0.0


class HealthResponse(BaseModel):
    status: str
    model: str
    gpu_available: bool
    inference_mode: str


class AnalysisResponse(BaseModel):
    sequence: str
    regions: list[dict[str, object]]
    scores: list[dict[str, float | int]]
    proteins: list[dict[str, object]]

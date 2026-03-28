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


class HealthResponse(BaseModel):
    status: str
    model: str
    gpu_available: bool
    inference_mode: str

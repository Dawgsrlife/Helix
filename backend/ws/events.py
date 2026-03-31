"""WebSocket event models for pipeline streaming."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class IntentParsedData(BaseModel):
    spec: dict[str, Any]


class IntentParsedEvent(BaseModel):
    event: Literal["intent_parsed"] = "intent_parsed"
    data: IntentParsedData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class PipelineManifestData(BaseModel):
    session_id: str
    requested_candidates: int
    candidate_ids: list[int]
    run_profile: Literal["demo", "live"]
    truth_mode: Literal["demo_fallback", "real_only"] = "demo_fallback"
    candidate_seed_sequences: dict[int, str] = Field(default_factory=dict)


class PipelineManifestEvent(BaseModel):
    event: Literal["pipeline_manifest"] = "pipeline_manifest"
    data: PipelineManifestData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class StageStatusData(BaseModel):
    stage: Literal["intent", "retrieval", "generation", "scoring", "structure", "explanation", "complete"]
    status: Literal["pending", "active", "done", "failed"] = "pending"
    progress: float = 0.0


class StageStatusEvent(BaseModel):
    event: Literal["stage_status"] = "stage_status"
    data: StageStatusData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class RetrievalProgressData(BaseModel):
    source: Literal["ncbi", "pubmed", "clinvar"]
    status: Literal["pending", "running", "complete", "failed"] = "complete"
    result: dict[str, Any] | None = None


class RetrievalProgressEvent(BaseModel):
    event: Literal["retrieval_progress"] = "retrieval_progress"
    data: RetrievalProgressData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class GenerationTokenData(BaseModel):
    candidate_id: int
    token: str
    position: int


class GenerationTokenEvent(BaseModel):
    event: Literal["generation_token"] = "generation_token"
    data: GenerationTokenData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class GenerationBatchData(BaseModel):
    candidate_id: int
    tokens: str
    start_position: int


class GenerationBatchEvent(BaseModel):
    event: Literal["generation_batch"] = "generation_batch"
    data: GenerationBatchData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class GenerationProgressData(BaseModel):
    candidate_id: int
    generated_bp: int
    target_bp: int
    progress: float


class GenerationProgressEvent(BaseModel):
    event: Literal["generation_progress"] = "generation_progress"
    data: GenerationProgressData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class CandidateScoredData(BaseModel):
    candidate_id: int
    scores: dict[str, float]
    per_position_scores: list[dict[str, float | int]] = Field(default_factory=list)


class CandidateScoredEvent(BaseModel):
    event: Literal["candidate_scored"] = "candidate_scored"
    data: CandidateScoredData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class CandidateStatusData(BaseModel):
    candidate_id: int
    status: Literal["queued", "running", "scored", "structured", "failed"]
    reason: str | None = None


class CandidateStatusEvent(BaseModel):
    event: Literal["candidate_status"] = "candidate_status"
    data: CandidateStatusData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class CandidateSeedData(BaseModel):
    candidate_id: int
    sequence: str
    source: Literal["retrieval_context", "fallback_seed"] = "fallback_seed"


class CandidateSeedEvent(BaseModel):
    event: Literal["candidate_seeded"] = "candidate_seeded"
    data: CandidateSeedData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class StructureReadyData(BaseModel):
    candidate_id: int
    pdb_data: str
    confidence: float | None = None


class StructureReadyEvent(BaseModel):
    event: Literal["structure_ready"] = "structure_ready"
    data: StructureReadyData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class ExplanationChunkData(BaseModel):
    candidate_id: int
    text: str


class ExplanationChunkEvent(BaseModel):
    event: Literal["explanation_chunk"] = "explanation_chunk"
    data: ExplanationChunkData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class RegulatoryMapReadyData(BaseModel):
    candidate_id: int
    regulatory_map: dict[str, Any]


class RegulatoryMapReadyEvent(BaseModel):
    event: Literal["regulatory_map_ready"] = "regulatory_map_ready"
    data: RegulatoryMapReadyData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class PipelineCompleteData(BaseModel):
    requested_candidates: int
    completed_candidates: int
    failed_candidates: int
    candidates: list[dict[str, Any]]


class PipelineCompleteEvent(BaseModel):
    event: Literal["pipeline_complete"] = "pipeline_complete"
    data: PipelineCompleteData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")

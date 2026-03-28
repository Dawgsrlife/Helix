"""WebSocket event models for pipeline streaming."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class IntentParsedData(BaseModel):
    spec: dict[str, Any]


class IntentParsedEvent(BaseModel):
    event: Literal["intent_parsed"] = "intent_parsed"
    data: IntentParsedData

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


class CandidateScoredData(BaseModel):
    candidate_id: int
    scores: dict[str, float]


class CandidateScoredEvent(BaseModel):
    event: Literal["candidate_scored"] = "candidate_scored"
    data: CandidateScoredData

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
    text: str


class ExplanationChunkEvent(BaseModel):
    event: Literal["explanation_chunk"] = "explanation_chunk"
    data: ExplanationChunkData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class PipelineCompleteData(BaseModel):
    candidates: list[dict[str, Any]]


class PipelineCompleteEvent(BaseModel):
    event: Literal["pipeline_complete"] = "pipeline_complete"
    data: PipelineCompleteData

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


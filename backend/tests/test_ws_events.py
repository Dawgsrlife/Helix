"""Tests for websocket event payload shapes."""

from ws.events import (
    CandidateScoredData,
    CandidateScoredEvent,
    ExplanationChunkData,
    ExplanationChunkEvent,
    GenerationTokenData,
    GenerationTokenEvent,
    IntentParsedData,
    IntentParsedEvent,
    PipelineCompleteData,
    PipelineCompleteEvent,
    RetrievalProgressData,
    RetrievalProgressEvent,
    StructureReadyData,
    StructureReadyEvent,
)


def test_intent_event_json_shape() -> None:
    payload = IntentParsedEvent(data=IntentParsedData(spec={"target_gene": "BDNF"})).to_json()
    assert payload["event"] == "intent_parsed"
    assert payload["data"]["spec"]["target_gene"] == "BDNF"


def test_retrieval_event_json_shape() -> None:
    payload = RetrievalProgressEvent(
        data=RetrievalProgressData(source="ncbi", status="complete", result={"ok": True})
    ).to_json()
    assert payload["event"] == "retrieval_progress"
    assert payload["data"]["source"] == "ncbi"
    assert payload["data"]["status"] == "complete"


def test_generation_event_json_shape() -> None:
    payload = GenerationTokenEvent(
        data=GenerationTokenData(candidate_id=1, token="A", position=3)
    ).to_json()
    assert payload == {
        "event": "generation_token",
        "data": {"candidate_id": 1, "token": "A", "position": 3},
    }


def test_candidate_scored_event_json_shape() -> None:
    payload = CandidateScoredEvent(
        data=CandidateScoredData(
            candidate_id=0,
            scores={"functional": 0.9, "tissue_specificity": 0.7, "off_target": 0.1, "novelty": 0.4},
        )
    ).to_json()
    assert payload["event"] == "candidate_scored"
    assert payload["data"]["scores"]["functional"] == 0.9


def test_structure_event_json_shape() -> None:
    payload = StructureReadyEvent(
        data=StructureReadyData(candidate_id=0, pdb_data="ATOM ...", confidence=0.8)
    ).to_json()
    assert payload["event"] == "structure_ready"
    assert payload["data"]["pdb_data"] == "ATOM ..."


def test_explanation_event_json_shape() -> None:
    payload = ExplanationChunkEvent(data=ExplanationChunkData(text="hello")).to_json()
    assert payload == {"event": "explanation_chunk", "data": {"text": "hello"}}


def test_pipeline_complete_event_json_shape() -> None:
    payload = PipelineCompleteEvent(
        data=PipelineCompleteData(candidates=[{"id": 0, "sequence": "ATCG"}])
    ).to_json()
    assert payload["event"] == "pipeline_complete"
    assert payload["data"]["candidates"][0]["id"] == 0

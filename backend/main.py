"""FastAPI entrypoint for Helix backend demo integration."""

from __future__ import annotations

import asyncio

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from models.requests import (
    AnalyzeRequest,
    BaseEditRequest,
    DesignRequest,
    FollowupEditRequest,
    MutationRequest,
    StructureRequest,
)
from models.responses import (
    AnalysisResponse,
    BaseEditResponse,
    CandidateScoresResponse,
    DesignAcceptedResponse,
    FollowupAcceptedResponse,
    HealthResponse,
    MutationResponse,
    StructureResponse,
)
from config import StructureMode, settings
from pipeline.evo2_score import rescore_mutation, score_candidate
from pipeline.orchestrator import (
    DEFAULT_SEED,
    create_session_id,
    run_followup_pipeline,
    run_generation_pipeline,
)
from services.evo2 import create_evo2_service
from services.structure import predict_structure
from services.translation import find_orfs
from ws.manager import WebSocketManager

app = FastAPI(title="Helix Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ws_manager = WebSocketManager()
evo2_service = create_evo2_service()
pending_design_goals: dict[str, str] = {}
session_candidates: dict[str, dict[int, str]] = {}


@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze(request: AnalyzeRequest) -> AnalysisResponse:
    sequence = request.sequence
    scores, per_position = await score_candidate(evo2_service, sequence)
    proteins = [
        {
            "region_start": orf.start,
            "region_end": orf.end,
            "pdb_data": None,
            "sequence_identity": 0.0,
        }
        for orf in find_orfs(sequence, min_length=30)[:3]
    ]
    return AnalysisResponse(
        sequence=sequence,
        regions=[],
        scores=[{"position": x.position, "score": x.score} for x in per_position],
        proteins=proteins,
    )


@app.post("/api/design", response_model=DesignAcceptedResponse, status_code=202)
async def design(request: DesignRequest, http_request: Request) -> DesignAcceptedResponse:
    session_id = request.session_id or create_session_id()
    _set_candidate_sequence(session_id, 0, DEFAULT_SEED)
    if ws_manager.has_session(session_id):
        asyncio.create_task(
            run_generation_pipeline(
                manager=ws_manager,
                service=evo2_service,
                session_id=session_id,
                goal=request.goal,
                seed_sequence=DEFAULT_SEED,
                on_candidate_ready=lambda candidate_id, sequence: _set_candidate_sequence(
                    session_id, candidate_id, sequence
                ),
            )
        )
    else:
        pending_design_goals[session_id] = request.goal
    return DesignAcceptedResponse(
        session_id=session_id,
        ws_url=_build_ws_url(http_request, session_id),
    )


@app.post("/api/edit/base", response_model=BaseEditResponse)
async def edit_base(request: BaseEditRequest) -> BaseEditResponse:
    sequence = _require_candidate_sequence(request.session_id, request.candidate_id)
    if request.position < 0 or request.position >= len(sequence):
        raise HTTPException(status_code=422, detail="position out of range")

    updated_scores, delta = await rescore_mutation(
        evo2_service,
        sequence=sequence,
        position=request.position,
        new_base=request.new_base,
    )
    mutation = await evo2_service.score_mutation(sequence, request.position, request.new_base)
    mutated_sequence = sequence[: request.position] + request.new_base.upper() + sequence[request.position + 1 :]
    _set_candidate_sequence(request.session_id, request.candidate_id, mutated_sequence)

    return BaseEditResponse(
        position=request.position,
        reference_base=mutation.reference_base,
        new_base=request.new_base,
        delta_likelihood=delta,
        predicted_impact=mutation.predicted_impact.value,
        updated_scores=CandidateScoresResponse(
            functional=updated_scores.functional,
            tissue_specificity=updated_scores.tissue_specificity,
            off_target=updated_scores.off_target,
            novelty=updated_scores.novelty,
            combined=updated_scores.combined,
        ),
    )


@app.post("/api/edit/followup", response_model=FollowupAcceptedResponse, status_code=202)
async def edit_followup(request: FollowupEditRequest) -> FollowupAcceptedResponse:
    steps = ["intent_parse", "evo2_generation", "evo2_scoring"]
    candidate_id = request.candidate_id or 0
    base_sequence = _require_candidate_sequence(request.session_id, candidate_id)
    asyncio.create_task(
        run_followup_pipeline(
            manager=ws_manager,
            service=evo2_service,
            session_id=request.session_id,
            message=request.message,
            candidate_id=candidate_id,
            base_sequence=base_sequence,
            on_candidate_ready=lambda updated_candidate_id, sequence: _set_candidate_sequence(
                request.session_id, updated_candidate_id, sequence
            ),
        )
    )
    return FollowupAcceptedResponse(steps_rerunning=steps)


@app.post("/api/mutations", response_model=MutationResponse)
async def mutations(request: MutationRequest) -> MutationResponse:
    if request.position < 0 or request.position >= len(request.sequence):
        raise HTTPException(status_code=422, detail="position out of range")
    result = await evo2_service.score_mutation(request.sequence, request.position, request.alternate_base)
    return MutationResponse(
        position=result.position,
        reference_base=result.reference_base,
        alternate_base=result.alternate_base,
        delta_likelihood=result.delta_likelihood,
        predicted_impact=result.predicted_impact.value,
    )


@app.post("/api/structure", response_model=StructureResponse)
async def structure(request: StructureRequest) -> StructureResponse:
    sequence = request.sequence
    if request.region_start < 0 or request.region_end > len(sequence) or request.region_start >= request.region_end:
        raise HTTPException(status_code=422, detail="invalid structure region")

    if settings.structure_mode == StructureMode.ESMFOLD:
        result = await predict_structure(sequence, request.region_start, request.region_end)
        if result is not None:
            return StructureResponse(pdb_data=result.pdb_data, model=result.model, confidence=result.confidence)

    # Fallback to mock
    pdb = _mock_pdb_from_sequence(sequence[request.region_start:request.region_end])
    return StructureResponse(pdb_data=pdb, model="mock", confidence=0.71)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    payload = await evo2_service.health()
    return HealthResponse(
        status=str(payload.get("status", "unknown")),
        model=str(payload.get("model", "unknown")),
        gpu_available=bool(payload.get("gpu_available", False)),
        inference_mode=str(payload.get("inference_mode", "unknown")),
    )


@app.websocket("/ws/pipeline/{session_id}")
async def pipeline_ws(websocket: WebSocket, session_id: str) -> None:
    await ws_manager.connect(websocket, session_id)
    pending_goal = pending_design_goals.pop(session_id, None)
    if pending_goal is not None:
        await run_generation_pipeline(
            manager=ws_manager,
            service=evo2_service,
            session_id=session_id,
            goal=pending_goal,
            seed_sequence=_seed_for_session(session_id),
            on_candidate_ready=lambda candidate_id, sequence: _set_candidate_sequence(
                session_id, candidate_id, sequence
            ),
        )
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(session_id)


def _seed_for_session(session_id: str) -> str:
    return session_candidates.get(session_id, {}).get(0, DEFAULT_SEED)


def _set_candidate_sequence(session_id: str, candidate_id: int, sequence: str) -> None:
    candidates = session_candidates.setdefault(session_id, {})
    candidates[candidate_id] = sequence


def _require_candidate_sequence(session_id: str, candidate_id: int) -> str:
    candidates = session_candidates.get(session_id)
    if candidates is None:
        raise HTTPException(status_code=404, detail="session not found")
    sequence = candidates.get(candidate_id)
    if sequence is None:
        raise HTTPException(status_code=404, detail=f"candidate {candidate_id} not found")
    return sequence


def _build_ws_url(http_request: Request, session_id: str) -> str:
    ws_scheme = "wss" if http_request.url.scheme == "https" else "ws"
    host = http_request.headers.get("host") or http_request.url.netloc
    return f"{ws_scheme}://{host}/ws/pipeline/{session_id}"


def _mock_pdb_from_sequence(sequence: str) -> str:
    lines = [
        "HEADER    HELIX MOCK STRUCTURE",
        "TITLE     MOCK PDB",
        f"REMARK    LENGTH {len(sequence)}",
    ]
    for idx in range(1, min(len(sequence), 8) + 1):
        x = 7.0 + idx * 1.1
        y = 3.0 + idx * 0.8
        z = 1.0 + idx * 0.5
        lines.append(
            f"ATOM  {idx:5d}  CA  ALA A{idx:4d}    {x:8.3f}{y:8.3f}{z:8.3f}  1.00 70.00           C"
        )
    lines.append("END")
    return "\n".join(lines)

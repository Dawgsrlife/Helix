"""FastAPI entrypoint for Helix backend demo integration."""

from __future__ import annotations

import asyncio

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from models.requests import (
    AnalyzeRequest,
    AgentChatRequest,
    BaseEditRequest,
    DesignRequest,
    FollowupEditRequest,
    MutationRequest,
    StructureRequest,
)
from models.responses import (
    AnalysisResponse,
    AgentCandidateUpdateResponse,
    AgentChatResponse,
    AgentToolCallResponse,
    BaseEditResponse,
    CandidateScoresResponse,
    DesignAcceptedResponse,
    FollowupAcceptedResponse,
    HealthResponse,
    MutationResponse,
    StructureResponse,
)
from config import SessionStoreMode, StructureMode, settings
from pipeline.evo2_score import rescore_mutation, score_candidate
from pipeline.orchestrator import (
    DEFAULT_SEED,
    create_session_id,
    run_followup_pipeline,
    run_generation_pipeline,
)
from services.evo2 import create_evo2_service
from services.mock_pdb import build_mock_pdb_from_dna
from services.agentic_copilot import AgenticCopilot
from services.session_store import (
    CandidateNotFoundError,
    SessionLockTimeoutError,
    SessionNotFoundError,
    create_session_store,
)
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
session_store = create_session_store(settings, DEFAULT_SEED)
copilot = AgenticCopilot(session_store=session_store, evo2_service=evo2_service)


@app.on_event("startup")
async def _startup_checks() -> None:
    if settings.session_store_mode == SessionStoreMode.REDIS:
        redis_ok = await session_store.ping()
        if not redis_ok:
            raise RuntimeError("Redis session store is enabled but unreachable.")


@app.on_event("shutdown")
async def _shutdown_cleanup() -> None:
    await session_store.close()


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
    num_candidates = 10 if request.num_candidates is None else max(1, min(request.num_candidates, 10))
    await session_store.initialize_session(session_id)
    asyncio.create_task(
        run_generation_pipeline(
            manager=ws_manager,
            service=evo2_service,
            session_id=session_id,
            goal=request.goal,
            n_candidates=num_candidates,
            run_profile=request.run_profile,
            seed_sequence=DEFAULT_SEED,
            on_candidate_ready=lambda candidate_id, sequence: _persist_candidate_sequence(
                session_id, candidate_id, sequence
            ),
        )
    )
    return DesignAcceptedResponse(
        session_id=session_id,
        ws_url=_build_ws_url(http_request, session_id),
    )


@app.post("/api/edit/base", response_model=BaseEditResponse)
async def edit_base(request: BaseEditRequest) -> BaseEditResponse:
    try:
        async with session_store.candidate_guard(request.session_id, request.candidate_id):
            sequence = await session_store.require_candidate_sequence(request.session_id, request.candidate_id)
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
            await session_store.set_candidate_sequence(request.session_id, request.candidate_id, mutated_sequence)
    except SessionLockTimeoutError as exc:
        raise HTTPException(status_code=423, detail="candidate is busy; retry shortly") from exc
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    except CandidateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"candidate {request.candidate_id} not found") from exc

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
    try:
        async with session_store.candidate_guard(request.session_id, candidate_id):
            base_sequence = await session_store.require_candidate_sequence(request.session_id, candidate_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    except CandidateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"candidate {candidate_id} not found") from exc
    except SessionLockTimeoutError as exc:
        raise HTTPException(status_code=423, detail="candidate is busy; retry shortly") from exc

    asyncio.create_task(
        run_followup_pipeline(
            manager=ws_manager,
            service=evo2_service,
            session_id=request.session_id,
            message=request.message,
            candidate_id=candidate_id,
            base_sequence=base_sequence,
            on_candidate_ready=lambda updated_candidate_id, sequence: _persist_candidate_sequence(
                request.session_id, updated_candidate_id, sequence
            ),
        )
    )
    return FollowupAcceptedResponse(steps_rerunning=steps)


@app.post("/api/agent/chat", response_model=AgentChatResponse)
async def agent_chat(request: AgentChatRequest) -> AgentChatResponse:
    try:
        async with session_store.candidate_guard(request.session_id, request.candidate_id):
            result = await copilot.chat(
                session_id=request.session_id,
                candidate_id=request.candidate_id,
                message=request.message,
                history=request.history,
            )
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    except CandidateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"candidate {request.candidate_id} not found") from exc
    except SessionLockTimeoutError as exc:
        raise HTTPException(status_code=423, detail="candidate is busy; retry shortly") from exc

    candidate_update = None
    if result.candidate_update is not None:
        update = result.candidate_update
        candidate_update = AgentCandidateUpdateResponse(
            candidate_id=update.candidate_id,
            sequence=update.sequence,
            scores=CandidateScoresResponse(**update.scores),
            mutation=update.mutation,
            per_position_scores=update.per_position_scores,
        )

    return AgentChatResponse(
        assistant_message=result.assistant_message,
        tool_calls=[AgentToolCallResponse(**tool.to_dict()) for tool in result.tool_calls],
        candidate_update=candidate_update,
        comparison=result.comparison,
    )


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
    pdb, confidence = build_mock_pdb_from_dna(sequence[request.region_start:request.region_end], candidate_id=0)
    return StructureResponse(pdb_data=pdb, model="mock", confidence=confidence)


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
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(session_id)

def _build_ws_url(http_request: Request, session_id: str) -> str:
    ws_scheme = "wss" if http_request.url.scheme == "https" else "ws"
    host = http_request.headers.get("host") or http_request.url.netloc
    return f"{ws_scheme}://{host}/ws/pipeline/{session_id}"


async def _persist_candidate_sequence(session_id: str, candidate_id: int, sequence: str) -> None:
    async with session_store.candidate_guard(session_id, candidate_id):
        await session_store.set_candidate_sequence(session_id, candidate_id, sequence)

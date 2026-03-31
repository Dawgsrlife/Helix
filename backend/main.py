"""FastAPI entrypoint for Helix backend demo integration."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator as _AsyncIterator
from contextlib import asynccontextmanager as _acm
from typing import Any

from fastapi import FastAPI, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

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
from services.regulatory_viz import build_regulatory_map
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
from ws.events import (
    CandidateStatusData,
    CandidateStatusEvent,
    RegulatoryMapReadyData,
    RegulatoryMapReadyEvent,
    StructureReadyData,
    StructureReadyEvent,
)

logger = logging.getLogger("helix")


@_acm
async def _session_errors_to_http(candidate_id: int = 0) -> _AsyncIterator[None]:
    """Convert session store exceptions to HTTP error responses."""
    try:
        yield
    except SessionLockTimeoutError as exc:
        raise HTTPException(status_code=423, detail="candidate is busy; retry shortly") from exc
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    except CandidateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"candidate {exc.candidate_id} not found") from exc

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
SESSION_CONTEXT: dict[str, dict[str, Any]] = {}
MAX_SESSION_CONTEXT_ENTRIES = 512


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
        scores=[{"position": x.position, "score": x.score} for x in per_position],
        proteins=proteins,
    )


@app.post("/api/design", response_model=DesignAcceptedResponse, status_code=202)
async def design(request: DesignRequest, http_request: Request) -> DesignAcceptedResponse:
    session_id = request.session_id or create_session_id()
    num_candidates = request.num_candidates
    # Agent memory should only live within the active chat lifecycle for this run.
    await copilot.clear_session_memory(session_id=session_id)
    await session_store.initialize_session(session_id, user_id=request.user_id)
    _set_session_context(
        session_id,
        {
            "run_profile": request.run_profile,
            "truth_mode": request.truth_mode,
            "design_type": "regulatory_element",
        },
    )
    asyncio.create_task(
        run_generation_pipeline(
            manager=ws_manager,
            service=evo2_service,
            session_id=session_id,
            goal=request.goal,
            n_candidates=num_candidates,
            run_profile=request.run_profile,
            truth_mode=request.truth_mode,
            seed_sequence=DEFAULT_SEED,
            target_length=request.target_length,
            on_candidate_ready=lambda candidate_id, sequence: _persist_candidate_sequence(
                session_id, candidate_id, sequence
            ),
            on_spec_ready=lambda spec: _set_session_design_type(session_id, spec.design_type),
        )
    )
    return DesignAcceptedResponse(
        session_id=session_id,
        ws_url=_build_ws_url(http_request, session_id),
    )


@app.post("/api/edit/base", response_model=BaseEditResponse)
async def edit_base(request: BaseEditRequest) -> BaseEditResponse:
    async with _session_errors_to_http(request.candidate_id):
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
    async with _session_errors_to_http(candidate_id):
        async with session_store.candidate_guard(request.session_id, candidate_id):
            base_sequence = await session_store.require_candidate_sequence(request.session_id, candidate_id)

    context = SESSION_CONTEXT.get(request.session_id, {})
    asyncio.create_task(
        run_followup_pipeline(
            manager=ws_manager,
            service=evo2_service,
            session_id=request.session_id,
            message=request.message,
            candidate_id=candidate_id,
            base_sequence=base_sequence,
            run_profile=str(context.get("run_profile", "demo")),
            truth_mode=str(context.get("truth_mode", "demo_fallback")),
            design_type_hint=str(context.get("design_type", "regulatory_element")),
            on_candidate_ready=lambda updated_candidate_id, sequence: _persist_candidate_sequence(
                request.session_id, updated_candidate_id, sequence
            ),
            on_spec_ready=lambda spec: _set_session_design_type(request.session_id, spec.design_type),
        )
    )
    return FollowupAcceptedResponse(steps_rerunning=steps)


@app.post("/api/agent/chat", response_model=AgentChatResponse)
async def agent_chat(request: AgentChatRequest) -> AgentChatResponse:
    # Auto-bootstrap session when frontend sends a sequence but no real session exists
    try:
        await session_store.require_candidate_sequence(request.session_id, request.candidate_id)
    except (SessionNotFoundError, CandidateNotFoundError):
        if request.sequence:
            await session_store.set_candidate_sequence(
                request.session_id, request.candidate_id, request.sequence,
            )
        else:
            raise HTTPException(
                status_code=404,
                detail="session not found — include 'sequence' to auto-create",
            )

    async with _session_errors_to_http(request.candidate_id):
        async with session_store.candidate_guard(request.session_id, request.candidate_id):
            result = await copilot.chat(
                session_id=request.session_id,
                candidate_id=request.candidate_id,
                message=request.message,
                history=request.history,
            )

    candidate_update = None
    if result.candidate_update is not None:
        update = result.candidate_update
        design_type = str(SESSION_CONTEXT.get(request.session_id, {}).get("design_type", "regulatory_element"))
        pdb_data = update.pdb_data
        confidence = update.confidence
        structure_model = update.structure_model
        regulatory_map = update.regulatory_map
        if pdb_data is None:
            try:
                pdb_data, confidence, structure_model = await _predict_structure_snapshot(
                    sequence=update.sequence,
                    candidate_id=update.candidate_id,
                )
                update.pdb_data = pdb_data
                update.confidence = confidence
                update.structure_model = structure_model
                await ws_manager.send_event(
                    request.session_id,
                    StructureReadyEvent(
                        data=StructureReadyData(
                            candidate_id=update.candidate_id,
                            pdb_data=pdb_data,
                            confidence=confidence,
                        )
                    ).to_json(),
                )
                await ws_manager.send_event(
                    request.session_id,
                    CandidateStatusEvent(
                        data=CandidateStatusData(candidate_id=update.candidate_id, status="structured")
                    ).to_json(),
                )
            except Exception:
                logger.warning("Structure prediction failed for candidate %s", update.candidate_id, exc_info=True)
        if not _design_uses_protein_structure(design_type) and regulatory_map is None:
            try:
                regulatory_map = build_regulatory_map(update.sequence)
                update.regulatory_map = regulatory_map
                await ws_manager.send_event(
                    request.session_id,
                    RegulatoryMapReadyEvent(
                        data=RegulatoryMapReadyData(
                            candidate_id=update.candidate_id,
                            regulatory_map=regulatory_map,
                        )
                    ).to_json(),
                )
                await ws_manager.send_event(
                    request.session_id,
                    CandidateStatusEvent(
                        data=CandidateStatusData(candidate_id=update.candidate_id, status="structured")
                    ).to_json(),
                )
            except Exception:
                logger.warning("Regulatory map failed for candidate %s", update.candidate_id, exc_info=True)
        candidate_update = AgentCandidateUpdateResponse(
            candidate_id=update.candidate_id,
            sequence=update.sequence,
            scores=CandidateScoresResponse(**update.scores),
            mutation=update.mutation,
            per_position_scores=update.per_position_scores,
            pdb_data=update.pdb_data,
            confidence=update.confidence,
            structure_model=update.structure_model,
            regulatory_map=update.regulatory_map,
        )

    return AgentChatResponse(
        assistant_message=result.assistant_message,
        tool_calls=[AgentToolCallResponse(**tool.to_dict()) for tool in result.tool_calls],
        candidate_update=candidate_update,
        comparison=result.comparison,
        iterations=result.iterations,
        reasoning_steps=result.reasoning_steps,
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

    region = sequence[request.region_start:request.region_end]
    pdb_data, confidence, model = await _predict_structure_snapshot(sequence=region, candidate_id=0)
    return StructureResponse(pdb_data=pdb_data, model=model, confidence=confidence)


@app.post("/api/import")
async def import_sequence(file: UploadFile) -> dict[str, object]:
    """Import sequences from FASTA or GenBank files."""
    from services.sequence_formats import parse_fasta, parse_genbank

    if file.size is not None and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    content = (await file.read()).decode("utf-8", errors="replace")
    filename = (file.filename or "").lower()

    if filename.endswith((".gb", ".gbk", ".genbank")):
        records = parse_genbank(content)
        return {
            "format": "genbank",
            "count": len(records),
            "sequences": [
                {
                    "id": rec.locus or rec.accession or f"seq_{i}",
                    "sequence": rec.sequence,
                    "length": len(rec.sequence),
                    "organism": rec.organism,
                    "definition": rec.definition,
                    "features": [
                        {"type": f.type, "start": f.start, "end": f.end, "strand": f.strand}
                        for f in rec.features
                    ],
                }
                for i, rec in enumerate(records)
            ],
        }

    # Default: FASTA (handles .fasta, .fa, .fna, .txt, or raw)
    records = parse_fasta(content)
    return {
        "format": "fasta",
        "count": len(records),
        "sequences": [
            {
                "id": rec.header,
                "sequence": rec.sequence,
                "length": len(rec.sequence),
                "description": rec.description,
            }
            for rec in records
        ],
    }


@app.post("/api/export/fasta")
async def export_fasta_endpoint(request: Request) -> PlainTextResponse:
    """Export sequences to FASTA format."""
    from services.sequence_formats import export_fasta

    body = await request.json()
    sequences = body.get("sequences", [])
    if not sequences:
        raise HTTPException(status_code=422, detail="No sequences provided")

    fasta_text = export_fasta(sequences)
    return PlainTextResponse(
        content=fasta_text,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=helix_export.fasta"},
    )


@app.post("/api/export/genbank")
async def export_genbank_endpoint(request: Request) -> PlainTextResponse:
    """Export a sequence to GenBank format."""
    from services.sequence_formats import export_genbank

    body = await request.json()
    sequence = body.get("sequence", "")
    if not sequence:
        raise HTTPException(status_code=422, detail="No sequence provided")

    gb_text = export_genbank(
        sequence=sequence,
        locus=body.get("locus", "HELIX_SEQ"),
        definition=body.get("definition", "Helix-designed sequence"),
        organism=body.get("organism", "synthetic construct"),
        features=body.get("features"),
        scores=body.get("scores"),
    )
    return PlainTextResponse(
        content=gb_text,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=helix_export.gb"},
    )


@app.get("/api/sessions/{user_id}")
async def list_sessions(user_id: str) -> dict[str, object]:
    """List all sessions owned by a user."""
    session_ids = await session_store.list_user_sessions(user_id)
    return {"user_id": user_id, "sessions": session_ids, "count": len(session_ids)}


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


async def _predict_structure_snapshot(*, sequence: str, candidate_id: int) -> tuple[str, float, str]:
    if settings.structure_mode == StructureMode.ESMFOLD:
        result = await predict_structure(sequence)
        if result is not None:
            return result.pdb_data, result.confidence, result.model
    pdb, confidence = build_mock_pdb_from_dna(sequence, candidate_id=candidate_id)
    return pdb, confidence, "mock"


async def _set_session_design_type(session_id: str, design_type: str) -> None:
    context = SESSION_CONTEXT.setdefault(session_id, {})
    context["design_type"] = design_type


def _set_session_context(session_id: str, context: dict[str, Any]) -> None:
    # Reinsert to preserve recency ordering for bounded eviction.
    SESSION_CONTEXT.pop(session_id, None)
    SESSION_CONTEXT[session_id] = context
    while len(SESSION_CONTEXT) > MAX_SESSION_CONTEXT_ENTRIES:
        oldest_key = next(iter(SESSION_CONTEXT))
        SESSION_CONTEXT.pop(oldest_key, None)


def _design_uses_protein_structure(design_type: str | None) -> bool:
    if not design_type:
        return False
    key = design_type.lower()
    return any(token in key for token in ("coding", "protein", "peptide", "orf"))

def _build_ws_url(http_request: Request, session_id: str) -> str:
    ws_scheme = "wss" if http_request.url.scheme == "https" else "ws"
    host = http_request.headers.get("host") or http_request.url.netloc
    return f"{ws_scheme}://{host}/ws/pipeline/{session_id}"


async def _persist_candidate_sequence(session_id: str, candidate_id: int, sequence: str) -> None:
    async with session_store.candidate_guard(session_id, candidate_id):
        await session_store.set_candidate_sequence(session_id, candidate_id, sequence)

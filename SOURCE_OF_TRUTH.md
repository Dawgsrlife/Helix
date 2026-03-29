# Helix Source of Truth

Date: 2026-03-28  
Status: Canonical

## Doc Precedence

1. This file is the only canonical planning and execution source.
2. `/Users/vishnu/Documents/Helix/ARCHITECTURE.md` and `/Users/vishnu/Documents/Helix/BACKEND_ARCHITECTURE.md` are reference context only.
3. If there is conflict, code + this document win.

## One-line Product Goal

Helix is a genomic design IDE demo where a user submits a design goal, watches candidate DNA generation live, compares ranked candidates, edits bases inline, and sees immediate model feedback plus structure context.

## As-built Snapshot (2026-03-28)

### Backend

- FastAPI endpoints are live: `/api/design`, `/api/edit/base`, `/api/edit/followup`, `/api/mutations`, `/api/analyze`, `/api/structure`, `/api/health`.
- WebSocket event contract now includes:
  - `pipeline_manifest`
  - `stage_status`
  - `candidate_status`
  - `intent_parsed`
  - `retrieval_progress`
  - `generation_token`
  - `candidate_scored`
  - `structure_ready`
  - `explanation_chunk` (candidate-bound)
  - `pipeline_complete` (with requested/completed/failed counters)
- `/api/design` accepts `run_profile: "demo" | "live"` (default `demo`) and `num_candidates`.
- Generation orchestration now emits N candidate placeholders and guarantees `pipeline_complete.candidates` includes one record per requested candidate ID.
- Stage state is orchestrator-driven (`stage_status`) instead of frontend inference.
- Explanation chunks include `candidate_id`.
- Retrieval and stage flow are timeout-bounded in profile configs.

### Mock Frontend

- `/Users/vishnu/Documents/Helix/mock_frontend` is now a Vite + React app.
- Uses reducer/store single source of truth for full WS event handling.
- Silent autoplay enabled by default.
- Visual stack includes React Flow stage DAG, multi-lane DNA stream, candidate race cards, and 3Dmol structure panel.
- Scientific details are moved to collapsible drawer.

### Real Frontend

- `/Users/vishnu/Documents/Helix/frontend` remains untouched by this reset.

## Public Contracts

### `POST /api/design` request

```json
{
  "goal": "Design ...",
  "session_id": "uuid-or-custom",
  "num_candidates": 5,
  "run_profile": "demo"
}
```

### `pipeline_manifest`

```json
{
  "event": "pipeline_manifest",
  "data": {
    "session_id": "abc",
    "requested_candidates": 5,
    "candidate_ids": [0, 1, 2, 3, 4],
    "run_profile": "demo"
  }
}
```

### `stage_status`

```json
{
  "event": "stage_status",
  "data": {
    "stage": "generation",
    "status": "active",
    "progress": 0.42
  }
}
```

### `candidate_status`

```json
{
  "event": "candidate_status",
  "data": {
    "candidate_id": 3,
    "status": "failed",
    "reason": "generation_timeout"
  }
}
```

### `explanation_chunk`

```json
{
  "event": "explanation_chunk",
  "data": {
    "candidate_id": 1,
    "text": "..."
  }
}
```

### `pipeline_complete`

```json
{
  "event": "pipeline_complete",
  "data": {
    "requested_candidates": 5,
    "completed_candidates": 4,
    "failed_candidates": 1,
    "candidates": [
      {
        "id": 0,
        "status": "structured",
        "sequence": "...",
        "scores": { "functional": 0.8, "combined": 0.69 },
        "pdb_data": "...",
        "confidence": 0.73,
        "error": null
      }
    ]
  }
}
```

## Current Gaps

1. Full backend suite has not yet been re-run after contract expansion; focused contract slices are green.
2. Mock frontend reducer is tested, but no browser-level E2E yet for no-click autoplay completion.
3. Live AlphaFold-quality rendering is still constrained by structure runtime; demo profile uses accelerated fallback behavior.

## Acceptance Checklist

- Backend contract tests pass for new WS events and `run_profile`.
- Stage transitions never regress (`pending -> active -> done|failed`).
- Requesting 5 candidates yields 5 terminal records in `pipeline_complete`.
- Explanation chunks are candidate-bound.
- Mock frontend starts silent autoplay by default and reaches `pipeline_complete` without manual input.
- Inline base edit round-trip updates active candidate and score panel.
- Real frontend remains untouched.

## Runbook

### Backend

```bash
cd /Users/vishnu/Documents/Helix/backend
source .venv/bin/activate
redis-server
uvicorn main:app --reload --port 8000
```

### Mock Frontend

```bash
cd /Users/vishnu/Documents/Helix/mock_frontend
npm install
npm run dev
```

### Focused Verification

```bash
cd /Users/vishnu/Documents/Helix/backend
source .venv/bin/activate
pytest -q tests/test_ws_manager.py tests/test_ws_events.py tests/test_orchestrator.py tests/test_pipeline_e2e_contract.py tests/test_main_api.py tests/test_api_validation_matrix.py
```

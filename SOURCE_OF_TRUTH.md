# Helix SOURCE OF TRUTH

This is the canonical project state document.

It reconciles:

- target architecture (`ARCHITECTURE.md`, `BACKEND_ARCHITECTURE.md`)
- current code reality (backend + frontend)
- verified runtime/test status
- concrete next build steps

If anything conflicts, **this file + code wins**.

---

## 1) One-line goal

Build a demo-ready genomic IDE where a researcher submits a design goal, sees pipeline progress stream live, edits sequence bases, and gets immediate re-scoring + structure context.

---

## 2) Current status snapshot (as-built)

### Overall

- Backend is runnable and tested.
- Frontend currently uses non-streaming analysis endpoints (`/api/analyze`, `/api/mutations`, `/api/structure`).
- Streaming pipeline (`/api/design` + websocket events) exists backend-side but is **not yet consumed** by frontend UI.

### Verified

- Backend tests: **85 passed** (`pytest -q` in `backend/`)
- Core architecture pieces now implemented:
  - `backend/main.py`
  - `backend/ws/events.py`
  - `backend/ws/manager.py`
  - `backend/pipeline/orchestrator.py`

---

## 3) Architecture: target vs current

## 3.1 Target (hackathon demo path)

Researcher → Frontend chat → `POST /api/design` → intent/retrieval/generation/scoring/structure/explanation → websocket stream → live frontend panels (chat/cards/genome/structure) → edits loop back (`/api/edit/base`, `/api/edit/followup`).

## 3.2 Current as-built path

### Path A (implemented and used)

Frontend Analyze page:

- `POST /api/analyze` for per-position scores + ORF-derived protein regions
- `POST /api/mutations` for mutation effect
- `POST /api/structure` for structure mock PDB

### Path B (implemented but not yet used by frontend)

Backend streaming path:

- `POST /api/design` returns session + WS URL
- `WS /ws/pipeline/{session_id}` emits:
  - `intent_parsed`
  - `retrieval_progress`
  - `generation_token`
  - `candidate_scored`
  - `structure_ready`
  - `explanation_chunk`
  - `pipeline_complete`

---

## 4) Module map (big picture + code-level wiring)

## 4.1 Backend modules

### `backend/config.py`

Purpose:

- Environment-driven settings model.

Current reality:

- Fixed merge-conflict residue and initialization ordering.
- Includes:
  - `evo2_mode` (mock/local/nim_api)
  - `structure_mode`
  - intent keys/settings
  - infra settings (`redis_url`, `celery_broker`, etc.)

Gaps:

- Celery/Redis values are configured but not yet active in runtime flow.

---

### `backend/models/domain.py`

Purpose:

- Domain source-of-truth types (`ForwardResult`, `MutationScore`, `CandidateScores`, etc.).

Current reality:

- Added serialization helpers:
  - `CandidateScores.to_dict()`
  - `CandidateScores.to_ws_event()`
  - `ForwardResult.to_dict()`
  - `ForwardResult.to_ws_event()`
- Added safe defaults for pydantic list fields (`Field(default_factory=list)`).

Why this matters:

- Strong serialization boundary prevents integration mismatches between scoring code and websocket payloads.

---

### `backend/services/evo2.py`

Purpose:

- Evo2 abstraction with `Mock`, `Local`, and `NIM` implementations.

Current reality:

- Active by default in mock mode.
- Handles:
  - forward pass logits
  - full-sequence score
  - mutation scoring
  - token generation
- Empty-sequence behavior stabilized (score = `0.0` instead of NaN/warnings path).

Why this matters:

- Keeps downstream pipeline code backend-agnostic while allowing local/NIM swap later.

---

### `backend/pipeline/evo2_score.py`

Purpose:

- 4D candidate scoring + mutation rescoring (`rescore_mutation`).

Current reality:

- Fully integrated in:
  - `/api/analyze`
  - `/api/edit/base`
  - orchestrator candidate scoring events

Important note:

- Scoring is intentionally heuristic/mock-grade for demo process velocity.

---

### `backend/pipeline/intent_parser.py`

Purpose:

- Parse NL goals/followups into `DesignSpec`.

Current reality:

- Uses heuristic parser by default.
- Optional Gemini path exists but is gated and disabled by default (`intent_allow_live_calls = False`).

Why this matters:

- Prevents runtime hangs and external-call fragility in demo mode.

---

### `backend/ws/events.py`

Purpose:

- Typed websocket event contracts with `to_json()`.

Current reality:

- Implements all expected event families:
  - intent, retrieval, token, score, structure, explanation, complete.

---

### `backend/ws/manager.py`

Purpose:

- Session websocket lifecycle + event delivery.

Current reality:

- `connect`, `disconnect`, `send_event`, `has_session`
- event queue for sessions not connected yet (`_pending_events`) + flush on connect.

Why this matters:

- Solves race: `/api/design` called before WS connection is established.

---

### `backend/pipeline/orchestrator.py`

Purpose:

- In-process async orchestration of generation and followup flows.

Current reality:

- `run_generation_pipeline()` streams all major event types.
- `run_followup_pipeline()` handles partial rerun path and emits completion.
- Uses existing scoring pipeline (`score_candidate`).
- Retrieval/structure/explanation still mocked.

---

### `backend/main.py`

Purpose:

- FastAPI runtime entrypoint and endpoint wiring.

Current reality:

- Implemented endpoints:
  - `POST /api/analyze`
  - `POST /api/design` (202 + ws url)
  - `POST /api/edit/base`
  - `POST /api/edit/followup` (202)
  - `POST /api/mutations`
  - `POST /api/structure`
  - `GET /api/health`
  - `WS /ws/pipeline/{session_id}`
- Design requests are queued in-memory if websocket not connected yet (`pending_design_goals`), then executed once WS connects.

Known limitations:

- In-memory state only (not durable).
- `/api/edit/base` currently rescoring against a default sequence, not session-stored candidate state.

---

## 4.2 Frontend modules

### `frontend/lib/api.ts`

Current reality:

- Calls:
  - `/api/analyze`
  - `/api/mutations`
  - `/api/structure`
- No websocket client and no `/api/design` usage yet.

Impact:

- Demo currently shows analysis + mutation + structure interactions, not full live pipeline stream.

---

### `frontend/hooks/useSequenceAnalysis.ts`, `useMutationSim.ts`

Current reality:

- Drive current Analyze UX via non-streaming HTTP calls.

---

### `frontend/app/analyze/page.tsx`

Current reality:

- Renders sequence annotation/likelihood + mutation panel + structure panel.
- Not yet wired to streaming design mode/session events.

---

## 5) API contract status matrix

| Contract | Status | Evidence |
|---|---|---|
| `POST /api/design` | Implemented | `backend/main.py` |
| `WS /ws/pipeline/{session_id}` | Implemented | `backend/main.py`, `backend/ws/*` |
| `intent_parsed` event | Implemented | `orchestrator.py`, `events.py`, `test_ws_events.py` |
| `retrieval_progress` event | Implemented (mock result) | `orchestrator.py` |
| `generation_token` event | Implemented | `orchestrator.py` |
| `candidate_scored` event | Implemented | `orchestrator.py` + `CandidateScores.to_dict()` |
| `structure_ready` event | Implemented (mock PDB) | `orchestrator.py` |
| `explanation_chunk` event | Implemented (mock chunks) | `orchestrator.py` |
| `pipeline_complete` event | Implemented | `orchestrator.py` |
| `POST /api/edit/base` | Implemented | `main.py` |
| `POST /api/edit/followup` | Implemented | `main.py` |
| `POST /api/mutations` | Implemented | `main.py` |
| `POST /api/structure` | Implemented (mock) | `main.py` |
| `GET /api/health` | Implemented | `main.py` |

---

## 6) Testing and proof

### New integration coverage added

- `backend/tests/test_main_api.py`
- `backend/tests/test_orchestrator.py`
- `backend/tests/test_ws_events.py`
- `backend/tests/test_ws_manager.py`

### Existing coverage retained

- Evo2 service tests
- scoring tests
- translation tests

### Current result

- `pytest -q` → **85 passed**

---

## 7) What is right now

- Correct direction: backend is no longer “just a library”; streaming infrastructure exists.
- Correct priority shift: from architecture polish to runnable vertical slice.
- Correct process for hackathon: mocked biology is acceptable; integration velocity is priority.

---

## 8) What is still wrong / incomplete

1. Frontend is not yet consuming websocket pipeline events.
2. Candidate/session state is not persisted (in-memory only).
3. `edit/base` does not yet operate on actual session candidate sequence history.
4. Celery/Redis orchestration path is not wired (still in-process async).
5. Retrieval + explanation + structure services are mostly mocked, not production-grade.
6. `services/alphafold.py` does not exist yet (mock PDB in endpoint/orchestrator).
7. Some architecture docs discuss components not implemented yet (need explicit “target vs as-built” labeling everywhere).

---

## 9) Convergence plan (single-track execution)

## P0 (demo unblock, immediate)

1. Add frontend websocket client + event reducer for design session.
2. Add UI mode that submits to `/api/design`, connects to `ws://.../ws/pipeline/{session_id}`, and renders live event stream.
3. Mark all mock-derived scores/structure as `MOCK` in UI.

## P1 (consistency + correctness)

4. Persist session candidates by `session_id` in backend (Redis or in-memory session store abstraction).
5. Update `/api/edit/base` to use stored candidate sequence by `session_id` + `candidate_id`.
6. Ensure followup reruns update the same session candidate timeline.

## P2 (architecture alignment)

7. Replace in-process orchestrator triggering with Celery + Redis queue/pubsub while preserving current event contract.
8. Keep `ws/events.py` as schema authority to avoid frontend/backend drift.

## P3 (wow completeness)

9. Implement `services/alphafold.py` wrapper with fallback strategy.
10. Replace mock retrieval/explanation progressively with real services behind same event APIs.

---

## 10) Visual: single canonical as-built flow

```mermaid
flowchart TD
    USER[Researcher]
    USER --> FE[Frontend Analyze UI]
    FE -->|POST /api/analyze| ANALYZE[main.py analyze]
    FE -->|POST /api/mutations| MUT[main.py mutations]
    FE -->|POST /api/structure| STR[main.py structure]

    FE -. planned .->|POST /api/design| DESIGN[main.py design]
    DESIGN --> WS[WS /ws/pipeline/{session_id}]
    WS --> ORCH[orchestrator.run_generation_pipeline]
    ORCH --> SCORE[pipeline.evo2_score score_candidate]
    ORCH --> EVO[services.evo2 Evo2MockService]
    ORCH --> EV[ws/events + ws/manager]
    EV --> FE
```

---

## 11) Rule for future changes

Every architecture/doc update must include:

1. **As-built section** (what exists in code now).
2. **Target section** (what is intended next).
3. **Gap list** (explicit missing pieces).
4. A corresponding test or verification command.

No exceptions.

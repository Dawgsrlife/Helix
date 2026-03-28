# Helix: Source of Truth

This is the canonical project state document. If anything conflicts between docs and code, **this file + code wins**.

It reconciles `ARCHITECTURE.md` (target design), `BACKEND_ARCHITECTURE.md` (original backend spec), and the actual codebase.

---

## 1. One-line goal

Build a demo-ready genomic IDE where a researcher submits a design goal, watches the pipeline stream live, edits sequence bases, and gets immediate re-scoring with structural context.

---

## 2. Current status snapshot

### Backend (Vishnu)

- Runnable and tested: **85 tests passing** (`pytest -q` in `backend/`).
- All REST endpoints implemented: `/api/design`, `/api/analyze`, `/api/edit/base`, `/api/edit/followup`, `/api/mutations`, `/api/structure`, `/api/health`.
- WebSocket streaming infrastructure built: `ws/events.py` (typed event contracts), `ws/manager.py` (session lifecycle with pending-event queue).
- Orchestrator runs generation and followup pipelines in-process async (Celery/Redis wiring exists in config but is not the active runtime path).
- Evo2 service operates in mock mode by default. Supports mock, local, and NIM API backends.
- Intent parser uses heuristic fallback by default. Optional Gemini path exists but is gated off (`intent_allow_live_calls = False`).
- Parallel retrieval coordinator built. NCBI, PubMed, ClinVar services implemented.
- Structure prediction returns mock PDB (no `services/alphafold.py` wrapper yet).

### Frontend (Alex)

- Three parallel agents completed their work. All components rebuilt to demo quality.
- **Agent 1 (Landing + Shell)**: Obsidian design system in globals.css, GSAP timeline landing page, editorial layout, Inter + JetBrains Mono fonts via next/font.
- **Agent 2 (Genome Browser)**: Canvas-based likelihood graph (handles 10k+ positions), GSAP stagger reveal, muted base colors, Notion-style sequence input with examples.
- **Agent 3 (Right Panel)**: Spring-animated mutation results, pLDDT protein viewer with sample PDB, Lucide icon controls, ShadCN Badge + Tooltip.
- Build passes cleanly. Crash fix applied (removed HDR Environment preset from Three.js).
- Frontend currently uses non-streaming endpoints (`/api/analyze`, `/api/mutations`, `/api/structure`).
- Streaming pipeline (`/api/design` + WebSocket events) exists backend-side but is **not yet consumed** by frontend.

### Integration

- Frontend and backend are independently functional but not yet connected via WebSocket streaming.
- Mock data fallbacks in frontend hooks ensure demo works without a running backend.

---

## 3. Architecture: target vs current

### 3.1 Target (hackathon demo path)

Researcher types goal in Chat panel. Frontend sends `POST /api/design`. Backend streams intent, retrieval, generation, scoring, structure, explanation events via WebSocket. Frontend renders each event progressively. Researcher edits bases (instant re-score) or types follow-ups (partial re-run).

### 3.2 Current as-built path

**Path A (implemented, actively used by frontend):**
- `POST /api/analyze` for per-position scores + ORF-derived protein regions
- `POST /api/mutations` for mutation effect prediction
- `POST /api/structure` for structure mock PDB
- Frontend hooks fall back to mock data when backend is unreachable

**Path B (implemented in backend, not yet consumed by frontend):**
- `POST /api/design` returns session ID + WebSocket URL
- `WS /ws/pipeline/{session_id}` emits: `intent_parsed`, `retrieval_progress`, `generation_token`, `candidate_scored`, `structure_ready`, `explanation_chunk`, `pipeline_complete`

---

## 4. Module map

### 4.1 Backend modules (verified)

| Module | Purpose | Status | Notes |
|--------|---------|--------|-------|
| `config.py` | Environment-driven settings (evo2_mode, structure_mode, intent keys) | Working | Celery/Redis configured but not active at runtime |
| `models/domain.py` | Domain types with serialization helpers (`to_dict()`, `to_ws_event()`) | Working | Strong serialization boundary prevents integration drift |
| `services/evo2.py` | Evo2 abstraction: Mock, Local, NIM implementations | Working (mock) | Empty-sequence edge case handled |
| `services/translation.py` | DNA to protein, ORF finding, codon table | Working | |
| `services/ncbi.py` | NCBI gene info retrieval | Working | 10 req/sec rate limit with API key |
| `services/pubmed.py` | PubMed literature search | Working | |
| `services/clinvar.py` | ClinVar pathogenic variant lookup | Working | |
| `pipeline/evo2_score.py` | 4D candidate scoring + mutation rescoring | Working | Heuristic/mock-grade for demo velocity |
| `pipeline/intent_parser.py` | NL goal to DesignSpec (heuristic default, Gemini optional) | Working | |
| `pipeline/retrieval.py` | Parallel retrieval coordinator | Working | |
| `pipeline/orchestrator.py` | Async generation + followup pipelines | Working | In-process, not Celery-dispatched |
| `ws/events.py` | Typed WebSocket event contracts | Working | |
| `ws/manager.py` | Session lifecycle + pending-event queue | Working | Solves POST-before-WS race condition |
| `main.py` | FastAPI entrypoint, all endpoints | Working | In-memory state only |
| `services/alphafold.py` | AlphaFold/ColabFold wrapper | **Not built** | Mock PDB returned from endpoint directly |

### 4.2 Frontend modules (verified)

| Module | Purpose | Status | Notes |
|--------|---------|--------|-------|
| `app/page.tsx` | Landing page with GSAP timeline | Rebuilt | Obsidian design system |
| `app/layout.tsx` | Root layout with Inter + JetBrains Mono | Rebuilt | |
| `app/analyze/page.tsx` | Main IDE workspace, wires all panels | **Needs update** | Still uses old imports/layout |
| `components/layout/AppShell.tsx` | IDE chrome with HELIX wordmark | Rebuilt | |
| `components/sequence/*` | SequenceViewer, BaseToken, SequenceInput, RegionHighlight | Rebuilt | Canvas likelihood graph, GSAP stagger |
| `components/annotation/*` | AnnotationTrack, AnnotationLegend, LikelihoodGraph | Rebuilt | |
| `components/mutation/*` | MutationPanel, MutationDiff | Rebuilt | Spring animations, mock fallback |
| `components/structure/*` | ProteinViewer, StructureControls | Rebuilt | pLDDT coloring, sample PDB, crash fix applied |
| `components/ui/*` | Button, Badge, Tooltip, LoadingState | Working | ShadCN components |
| `hooks/useSequenceAnalysis.ts` | Analysis request lifecycle | Working | Non-streaming |
| `hooks/useAnnotations.ts` | Derive regions + bases from result | Working | |
| `hooks/useMutationSim.ts` | Mutation prediction with mock fallback | Working | |
| `lib/api.ts` | Fetch wrappers, domain type mapping | Working | No WebSocket client yet |

---

## 5. API contract status

| Contract | Backend | Frontend | Integration |
|----------|---------|----------|-------------|
| `POST /api/analyze` | Implemented | Consumed | Working |
| `POST /api/mutations` | Implemented | Consumed | Working |
| `POST /api/structure` | Implemented (mock) | Consumed | Working |
| `GET /api/health` | Implemented | Not consumed | - |
| `POST /api/design` | Implemented | **Not consumed** | Gap |
| `WS /ws/pipeline/{session_id}` | Implemented | **Not consumed** | Gap |
| `POST /api/edit/base` | Implemented | **Not consumed** | Gap |
| `POST /api/edit/followup` | Implemented | **Not consumed** | Gap |

---

## 6. What is right

- Backend is no longer just a library. Streaming infrastructure exists and is tested.
- Frontend components are rebuilt to demo quality with the Obsidian design system.
- Mock data fallbacks mean the frontend demo works standalone.
- Correct hackathon priority: mocked biology is acceptable; integration velocity matters.

## 7. What is still wrong or incomplete

1. **Frontend does not consume WebSocket pipeline events.** This is the primary integration gap.
2. **`analyze/page.tsx` needs rewiring** to use the new Obsidian-styled components from all three agents.
3. **Zustand store not yet created** for shared pipeline state (selected candidate, session ID, pipeline status).
4. **Candidate/session state is in-memory only** in the backend (not persisted across restarts).
5. **`/api/edit/base` operates on a default sequence**, not the actual session candidate.
6. **`services/alphafold.py` does not exist.** Mock PDB is returned directly from endpoints.
7. **Dat could not attend.** His modules (intent parser, explanation layer) run on heuristic/mock. No one is actively owning the ML/prompt layer.

---

## 8. Convergence plan

### P0: Demo unblock (immediate)

1. Wire `analyze/page.tsx` with all rebuilt agent components.
2. Add Zustand store for shared state (selected position, active candidate, pipeline status).
3. Ensure the non-streaming demo path works end-to-end with mock data.

### P1: Streaming integration

4. Add WebSocket client hook (`useDesignPipeline`) that connects to `ws://host/ws/pipeline/{session_id}`.
5. Build event reducer that updates Zustand store as events arrive.
6. Add Chat panel UI that triggers `/api/design` and renders streaming events.

### P2: Edit loop

7. Wire base pair click in Genome Browser to `POST /api/edit/base`.
8. Wire Chat input to `POST /api/edit/followup`.
9. Persist session candidates by `session_id` in backend.

### P3: Polish

10. Implement `services/alphafold.py` with ColabFold fallback.
11. Replace mock retrieval/explanation with real services where time permits.
12. Demo rehearsal, video recording, Devpost submission.

---

## 9. Team

| Person | Role | Constraint |
|--------|------|-----------|
| Alex | Frontend, 3 parallel Claude agents | Leaves before closing ceremony |
| Vishnu | Backend orchestration, Evo2, pipeline | Leaves before closing ceremony |
| Henry | Fullstack glue, demo, pitch | Flies out Sunday 5am |
| TBD | 4th teammate | Recruiting at YHack |

**Critical**: At least one person must be physically present for Sunday judging. This is a hard rule.

---

## 10. Rule for future changes

Every architecture or doc update must include:
1. An **as-built** section (what exists in code now).
2. A **target** section (what is intended next).
3. A **gap list** (explicit missing pieces).
4. A corresponding test or verification command.

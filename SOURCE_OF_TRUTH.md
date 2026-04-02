# Helix Source of Truth

Date: 2026-04-01
Status: Canonical — Post-Audit

## Doc Precedence

1. This file is the only canonical planning and execution source.
2. `/Users/vishnu/Documents/Helix/ARCHITECTURE.md` and `/Users/vishnu/Documents/Helix/BACKEND_ARCHITECTURE.md` are reference context only.
3. If there is conflict, code + this document win.

## One-line Product Goal

Helix is a free, open-source genomic design IDE where researchers submit a design goal, watch candidate DNA generation live, compare ranked candidates, edit bases inline, and get real-time AI feedback plus protein structure context.

## Post-Hackathon Status (2026-04-01)

Won 2nd place in the AI Agents track at YHack (March 28-29, 2026). Codebase audited 2026-04-01. **Verdict: Strong demo quality, not yet production-ready for real biotech/clinical use.** 5 critical gaps identified — see Known Issues and Phases 5-9 below.

### What's Real
- NCBI, PubMed, ClinVar integrations (live API calls with retry/rate-limiting)
- WebSocket streaming pipeline (intent → retrieval → generation → scoring → structure → explanation)
- Evo2 service abstraction (mock, local 7B, NVIDIA NIM 40B)
- Translation service (codon table, ORF finding, GC content — pure computation)
- 4D scoring logic (functional, tissue specificity, off-target, novelty)
- Session management (in-memory dev, Redis production)
- Frontend workspace (Next.js 16, sequence viewer, 3D structure, leaderboard, chat)
- 765 backend tests passing (389 core + 82 hardened e2e + 80 codon optimization + 50 variant annotation + 64 off-target + 38 cross-phase integration + 44 Phase 5 tools + 18 hill-climb optimizer)

### What's Mocked / Faked
- **Structure prediction** defaults to MOCK but ESMFold API (`api.esmatlas.com`) is verified live. Set `STRUCTURE_MODE=esmfold` for real protein folding.
- **Evo2 inference** defaults to MOCK (Markov chain + heuristics). Real local/NIM modes exist but are not the default path.
- **Explanation layer** supports Gemini and Claude streaming. Without API keys, generates score-based summaries from actual candidate data.
- **Agent chat** uses LangGraph (plan→execute→reflect→respond) with Claude tool_use, Gemini, and deterministic planning. Memory persists in Redis.
- **Frontend API layer** has mock fallbacks for every endpoint (works without backend).

### Known Critical Issues (2026-04-01 Audit)
- ~~**C-1: Agent tool set too narrow**~~ — **Resolved.** Expanded from 6 to 11 tools: added codon_optimize, offtarget_scan, insert_bases, delete_bases, restriction_sites.
- ~~**C-2: Optimizer is brute-force single-base**~~ — **Resolved.** Replaced with multi-round hill-climbing (5 rounds, 16 positions/round, early convergence).
- **C-3: All scoring is heuristic** — Every scorer in `evo2_score.py` is hand-tuned math. In mock mode (default), forward pass is `np.random.normal` — scores are deterministic noise.
- **C-4: NIM service uses mock logits for scoring** — `Evo2NIMService.forward()` returns `_mock_logits()` for per-position data. Only generation is real.
- **C-5: No inline sequence editor** — Users can only edit via single-base API call. No drag-select, no inline typing.
- **C-6: No frontend for experiment tracking / import-export / codon opt / variant annotation** — Backend services exist but are not wired to UI.
- **C-7: Zero frontend tests** — No Jest, no Playwright, no Cypress.
- **C-8: Off-target analysis is local-only** — Reference panels are hardcoded short consensus fragments. Real BLAST is stubbed.

---

## Roadmap: Hackathon → Production

Priority order. Each item is a self-contained PR. Do one at a time.

### Phase 1: Code Quality & Foundation
- [x] **1.1 Refactor orchestrator DRY violations** — Extract scoring, structure prediction, and event emission into reusable helpers. The orchestrator is the core of the pipeline and currently unmaintainable.
- [x] **1.2 README + .env.example** — Write a real README for open-source. Include setup instructions, architecture overview, screenshots.
- [x] **1.3 Dockerfile + docker-compose** — Backend, Redis, and frontend in containers. Anyone should be able to `docker compose up`.
- [x] **1.4 CI pipeline** — GitHub Actions: lint, type-check, test on every PR.

### Phase 2: Real Integrations
- [x] **2.1 Real structure prediction** — ESMFold API (api.esmatlas.com) is live and verified. Structure service hardened with retry logic. Set `STRUCTURE_MODE=esmfold` for real folding.
- [x] **2.2 Real explanation layer** — Supports Gemini and Claude streaming. Score-based fallback generates useful summaries from actual candidate scores instead of hardcoded strings. 10 new tests.
- [x] **2.3 Real agent loop** — Refactored 1142-line monolith into 7 modules under `services/agent/`. Added Claude native `tool_use` for planning, Redis-backed persistent memory, and 55 dedicated unit tests.

### Phase 3: Scale & Polish
- [x] **3.1 Sequence length scaling** — Support gene-length sequences up to 100k bp. Added `target_length` to design requests, dynamic timeout/worker scaling, token batching for sequences >5k (200-token `generation_batch` events + `generation_progress`), per-position score downsampling for sequences >10k (capped at 2k points), faster mock generation for long sequences. 38 new tests.
- [x] **3.2 FASTA/GenBank import/export** — Pure-Python FASTA/GenBank parsers and exporters (no BioPython). Three new endpoints: `POST /api/import` (file upload), `POST /api/export/fasta`, `POST /api/export/genbank`. 34 new tests.
- [x] **3.3 Multi-user sessions** — Session ownership via `user_id` on `DesignRequest`. `GET /api/sessions/{user_id}` endpoint. Both MemorySessionStore and RedisSessionStore track owners and user→session mappings. 15 new tests.
- [x] **3.4 Frontend polish** — React ErrorBoundary wrapping root layout and each view. Skeleton loader components. Responsive sidebar (hidden on mobile, toggle via hamburger menu, backdrop overlay). Side panels hidden on mobile (structure inspector, explorer inspector, IDE panel). Header tab bar hidden on small screens. ARIA labels on all icon buttons, nav items (`aria-current`), chat panel, pipeline progress bar (`role="progressbar"`), leaderboard. `aria-live` on pipeline status and chat messages. Skip-to-content link. Focus-visible ring styles. `prefers-reduced-motion` media query disables all animations. Responsive padding on leaderboard.
- [x] **3.5 Hardening & code quality** — DRY: extracted `_session_errors_to_http` async context manager (3 duplicate try/except blocks → 1). Fixed silent `except Exception: pass` → `logger.warning` with traceback. Fixed fire-and-forget `clear_session_memory` → proper `await`. Added Pydantic `Field(ge=1, le=10)` validation on `num_candidates` (replaces manual clamping). Removed dead `regions=[]` from analyze response. 82 hardened e2e tests with real genomic sequences (BRCA1, Huntington-like CAG repeats, all-T, high-GC, promoter-like), exact computed assertions, edge cases across translation, scoring, FASTA/GenBank, sessions, and API contracts.

### Phase 4: Research-Grade Features
- [x] **4.1 Variant annotation** — `POST /api/variants`. ClinVar integration: fetches pathogenic variants for a gene, parses HGVS nomenclature to map to sequence positions, provides clinical significance, review stars, condition data. Supports region filtering. 29 tests.
- [x] **4.2 Codon optimization** — `POST /api/optimize/codons`. Organism-specific codon usage optimisation (human, E. coli, yeast, mouse, fruit fly). Preserves amino acids and DNA motifs, reports CAI and GC content changes. 51 tests.
- [x] **4.3 Off-target analysis** — `POST /api/offtarget`. Fast local k-mer scan against reference genomic elements (Alu, LINE-1, oncogene hotspots, regulatory elements). GC balance risk, repeat fraction detection. Async NCBI BLAST wrapper. 64 tests.
- [x] **4.4 Experiment tracking** — `POST /api/experiments/record`, `GET /api/experiments/{session_id}`, `GET /api/experiments/{session_id}/{version_id}`, `POST /api/experiments/revert`, `POST /api/experiments/diff`, `GET /api/experiments/{session_id}/{version_id}/lineage`. Versions every design iteration with parent→child lineage, position-level diffs, one-click revert. Auto-records on base edits and agent mutations. 50 tests.

### Phase 5: Agent Tool Expansion 🟡
- [x] **5.1 Insert/delete base tools** — `insert_bases(position, bases)` and `delete_bases(start, end)` tools added to agent. 15 tests.
- [x] **5.2 Wire codon optimization as agent tool** — `tool_codon_optimize(organism)` calls existing `codon_optimization.optimize_codons()`, preserves amino acids, updates session store. 8 tests.
- [x] **5.3 Wire off-target scan as agent tool** — `tool_offtarget_scan(k)` calls existing `offtarget.scan_offtargets()`, returns risk summary. 4 tests.
- [x] **5.4 Find restriction sites tool** — Searches 20 common restriction enzymes, returns positions. 7 tests.
- [x] **5.5 Multi-step optimization** — Replaced brute-force single-shot (≤48 random variants) with multi-round hill-climbing: samples 16 positions/round, evaluates 3 alternatives each, applies best-improving mutation, repeats up to 5 rounds with early convergence. 18 tests.
- [ ] **5.6 Agent streaming** — Stream tool execution and response via WebSocket instead of blocking HTTP.

### Phase 6: Real Biology Integration ⬜
- [ ] **6.1 Calibrate scoring pipeline** — Replace heuristic scorers with calibrated models or ML classifiers. Add confidence intervals.
- [ ] **6.2 Fix NIM service scoring** — Use a different NIM endpoint that returns per-position log-likelihoods, or proxy through a scoring-specific API.
- [ ] **6.3 Real BLAST integration** — Wire NCBI BLAST for off-target via E-utilities (submission + polling + parsing).
- [ ] **6.4 Primer3 integration** — Add primer design service and API endpoint.

### Phase 7: Frontend Feature Parity ⬜
- [ ] **7.1 Inline sequence editor** — Click-to-edit bases, drag-select regions, keyboard shortcuts.
- [ ] **7.2 FASTA/GenBank import/export UI** — File upload component + download buttons.
- [ ] **7.3 Experiment history panel** — Browse versions, view diffs, one-click revert in the UI.
- [ ] **7.4 Variant annotation browser** — Display ClinVar data overlaid on sequence.
- [ ] **7.5 Codon optimization UI** — Organism selector, before/after comparison.
- [ ] **7.6 Alignment viewer** — Side-by-side candidate comparison.

### Phase 8: Frontend Quality ⬜
- [ ] **8.1 Component tests** — Jest + React Testing Library for all components.
- [ ] **8.2 E2E browser tests** — Playwright for critical user flows.
- [ ] **8.3 Accessibility audit** — Full WCAG 2.1 AA compliance.
- [ ] **8.4 Performance profiling** — Large sequence rendering (>10k bp).

### Phase 9: Production Hardening 🟡
- [x] **9.1 FastAPI lifespan migration** — Replaced `@app.on_event` with `lifespan` context manager. Eliminates deprecation warnings.
- [ ] **9.2 API authentication** — JWT/OAuth for public endpoints.
- [ ] **9.3 Rate limiting** — Per-IP and per-user rate limits.
- [ ] **9.4 OpenTelemetry** — Distributed tracing.
- [ ] **9.5 Database migration** — Move from Redis-only to proper persistence (PostgreSQL + SQLAlchemy).

---

## As-built Snapshot (2026-04-02)

### Backend

- FastAPI endpoints: `/api/design`, `/api/edit/base`, `/api/edit/followup`, `/api/agent/chat`, `/api/mutations`, `/api/analyze`, `/api/structure`, `/api/health`, `/api/import`, `/api/export/fasta`, `/api/export/genbank`, `/api/sessions/{user_id}`, `/api/variants`, `/api/optimize/codons`, `/api/offtarget`, `/api/experiments/record`, `/api/experiments/{session_id}`, `/api/experiments/{session_id}/{version_id}`, `/api/experiments/revert`, `/api/experiments/diff`, `/api/experiments/{session_id}/{version_id}/lineage`.
- WebSocket event contract: `pipeline_manifest`, `stage_status`, `candidate_status`, `candidate_seed`, `intent_parsed`, `retrieval_progress`, `generation_token`, `generation_batch`, `generation_progress`, `candidate_scored`, `structure_ready`, `regulatory_map_ready`, `explanation_chunk`, `pipeline_complete`.
- `/api/design` accepts `run_profile: "demo" | "live"`, `truth_mode`, and `num_candidates`.
- Generation orchestration emits N candidate placeholders and guarantees `pipeline_complete.candidates` includes one record per requested candidate ID.
- Stage state is orchestrator-driven (`stage_status`) instead of frontend inference.
- Retrieval and stage flow are timeout-bounded in profile configs.
- Candidate scoring events include per-position likelihoods for sequence heatmap rendering.
- Generation and scoring degrade to deterministic fallback instead of dropping candidates.
- Structure fallback emits richer synthetic PDB backbones (hundreds of atoms).
- `agent/chat` endpoint runs 11 tool-style actions: explain, edit_base, optimize (hill-climbing), compare, transform, restore, codon_optimize, offtarget_scan, insert_bases, delete_bases, restriction_sites.
- Agent optimizer uses multi-round hill-climbing (up to 5 rounds, 16 positions/round, early convergence).
- FastAPI v0.2.0 — uses modern `lifespan` context manager (no deprecated `on_event`).

### Frontend

- Next.js 16 + TypeScript + React 19 workspace at `/frontend`.
- Zustand store is single source of truth for all state.
- Components: SequenceViewer, ProteinViewer (Three.js), CandidateLeaderboard, ChatPanel, PipelineStatus, AnnotationTrack, LikelihoodGraph.
- WebSocket event handling via `useDesignPipeline` hook.
- Mock fallbacks in all hooks for backend-independent development.

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

### `POST /api/agent/chat` request

```json
{
  "session_id": "abc",
  "candidate_id": 0,
  "message": "change base position 42 to G"
}
```

### `POST /api/agent/chat` response (shape)

```json
{
  "assistant_message": "...",
  "tool_calls": [
    { "tool": "edit_base", "status": "ok", "summary": "Mutated position 42 to G." }
  ],
  "candidate_update": {
    "candidate_id": 0,
    "sequence": "...",
    "scores": {
      "functional": 0.73,
      "tissue_specificity": 0.40,
      "off_target": 0.00,
      "novelty": 0.43,
      "combined": 0.66
    },
    "mutation": {
      "position": 42,
      "reference_base": "T",
      "new_base": "G"
    },
    "per_position_scores": [{ "position": 0, "score": -0.41 }]
  },
  "comparison": null
}
```

## Runbook

### Backend

```bash
cd /Users/vishnu/Documents/Helix/backend
source .venv/bin/activate
redis-server
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd /Users/vishnu/Documents/Helix/frontend
npm install
npm run dev
```

### Tests

```bash
cd /Users/vishnu/Documents/Helix/backend
source .venv/bin/activate
pytest -q
```

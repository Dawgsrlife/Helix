# Helix Source of Truth

Date: 2026-03-30
Status: Canonical

## Doc Precedence

1. This file is the only canonical planning and execution source.
2. `/Users/vishnu/Documents/Helix/ARCHITECTURE.md` and `/Users/vishnu/Documents/Helix/BACKEND_ARCHITECTURE.md` are reference context only.
3. If there is conflict, code + this document win.

## One-line Product Goal

Helix is a free, open-source genomic design IDE where researchers submit a design goal, watch candidate DNA generation live, compare ranked candidates, edit bases inline, and get real-time AI feedback plus protein structure context.

## Post-Hackathon Status (2026-03-30)

Won 2nd place in the AI Agents track at YHack (March 28-29, 2026). Now transitioning from hackathon prototype to a production-grade open-source genomic research tool.

### What's Real
- NCBI, PubMed, ClinVar integrations (live API calls with retry/rate-limiting)
- WebSocket streaming pipeline (intent → retrieval → generation → scoring → structure → explanation)
- Evo2 service abstraction (mock, local 7B, NVIDIA NIM 40B)
- Translation service (codon table, ORF finding, GC content — pure computation)
- 4D scoring logic (functional, tissue specificity, off-target, novelty)
- Session management (in-memory dev, Redis production)
- Frontend workspace (Next.js 16, sequence viewer, 3D structure, leaderboard, chat)
- 85 backend tests passing

### What's Mocked / Faked
- **Structure prediction** defaults to MOCK but ESMFold API (`api.esmatlas.com`) is verified live. Set `STRUCTURE_MODE=esmfold` for real protein folding.
- **Evo2 inference** defaults to MOCK (Markov chain + heuristics). Real local/NIM modes exist but are not the default path.
- **Explanation layer** supports Gemini and Claude streaming. Without API keys, generates score-based summaries from actual candidate data.
- **Agent chat** uses LangGraph (plan→execute→reflect→respond) with Claude tool_use, Gemini, and deterministic planning. Memory persists in Redis.
- **Frontend API layer** has mock fallbacks for every endpoint (works without backend).

### What's Badly Done
- **Orchestrator (`pipeline/orchestrator.py`)** has massive DRY violations: scoring fallback code copy-pasted 3x, structure prediction duplicated between generation and followup pipelines, no separation of concerns.
- **No README** — cannot be open-sourced without one.
- **No Docker/CI** — project can only run on the developer's machine.
- **No `.env.example`** — new contributors can't configure the project.
- **Mock frontend deleted** but still referenced in docs.

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
- [ ] **3.2 FASTA/GenBank import/export** — Researchers need to bring their own sequences and export results.
- [ ] **3.3 Multi-user sessions** — Move beyond single-user. Auth, session isolation, concurrent pipelines.
- [ ] **3.4 Frontend polish** — Loading states, error boundaries, responsive layout, accessibility.

### Phase 4: Research-Grade Features
- [ ] **4.1 Variant annotation** — ClinVar/gnomAD overlay on sequence viewer with pathogenicity predictions.
- [ ] **4.2 Codon optimization** — For protein-coding designs, optimize codon usage for target organism.
- [ ] **4.3 Off-target analysis** — BLAST integration for checking sequence uniqueness.
- [ ] **4.4 Experiment tracking** — Version every design iteration (the "startup moat" from ARCHITECTURE.md).

---

## As-built Snapshot (2026-03-30)

### Backend

- FastAPI endpoints: `/api/design`, `/api/edit/base`, `/api/edit/followup`, `/api/agent/chat`, `/api/mutations`, `/api/analyze`, `/api/structure`, `/api/health`.
- WebSocket event contract: `pipeline_manifest`, `stage_status`, `candidate_status`, `candidate_seed`, `intent_parsed`, `retrieval_progress`, `generation_token`, `candidate_scored`, `structure_ready`, `regulatory_map_ready`, `explanation_chunk`, `pipeline_complete`.
- `/api/design` accepts `run_profile: "demo" | "live"`, `truth_mode`, and `num_candidates`.
- Generation orchestration emits N candidate placeholders and guarantees `pipeline_complete.candidates` includes one record per requested candidate ID.
- Stage state is orchestrator-driven (`stage_status`) instead of frontend inference.
- Retrieval and stage flow are timeout-bounded in profile configs.
- Candidate scoring events include per-position likelihoods for sequence heatmap rendering.
- Generation and scoring degrade to deterministic fallback instead of dropping candidates.
- Structure fallback emits richer synthetic PDB backbones (hundreds of atoms).
- `agent/chat` endpoint runs tool-style actions: explain, edit, optimize, compare.

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

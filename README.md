# Helix

**The open-source genomic design IDE.** Co-design DNA sequences with AI — edit bases, score candidates in real time, and visualize protein structures, all in one workspace.

Helix connects researchers to foundation models like [Evo2](https://arcinstitute.org/news/blog/evo2) for sequence generation and scoring, real-time structure prediction, and literature retrieval from NCBI, PubMed, and ClinVar — with a live-streaming pipeline that shows every step as it happens.

> Won 2nd place in the AI Agents track at YHack 2026.

![Helix IDE](frontend/public/assets/hero-editor.png)

---

## What it does

1. **Describe what you want.** Type a natural-language design goal (e.g., "Design a neural-tissue-specific enhancer for BDNF").
2. **Watch the model think.** Helix streams candidate DNA sequences token-by-token via Evo2, scores them across four dimensions (functional fitness, tissue specificity, off-target risk, novelty), and folds proteins — all live.
3. **Edit and iterate.** Click any base in the sequence viewer to mutate it and get instant re-scoring (<2s). Or describe changes in natural language for a partial pipeline re-run.
4. **Compare candidates.** A ranked leaderboard shows all candidates with their multi-dimensional scores. Pick the best one, or keep editing.

### Key features

- **Real-time streaming pipeline** — every stage (intent parsing, literature retrieval, generation, scoring, folding, explanation) emits events via WebSocket; the frontend renders progressively
- **4D candidate scoring** — functional fitness, tissue specificity, off-target risk, and novelty, with per-position likelihood heatmaps
- **Click-to-edit base pairs** — single base edits trigger re-scoring only (not regeneration), returning results in under 2 seconds
- **3D protein structure viewer** — Three.js-based viewer with pLDDT confidence coloring and residue-level interaction
- **Literature-grounded** — parallel retrieval from NCBI, PubMed, and ClinVar provides genomic context before generation
- **Agentic chat** — natural-language commands to explain, edit, optimize, or compare candidates

---

## Architecture

```
Frontend (Next.js 16)          Backend (FastAPI)
    |                              |
    |-- POST /api/design --------->|-- Intent Parser (heuristic or LLM)
    |                              |-- Retrieval (NCBI + PubMed + ClinVar)
    |<-- WebSocket stream ---------|-- Evo2 Generation (local 7B / NIM 40B / mock)
    |   intent_parsed              |-- 4D Scoring
    |   retrieval_progress         |-- Structure Prediction (ESMFold / mock)
    |   generation_token           |-- Explanation (LLM streaming / fallback)
    |   candidate_scored           |
    |   structure_ready            |-- Redis (pub/sub + cache + sessions)
    |   explanation_chunk          |
    |   pipeline_complete          |
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full eight-view breakdown and [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) for current project status and roadmap.

---

## Quick start

### Prerequisites

- Python 3.12+
- Node.js 20+
- Redis

### 1. Clone

```bash
git clone https://github.com/Dawgsrlife/Helix.git
cd Helix
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env         # edit with your API keys (optional)
```

Start Redis and the API server:

```bash
redis-server &
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # already points to localhost:8000
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### With Docker (recommended)

```bash
docker compose up
```

This starts the backend, frontend, and Redis together. Open [http://localhost:3000](http://localhost:3000).

---

## Configuration

All backend settings are driven by environment variables. Copy `backend/.env.example` and set the ones you need:

| Variable | Default | Description |
|----------|---------|-------------|
| `EVO2_MODE` | `mock` | `mock`, `local`, or `nim_api` |
| `STRUCTURE_MODE` | `mock` | `mock` or `esmfold` |
| `GEMINI_API_KEY` | — | Enables LLM intent parsing and explanation generation |
| `NCBI_API_KEY` | — | Higher rate limits for NCBI/PubMed/ClinVar |
| `EVO2_NIM_API_KEY` | — | NVIDIA NIM API for Evo2 40B |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |

**Without any API keys**, Helix runs fully locally using mock/heuristic modes. Every integration has a fallback.

---

## Running tests

```bash
cd backend
source .venv/bin/activate
pytest -q
```

226 tests covering the pipeline orchestrator, scoring logic, WebSocket events, API endpoints, and external service contracts.

---

## Project structure

```
Helix/
├── backend/
│   ├── main.py                 # FastAPI app + all endpoints
│   ├── config.py               # Pydantic settings (env-driven)
│   ├── models/                 # Domain types + request/response schemas
│   ├── services/               # Evo2, translation, NCBI, PubMed, ClinVar, structure
│   ├── pipeline/               # Orchestrator, intent parser, scoring, retrieval, explanation
│   ├── ws/                     # WebSocket manager + typed event contracts
│   ├── cli/                    # Interactive Evo2 testing terminal
│   └── tests/                  # 216 tests
├── frontend/
│   ├── app/                    # Next.js pages (landing + /analyze workspace)
│   ├── components/             # Sequence viewer, 3D structure, leaderboard, chat
│   ├── hooks/                  # useDesignPipeline, useSequenceAnalysis, useMutationSim
│   ├── lib/                    # API client, Zustand store
│   └── types/                  # TypeScript domain types
├── docker-compose.yml
├── ARCHITECTURE.md             # Eight-view system architecture
└── SOURCE_OF_TRUTH.md          # Current status + roadmap
```

---

## Contributing

Helix is open source under the ISC license. Contributions are welcome.

1. Fork the repo
2. Create a feature branch
3. Make sure `pytest -q` passes (backend) and `npm run build` passes (frontend)
4. Open a PR

See [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) for the current roadmap and areas where help is most needed.

---

## License

[ISC](LICENSE)

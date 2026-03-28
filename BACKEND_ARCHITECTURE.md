# Helix Backend Architecture

> Give this document to your LLM (Claude Sonnet or similar) as context when building the backend. Copy-paste relevant sections as needed.

---

## What Helix Is

Helix is a collaborative genomic design IDE. A researcher types a plain English design goal like "Design a regulatory element that drives BDNF expression in hippocampal neurons for Alzheimer's therapy." The system then:

1. Parses the intent into a structured biological spec
2. Retrieves genomic context from NCBI, ClinVar, and PubMed in parallel
3. Generates N candidate DNA sequences using Evo 2 (streamed live to the frontend)
4. Scores each candidate on functional plausibility, tissue specificity, off-target risk, and novelty
5. Folds the top candidates with AlphaFold 3 (ColabFold as fallback)
6. Generates a plain English mechanistic explanation
7. Lets the researcher click any base pair and get instant re-scoring, or type a follow-up in natural language to trigger a partial re-run

The frontend is a Next.js 16 / TypeScript / React app already built. The backend is a FastAPI + Celery + Redis async pipeline with WebSocket streaming.

---

## Hardware

**ASUS ASCENT GX10** with NVIDIA GPU, 128 GB LPDDRX. This is the local compute backbone.

- Evo 2 7B runs locally on this hardware. No rate limits, full 1M token context window available during demo.
- The 40B model requires multi-GPU and is not feasible locally. Use NVIDIA NIM API as a fallback if 7B is insufficient.
- ESMFold or ColabFold can run locally for structure prediction.
- AlphaFold 3 via API is the primary structure prediction path; ColabFold local is the fallback if rate-limited.

**Key advantage**: Local inference means the demo never hits API rate limits. This is a competitive edge at the hackathon. Put it in the pitch.

---

## System Architecture (v4)

This matches the final Excalidraw diagram. See the architecture images for the visual.

```
Hardware layer
  ASUS ASCENT GX10 | 128 GB LPDDRX | Evo2 7B local inference

User input (natural language design goal)
  |
  v
Intent parser (LLM -> editable structured JSON spec)
  |
  v
Orchestrator (FastAPI + Celery DAG) <---> Redis (job queue, cache, pub/sub -> WebSocket)
  |
  |--> NCBI MCP (FastMCP local server) --|
  |--> PubMed RAG (local vector store) --|--> parallel retrieval
  |--> ClinVar (pathogen cross-ref)   --|
  |
  v
Evo2 generation (N candidates streamed live, token by token)  <-- WOW MOMENT 1
  |
  v
Evo2 scoring (functional, tissue, off-target, novelty heatmap)
  |                                         ^                    ^
  |                              Base pair edit (re-score only)  NL follow-up (partial re-run)
  v                                         |                    |
AlphaFold 3 (top-K fold -> PDB + pLDDT) -- ColabFold fallback   |
  |                                                              |
  v                                                              |
Explanation layer (LLM -> streaming mechanistic report)          |
  |                                                              |
  v                                                              |
Redis pub/sub -> WebSocket -----> Frontend workspace  -----------+
                                    |
                                    |--> Genome browser (live heatmap, editable bases)  <-- WOW MOMENT 2
                                    |--> Mol* 3D viewer (pLDDT coloring, residue click)
                                    |--> Candidate cards (live leaderboard, side-by-side diff)
                                    |--> Chat layer (NL iteration, history, spec editor)
                                    |
                                    v
                              Design iteration store (the startup moat)
                              Every edit, score, fold, validation result versioned
```

---

## Pipeline Modes

### Generation Mode (full run)
Triggered when the researcher submits a new design goal. Runs the complete pipeline end to end. Each step emits events via WebSocket so the frontend renders progressively.

### Edit Mode (partial run)
Triggered by researcher interaction after the initial pipeline completes. Two distinct code paths:

1. **Base pair edit**: Researcher clicks a base and changes it. Only triggers Evo2 re-scoring (not regeneration). The heatmap updates instantly. This is the killer feature.

2. **Natural language follow-up**: Researcher types something like "make this more tissue-specific" or "what if I remove the TATA box?" This triggers a partial pipeline re-run starting from the affected step. The intent parser determines which steps need to rerun.

These are architecturally separate paths in the Celery DAG. Do not conflate them.

---

## Layer-by-Layer Breakdown

### Layer 0: Orchestration Core
- **FastAPI** as the HTTP/WebSocket server
- **Celery** for async task execution (each pipeline step is a Celery task)
- **Redis** serves triple duty: job queue for Celery, result cache for intermediate outputs, pub/sub channel feeding WebSocket events to the frontend
- The DAG is hand-rolled in Python. No LangFlow, no LangChain orchestration. Full control over routing, error handling, retry logic, and streaming.

### Layer 1: Intent Parser
A lightweight LLM call (Claude or GPT-4 with a structured prompt) decomposes the natural language goal into:

```json
{
  "target_gene": "BDNF",
  "design_type": "regulatory_element",
  "tissue_specificity": {
    "high_expression": ["hippocampal_neurons"],
    "low_expression": ["cardiac_tissue"]
  },
  "therapeutic_context": "Alzheimer's disease",
  "constraints": ["novel_sequence", "no_known_pathogenic_variants"]
}
```

This spec is displayed in the UI and editable by the researcher before the pipeline runs.

### Layer 2: Genomic Context Retrieval (Parallel)
Three retrieval tasks run simultaneously:

1. **NCBI via FastMCP**: Pull reference genome sequence + known variants for the target gene. Runs as a local FastMCP server to avoid NCBI rate limiting during demo.
2. **PubMed RAG**: Embeddings of recent papers indexed in a local vector store. Retrieved by semantic similarity to the design goal.
3. **ClinVar lookup**: Pathogenic variant cross-reference filtered to the relevant gene and tissue type.

All three stream progress back to the frontend as they complete.

### Layer 3: Evo2 Generation
Generates N candidate sequences (10-20 for hackathon demo). Each candidate uses a different temperature or constraint variation for diversity.

**Critical**: Generation is streamed token by token via WebSocket. The researcher watches bases appear live in the genome browser. This is WOW moment 1.

### Layer 4: Evo2 Scoring
Each candidate is scored on four dimensions:
- **Functional plausibility**: How likely is this sequence to exist in nature?
- **Tissue specificity**: Does it match the requested expression pattern?
- **Off-target risk**: Does it resemble known pathogenic variants?
- **Novelty**: How different from training data? (Patentability vs biological credibility trade-off)

Scores update the live heatmap in the frontend per candidate.

### Layer 5: AlphaFold Structural Validation
Top K candidates (3-5) get protein structure prediction.

**Primary path**: AlphaFold 3 API
**Fallback**: ColabFold running locally on the GX10

Outputs PDB files with per-residue pLDDT confidence scores. Frontend renders via Mol* (or Three.js with our custom PDB parser).

### Layer 6: Explanation Layer
Final LLM call synthesizes a plain English report covering:
- Why this candidate is strong
- Predicted mechanism of action
- Key uncertainties
- Recommended wet lab validation steps
- Relevant published literature

Streamed to the chat panel in real time.

### Layer 7: Design Iteration Store
Every edit, score, regeneration, and fold result is versioned and replayable. This is the data flywheel that becomes the startup moat. Two years from now, Helix has a proprietary dataset of validated genomic designs that no competitor can replicate.

---

## API Contracts

The frontend maps raw API responses to domain types at the boundary. Your Pydantic response models must produce JSON matching these shapes.

### WebSocket Events

```
ws://localhost:8000/ws/pipeline/{session_id}
```

Events emitted during pipeline execution:

```json
{"event": "intent_parsed", "data": {"spec": {...}}}
{"event": "retrieval_progress", "data": {"source": "ncbi", "status": "complete", "result": {...}}}
{"event": "retrieval_progress", "data": {"source": "pubmed", "status": "complete", "result": {...}}}
{"event": "retrieval_progress", "data": {"source": "clinvar", "status": "complete", "result": {...}}}
{"event": "generation_token", "data": {"candidate_id": 0, "token": "A", "position": 142}}
{"event": "candidate_scored", "data": {"candidate_id": 0, "scores": {...}}}
{"event": "structure_ready", "data": {"candidate_id": 0, "pdb_data": "..."}}
{"event": "explanation_chunk", "data": {"text": "This candidate..."}}
{"event": "pipeline_complete", "data": {"candidates": [...]}}
```

### REST Endpoints (for non-streaming operations)

```
POST /api/design          # Submit a new design goal (triggers full pipeline)
POST /api/edit/base       # Single base pair edit (triggers re-score only)
POST /api/edit/followup   # Natural language follow-up (triggers partial re-run)
POST /api/mutations       # Standalone mutation effect prediction
POST /api/structure       # Standalone structure prediction
GET  /api/health          # Health check
```

#### `POST /api/design`

**Request:**
```json
{
  "goal": "Design a regulatory element that drives BDNF expression in hippocampal neurons",
  "session_id": "abc123"
}
```

**Response (202 Accepted):**
```json
{
  "session_id": "abc123",
  "status": "pipeline_started",
  "ws_url": "ws://localhost:8000/ws/pipeline/abc123"
}
```

Results stream via WebSocket. The 202 just acknowledges the pipeline started.

#### `POST /api/edit/base`

**Request:**
```json
{
  "session_id": "abc123",
  "candidate_id": 0,
  "position": 42,
  "new_base": "G"
}
```

**Response (200):**
```json
{
  "position": 42,
  "reference_base": "T",
  "new_base": "G",
  "delta_likelihood": -0.0034,
  "predicted_impact": "moderate",
  "updated_scores": {
    "functional": 0.87,
    "tissue_specificity": 0.72,
    "off_target": 0.05,
    "novelty": 0.34
  }
}
```

This must respond fast (under 2 seconds). It only re-scores, does not regenerate.

#### `POST /api/edit/followup`

**Request:**
```json
{
  "session_id": "abc123",
  "message": "Make this more tissue-specific",
  "candidate_id": 0
}
```

**Response (202 Accepted):**
```json
{
  "status": "partial_rerun_started",
  "steps_rerunning": ["intent_parse", "evo2_generation", "evo2_scoring"]
}
```

Results stream via the existing WebSocket connection.

#### `POST /api/mutations` (standalone)

**Request:**
```json
{
  "sequence": "ATGGATTTATCTGCTCTTCGCGTT...",
  "position": 42,
  "alternate_base": "G"
}
```

**Response (200):**
```json
{
  "position": 42,
  "reference_base": "T",
  "alternate_base": "G",
  "delta_likelihood": -0.0034,
  "predicted_impact": "moderate"
}
```

#### `GET /api/health`

```json
{
  "status": "healthy",
  "model": "evo2-7b",
  "gpu_available": true,
  "inference_mode": "local"
}
```

---

## RESTful Design Rules (from CSC301)

- URLs are nouns. Methods express actions.
- Proper status codes: 200, 202, 400, 404, 422, 500, 503. Never return 200 with an error body.
- Consistent resource shapes across all endpoints.
- Stateless. No server-side sessions. Session state lives in Redis keyed by session_id.
- No internal representation leakage. Map all model tensors/outputs to clean domain types at the service boundary.

---

## Backend Project Structure

```
backend/
├── main.py                  # FastAPI app, CORS, WebSocket endpoint
├── pipeline/
│   ├── orchestrator.py      # Celery DAG controller, mode routing (gen vs edit)
│   ├── intent_parser.py     # LLM intent decomposition
│   ├── retrieval.py         # NCBI MCP + PubMed RAG + ClinVar (parallel)
│   ├── evo2_generate.py     # Evo2 candidate generation with streaming
│   ├── evo2_score.py        # Evo2 multi-dimensional scoring
│   ├── structure.py         # AlphaFold 3 / ColabFold / ESMFold
│   └── explanation.py       # LLM mechanistic report generation
├── services/
│   ├── evo2.py              # Evo 2 model wrapper (local or NIM API)
│   ├── alphafold.py         # AlphaFold/ColabFold/ESMFold wrapper
│   ├── ncbi_mcp.py          # FastMCP server for NCBI queries
│   ├── pubmed_rag.py        # Vector store + semantic search
│   ├── clinvar.py           # ClinVar variant lookup
│   └── translation.py       # DNA -> protein translation, ORF finding
├── models/
│   ├── requests.py          # Pydantic request models
│   ├── responses.py         # Pydantic response models
│   └── domain.py            # Internal domain types
├── ws/
│   ├── manager.py           # WebSocket connection manager
│   └── events.py            # Event type definitions
├── config.py                # Environment config, API keys
├── celery_app.py            # Celery + Redis configuration
├── requirements.txt
└── README.md
```

---

## Environment Variables

```env
# Inference mode
EVO2_MODE=local                           # "local" or "nim_api"
EVO2_NIM_API_KEY=...                      # Only needed if EVO2_MODE=nim_api
EVO2_MODEL_PATH=arcinstitute/evo2_7b      # For local mode

# Structure prediction
STRUCTURE_MODE=alphafold_api              # "alphafold_api", "colabfold", or "esmfold"
ALPHAFOLD_API_KEY=...                     # Only if using AlphaFold API

# Intent parsing
INTENT_LLM=claude                         # "claude" or "openai"
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# Infrastructure
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER=redis://localhost:6379/1
FRONTEND_URL=http://localhost:3000
PORT=8000
```

---

## Fault Tolerance (CSC301 Patterns)

### Failure Isolation
- If NCBI is down, continue with PubMed RAG + ClinVar results only.
- If AlphaFold API is rate-limited, fall back to ColabFold local.
- If ColabFold also fails, return candidates without structure data (frontend handles empty state).
- "Partial success is success." Degrade gracefully, never crash the pipeline.

### Timeouts
- Evo2 forward pass: 30s timeout
- AlphaFold API: 60s timeout
- NCBI retrieval: 15s timeout
- If GPU is busy: return 503 with Retry-After header

### The Two Edit Paths (Critical Architecture Decision)
A base pair edit only needs re-scoring. A natural language follow-up might need regeneration. These are completely different code paths with different latency profiles. The orchestrator must route correctly:
- Base pair edit -> `evo2_score.py` only -> response in under 2 seconds
- NL follow-up -> `intent_parser.py` -> determine affected steps -> partial DAG re-run

---

## Evo 2 Integration

### Local Inference (Primary - uses GX10)
```python
from evo2 import Evo2

model = Evo2("arcinstitute/evo2_7b")

# Forward pass (get per-position log-likelihoods)
logits, embeddings = model.forward("ATGGATT...")

# Score a mutation (zero-shot variant effect prediction)
ref_ll = model.score("...original...")
mut_ll = model.score("...mutated...")
delta = mut_ll - ref_ll
# |delta| < 0.001 = benign, 0.001-0.005 = moderate, > 0.005 = deleterious
```

### NVIDIA NIM API (Fallback)
```python
import requests

response = requests.post(
    "https://build.nvidia.com/arc/evo2-40b",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"sequence": "ATGGATT..."}
)
logits = response.json()["logits"]
```

### Key Capabilities (from the Nature paper)
- Zero-shot variant effect prediction without fine-tuning
- Exon/intron classification via embeddings + lightweight classifier (AUROC 0.91-0.99)
- Region annotation: SAE features correspond to ORFs, intergenic regions, tRNAs, rRNAs, prophage
- 1 million base pair context window for whole-genome analysis
- Generates mitochondrial, prokaryotic, and eukaryotic sequences at genome scale

---

## Quick Start (Mock Server)

Start with this mock server so the frontend can integrate immediately. Replace with real inference incrementally.

```python
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio, random, math, json, uuid

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/api/design")
async def design(body: dict):
    session_id = body.get("session_id", str(uuid.uuid4()))
    # In production this would trigger the Celery pipeline
    return {"session_id": session_id, "status": "pipeline_started", "ws_url": f"ws://localhost:8000/ws/pipeline/{session_id}"}

@app.websocket("/ws/pipeline/{session_id}")
async def pipeline_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"

    # Simulate intent parsing
    await websocket.send_json({"event": "intent_parsed", "data": {"spec": {"target_gene": "BDNF", "design_type": "regulatory_element"}}})
    await asyncio.sleep(0.5)

    # Simulate retrieval
    for source in ["ncbi", "pubmed", "clinvar"]:
        await websocket.send_json({"event": "retrieval_progress", "data": {"source": source, "status": "complete"}})
        await asyncio.sleep(0.3)

    # Simulate token-by-token generation
    for i, base in enumerate(seq):
        await websocket.send_json({"event": "generation_token", "data": {"candidate_id": 0, "token": base, "position": i}})
        await asyncio.sleep(0.05)

    # Simulate scoring
    await websocket.send_json({"event": "candidate_scored", "data": {
        "candidate_id": 0,
        "scores": {"functional": 0.89, "tissue_specificity": 0.76, "off_target": 0.03, "novelty": 0.41}
    }})

    await websocket.send_json({"event": "pipeline_complete", "data": {"candidates": [{"id": 0, "sequence": seq}]}})

@app.post("/api/edit/base")
async def edit_base(body: dict):
    pos = body["position"]
    delta = round(random.uniform(-0.01, 0.001), 6)
    impact = "benign" if abs(delta) < 0.001 else "moderate" if abs(delta) < 0.005 else "deleterious"
    return {
        "position": pos,
        "reference_base": body.get("reference_base", "T"),
        "new_base": body["new_base"],
        "delta_likelihood": delta,
        "predicted_impact": impact,
        "updated_scores": {"functional": 0.87, "tissue_specificity": 0.72, "off_target": 0.05, "novelty": 0.34}
    }

@app.post("/api/mutations")
async def mutate(body: dict):
    seq = body["sequence"]
    pos = body["position"]
    alt = body["alternate_base"]
    ref = seq[pos] if pos < len(seq) else "N"
    delta = round(random.uniform(-0.01, 0.001), 6)
    impact = "benign" if abs(delta) < 0.001 else "moderate" if abs(delta) < 0.005 else "deleterious"
    return {"position": pos, "reference_base": ref, "alternate_base": alt, "delta_likelihood": delta, "predicted_impact": impact}

@app.get("/api/health")
async def health():
    return {"status": "healthy", "model": "mock", "gpu_available": False, "inference_mode": "mock"}
```

Run with: `uvicorn main:app --reload --port 8000`

---

## Frontend Domain Types (API responses must map to these)

```typescript
interface AnalysisResult {
  rawSequence: string;
  regions: SequenceRegion[];
  perPositionScores: LikelihoodScore[];
  predictedProteins: PredictedProtein[];
}

type AnnotationType = 'exon' | 'intron' | 'orf' | 'prophage' | 'trna' | 'rrna' | 'intergenic' | 'unknown'
type Impact = 'benign' | 'moderate' | 'deleterious'
```

---

## What NOT to Do

- Do not expose raw model tensors to the frontend. Always map to clean domain types.
- Do not use GET for design or mutation endpoints. Use POST.
- Do not return 200 for errors. Use proper HTTP status codes.
- Do not hardcode API keys in source. Use environment variables.
- Do not skip input validation. Always validate sequence characters and length.
- Do not conflate the two edit paths. Base pair edit is re-score only. NL follow-up is partial re-run.
- Do not make retrieval sequential. NCBI, PubMed RAG, and ClinVar must run in parallel.

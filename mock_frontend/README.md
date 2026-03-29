# Helix Mock Frontend (Vite + React)

This is the isolated demo shell. It is intentionally separate from the real frontend in `/Users/vishnu/Documents/Helix/frontend`.

## What this mock does

- Silent autoplay by default (judge-friendly, no narration required)
- Live pipeline consumption over WebSocket
- Event-driven reducer/store for:
  - `pipeline_manifest`
  - `stage_status`
  - `candidate_status`
  - `intent_parsed`
  - `retrieval_progress`
  - `generation_token`
  - `candidate_scored`
  - `structure_ready`
  - `explanation_chunk`
  - `pipeline_complete`
- React Flow stage map
- Multi-lane DNA stream with inline base editing
- Candidate race leaderboard
- 3Dmol protein viewer for `.pdb` payloads
- Scientific details drawer (hidden by default)

## Run

```bash
cd /Users/vishnu/Documents/Helix/mock_frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Test

```bash
cd /Users/vishnu/Documents/Helix/mock_frontend
npm test
```

Reducer tests live in `src/store/pipelineReducer.test.ts`.

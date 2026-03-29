# Mock Frontend (Isolated)

This is a standalone mock frontend for Helix's live backend pipeline.

It is intentionally isolated under `mock_frontend/` and does **not** modify the real `frontend/` app.

## What it implements

- `POST /api/design` design submission
- WebSocket stream consumption from `ws://localhost:8000/ws/pipeline/{session_id}`
- Event reducer for all backend event types:
  - `intent_parsed`
  - `retrieval_progress`
  - `generation_token`
  - `candidate_scored`
  - `structure_ready`
  - `explanation_chunk`
  - `pipeline_complete`
- Live genome base streaming from `generation_token` (one base at a time)
- Real-time candidate leaderboard updates on `candidate_scored`
- Click-to-edit base pair flow via `POST /api/edit/base`
- Follow-up chat flow via `POST /api/edit/followup` on existing session/socket

## Run

1. Start backend on port 8000.
2. Serve this folder as static files:

```bash
cd /Users/vishnu/Documents/Helix/mock_frontend
python3 -m http.server 4173
```

3. Open:

- [http://localhost:4173](http://localhost:4173)

## Demo loop

1. Click **Run Live Pipeline**.
2. Watch genome bases stream into the browser.
3. Click a base and apply `A/T/C/G` edit.
4. Confirm inline delta + updated candidate scores.
5. Send follow-up message and watch partial rerun events stream on the same socket.

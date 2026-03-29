# Helix Frontend Handoff

> State as of March 29 2026. Branch: `frontend`. All committed and pushed.

## Quick Start (Demo)

```bash
cd frontend
npm run build       # Production build (~6s)
npm start           # Serves on http://localhost:3000
```

To connect to the real backend (GPU inference):
```bash
NEXT_PUBLIC_API_URL=http://<gpu-ip>:8000 npm run build && npm start
```

Without NEXT_PUBLIC_API_URL, the app uses local Next.js mock API routes.

## Demo Script

1. **Open** `http://localhost:3000/analyze`
2. **Choose mode**: "Paste Sequence" (existing DNA) or "Design New" (NL goal)
3. **Submit**: Click an example or paste/type, then submit
4. **Pipeline animates** (~6s): 6-stage progress with real-time indicators
5. **Analyze view**: Region table, annotation track, top region card, stats
6. **Inspect**: Click a region row → Explorer with sequence viewer, inspector panel
7. **Edit**: Click "Open in Design Studio" → click a base → run mutation simulation
8. **Compare**: Click "Compare" in IDE toolbar → split-pane sequence diff
9. **Copilot**: Click "Copilot" button → contextual chat panel with suggested prompts

## What Exists

### Landing Page (`app/page.tsx`)
- GSAP ScrollTrigger cinematic scroll story (6 pinned scenes)
- Hero with Instrument Serif italic accent
- 3 product render images, scoring console, floating ATCG particles
- Helix brand mark (arc SVG) + wordmark, SVG grain overlay

### Analyze Page (`app/analyze/page.tsx`)
Seven view modes in one unified corridor:
1. **Input**: Two-column intake with Paste/Design mode toggle
2. **Pipeline**: 6-stage progress (real WS events or simulation fallback)
3. **Analyze**: Region table, annotation track, top region, stats, model note
4. **Leaderboard**: Ranked candidate table with 4D scores
5. **Explorer**: Sequence viewer, inspector panel, structure preview, likelihood graph
6. **IDE/Studio**: Mutation editor, scoring bars, structure, edit history, toolbar
7. **Compare**: Split-pane colored sequence diff, score deltas, position-level diffs

### Copilot (`components/workspace/ChatPanel.tsx`)
- Workspace-integrated side panel, screen-specific suggested prompts
- Context-aware mock responses referencing actual candidate data

### WebSocket Streaming (`hooks/useDesignPipeline.ts`)
- POST /api/design → WebSocket streaming pipeline
- Handles 7 event types: intent_parsed, retrieval_progress, generation_token,
  candidate_scored, structure_ready, explanation_chunk, pipeline_complete
- PipelineStatus reactive to real events with simulation fallback

### Design System
- OKLCH color system (globals.css): surfaces, text, accent, nucleotide, annotation colors
- All components use CSS custom properties (var(--surface-*), var(--text-*), etc.)
- Three.js/Canvas contexts retain hex (CSS vars not supported there)
- Inter + JetBrains Mono + Instrument Serif (landing hero only)
- 8px spacing grid, consistent typography scale

### Infrastructure
- Zustand store with full state: viewMode, candidates, chatMessages, editHistory,
  pipeline status, streaming state (sessionId, generatingSequence, explanation, etc.)
- Mock API routes (`app/api/*`) for analyze, mutations, structure, health
- `lib/api.ts` with all endpoints (analyze, mutations, structure, design, edit/base,
  edit/followup, health)

## Completed Phases

| Phase | Description | Commit |
|-------|-------------|--------|
| B | Sidebar nav wiring + OKLCH color unification | `e97cde9` |
| C | Spacing, typography, surface elevation polish | `cc97812` |
| D | WebSocket streaming integration | `80c3209` |
| E | Demo flow hardening (pipeline view, nav guards) | `7491abc` |
| F | Video recording prep (prod build, metadata) | current |

## Key Design Decisions
- **No serif fonts in product UI** (only Instrument Serif italic in landing hero)
- **Single teal accent** used sparingly via var(--accent)
- **Explorer vs Studio are materially different**: Explorer is read-only, Studio has editing
- **Compare is genomic-aware**: split-pane colored sequence diff
- **Copilot is screen-contextual**: different prompts per view mode
- **Pipeline has dual modes**: real WS streaming (when backend connected) or simulation

## File Map
```
frontend/
  app/
    page.tsx              # Landing (GSAP scroll story)
    layout.tsx            # Root (fonts, metadata, OG tags)
    analyze/
      page.tsx            # 7-mode product corridor
      layout.tsx          # Page title metadata
    api/                  # Mock API routes
  components/
    brand/HelixLogo.tsx   # Logo system (3 sizes, 3 variants)
    sequence/             # SequenceViewer, BaseToken, SequenceInput, RegionHighlight
    annotation/           # AnnotationTrack, AnnotationLegend, LikelihoodGraph
    mutation/             # MutationPanel, MutationDiff
    structure/            # ProteinViewer (Three.js), StructureControls
    workspace/            # CandidateLeaderboard, ChatPanel, CompareView, PipelineStatus
    ui/                   # ShadCN + LoadingState
  hooks/
    useSequenceAnalysis   # Non-streaming /api/analyze path
    useDesignPipeline     # Streaming /api/design + WS path
    useMutationSim        # Mutation simulation
    useAnnotations        # Annotation processing
  lib/
    store.ts              # Zustand (viewMode, candidates, streaming state, etc.)
    api.ts                # All backend API functions
    sequenceUtils.ts      # Parsing, validation, GC content
    colorMap.ts, utils.ts
  types/                  # sequence, analysis, structure domain types
  public/assets/          # Product images, favicon
```

## Integration Checklist
- [ ] Set `NEXT_PUBLIC_API_URL=http://<gpu-ip>:8000`
- [ ] Verify `GET /api/health` returns 200
- [ ] Test "Design New" mode → should stream real WS events
- [ ] Test "Paste Sequence" → should hit real /api/analyze
- [ ] Test base editing in IDE → should hit real /api/mutations

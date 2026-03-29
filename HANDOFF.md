# Helix Frontend Handoff

> State as of March 28 2026, ~11pm. Branch: `frontend`. All committed and pushed.

## What Exists

### Landing Page (`app/page.tsx`)
- GSAP ScrollTrigger cinematic scroll story (6 pinned scenes)
- Hero with Instrument Serif italic accent ("thinks out loud")
- 3 product render images (hero-editor, edit-closeup, structure-fold)
- Scoring console (monolithic panel, not cards)
- Brighter color system (#141416 base, #1c1c1f raised, #222225 elevated)
- SVG grain overlay, floating ATCG particles
- Helix brand mark (arc SVG) + wordmark component

### Analyze Page (`app/analyze/page.tsx`)
Seven view modes in one unified corridor:
1. **Input**: Two-column intake (sequence editor + context panel with model status, format hints, pipeline steps)
2. **Pipeline**: 8-stage progress visualization with simulated progression
3. **Analyze**: Decision support with region table, top region highlight, score summary, annotation track
4. **Leaderboard**: Ranked candidate table with 4D scores (functional, tissue, off-target, novelty)
5. **Explorer**: Read-only inspector (position details, region list, structure preview, "Open in Studio" CTA)
6. **IDE/Studio**: Dense editing environment (mutation editor, scoring summary, edit history, save/revert/compare/rescore toolbar)
7. **Compare**: Genomic-aware split-pane diff (colored bases, annotation tracks, score deltas, position-level diffs)

### Copilot (`components/workspace/ChatPanel.tsx`)
- Workspace-integrated side panel (not header toggle)
- Screen-specific suggested prompts (different per view mode)
- Context-aware mock responses referencing actual candidate data
- Typing indicator, editorial message styling

### Components
- `components/brand/HelixLogo.tsx` - Arc mark + wordmark, 3 sizes, 3 variants
- `components/sequence/*` - SequenceViewer, BaseToken, SequenceInput, RegionHighlight
- `components/annotation/*` - AnnotationTrack, AnnotationLegend, LikelihoodGraph (canvas-based)
- `components/mutation/*` - MutationPanel (spring animations), MutationDiff
- `components/structure/*` - ProteinViewer (Three.js, pLDDT coloring, sample PDB), StructureControls
- `components/workspace/*` - CandidateLeaderboard, ChatPanel, CompareView, PipelineStatus

### Infrastructure
- Zustand store (`lib/store.ts`) with full state: viewMode, candidates, chatMessages, editHistory, pipeline status
- Mock API routes (`app/api/*`) for analyze, mutations, structure, health
- `lib/api.ts` with all 6 backend endpoints stubbed (set NEXT_PUBLIC_API_URL for real backend)
- `@gsap/react` for proper GSAP cleanup

## What Needs Doing

### Phase B: Sidebar + Colors (next)
1. Wire sidebar nav buttons to viewMode transitions (currently decorative)
2. Unify globals.css to OKLCH color system
3. Apply consistent surface hierarchy

### Phase C: Polish
1. Apply lovi.care spacing principles
2. Refine all surface elevations
3. Ensure consistent typography scale

### Integration
- Frontend uses local Next.js API routes by default
- Set `NEXT_PUBLIC_API_URL=http://<gpu-ip>:8000` to connect to real backend
- Backend has all endpoints implemented (Vishnu's work on main)
- WebSocket streaming (`/api/design` + `/ws/pipeline/{session_id}`) exists in backend but frontend doesn't consume it yet

## Key Design Decisions
- **No serif fonts in product UI** (only Instrument Serif italic in landing page hero accents)
- **Inter + JetBrains Mono** for all product surfaces
- **Single teal accent** (#5bb5a2) used sparingly
- **Explorer vs Studio are materially different**: Explorer is read-only inspection, Studio has editing controls, scoring panel, version history, toolbar
- **Compare is genomic-aware**: split-pane colored sequence diff, not a generic table
- **Copilot is screen-contextual**: different prompts per view mode

## Color System (current hex, Phase B converts to OKLCH)
| Surface | Hex | Purpose |
|---------|-----|---------|
| Base | #141416 | Page background |
| Raised | #1c1c1f | Panels, alternate sections |
| Elevated | #222225 | Cards, consoles, inputs |
| Text primary | #F0EFED | Headings |
| Text secondary | #D1D0CC | Body |
| Text muted | #888 | Labels |
| Text faint | #555 | Metadata |
| Accent | #5bb5a2 | CTAs, active states |
| Base A | #6bbd7a | Adenine |
| Base T | #d47a7a | Thymine |
| Base C | #6b9fd4 | Cytosine |
| Base G | #c9a855 | Guanine |

## File Map
```
frontend/
  app/
    page.tsx              # Landing (GSAP scroll story)
    layout.tsx            # Root (Inter, JetBrains Mono, Instrument Serif)
    analyze/page.tsx      # 7-mode product corridor
    api/                  # Mock API routes (analyze, mutations, structure, health)
  components/
    brand/HelixLogo.tsx   # Logo system
    sequence/             # SequenceViewer, BaseToken, SequenceInput, RegionHighlight
    annotation/           # AnnotationTrack, AnnotationLegend, LikelihoodGraph
    mutation/             # MutationPanel, MutationDiff
    structure/            # ProteinViewer, StructureControls
    workspace/            # CandidateLeaderboard, ChatPanel, CompareView, PipelineStatus
    layout/AppShell.tsx   # Legacy shell (sidebar/nav now inline in analyze page)
    ui/                   # ShadCN: button, badge, tooltip, LoadingState
  hooks/                  # useSequenceAnalysis, useAnnotations, useMutationSim
  lib/                    # store (Zustand), api, sequenceUtils, colorMap, utils
  types/                  # sequence, analysis, structure domain types
  public/assets/          # hero-editor.png, edit-closeup.png, structure-fold.png, favicon.svg
```

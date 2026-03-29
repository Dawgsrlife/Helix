# Helix Frontend Handoff — Session 3

> State as of March 29 2026. Branch: `frontend`. All committed and pushed.
> PR: Dawgsrlife/Helix#2 (frontend → main)

## Quick Start

```bash
cd frontend && npm run dev          # http://localhost:3000
# OR with mock backend:
cd mock-backend && npm install && node server.js  # port 8000
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## What Changed in Session 3

### 1. 3D Protein Structure Viewer — Centerpiece
- **ProteinViewer.tsx** (655 lines) completely rewritten
- **Hover tooltips** via drei `Html`: shows residue name, number, pLDDT score + confidence label
- **Click-to-highlight**: clicking a 3D residue highlights the corresponding DNA bases in the sequence viewer (bidirectional 3D ↔ sequence linking via codon mapping)
- **Fullscreen toggle** with camera distance adjustment
- **Theme-aware lighting**: brighter ambient in light mode, teal accent fill in dark mode
- **Auto-rotate pauses** on hover or OrbitControls interaction
- New **"Structure" view mode** added to store + sidebar — full-height 3D viewer as the app's centerpiece
- Structure view always renders (loads sample PDB if no analysis has run yet)

### 2. Tutorial / Onboarding — Coach Marks
- **TutorialOverlay.tsx** redesigned as **positioned floating coach marks** (no dark overlay/backdrop)
- Non-blocking: UI remains fully interactive during tutorial
- Teal highlight ring around anchor elements (e.g., sequence input area)
- 8-step walkthrough: Welcome → Input → Pipeline → Analyze → Structure → Explorer → Studio → Copilot
- Arrow pointer when anchored to elements
- Keyboard navigation (arrows, Enter, Escape)
- localStorage persistence (`helix-tutorial-completed`)
- Skip button + progress dots
- Accessible from sidebar "Tutorial" button

### 3. Science Tooltips
- **ScienceTooltip.tsx** — 28-term dictionary of plain English explanations
- Terms: pLDDT, functional plausibility, off-target risk, DNA bases (A/T/C/G), exon, intron, ORF, mutations, Evo 2, ESMFold, AlphaFold, log-likelihood, GC content, residue, etc.
- `ScienceTooltip` component wraps content with dashed underline hint, shows tooltip on hover
- `ScienceInfo` inline "ⓘ" icon variant
- Integrated across all views: analyze overview, explorer inspector, leaderboard headers, IDE score bars, structure panel

### 4. Fluid Motion Design
- Spring-physics sidebar nav (scale on hover/tap via Framer Motion)
- Staggered card/row entrances in analyze regions and leaderboard candidates
- Animated score bars (width grows from 0% with staggered delay)
- Pipeline stage checkmarks bounce in with spring animation
- Slide-in-right side panels
- Fade+slide view transitions with configurable direction
- Floating copilot button springs in from bottom

### 5. Light Mode Polish
- `::selection` color adapts to light backgrounds
- Scrollbar thumb adapts (dark in light mode)
- LikelihoodGraph canvas colors are theme-aware (dark bars + highlight for light mode)
- SequenceViewer hover uses `color-mix(in oklch)` instead of hardcoded rgba
- PipelineStatus/CandidateLeaderboard backgrounds use `color-mix` with accent
- All `rgba(255,255,255,0.04)` borders replaced with `var(--ghost-border)`
- ProteinViewer backbone tube color and lighting adapt per theme

### 6. Mock Frontend Flow Integration
- WebSocket connection status badge in sidebar (connected/connecting indicator)
- `useDesignPipeline.ts` now updates `wsStatus` in store on WS open/close
- `editBase` and `editFollowup` API functions already wired in `lib/api.ts`
- Store has `wsStatus` state for connection badge

## Architecture Changes

### New Files
```
frontend/components/ui/ScienceTooltip.tsx  — Science term dictionary + tooltip components
frontend/components/ui/TutorialOverlay.tsx — Coach mark tutorial system
```

### Modified Files
```
frontend/lib/store.ts                     — Added "structure" ViewMode + wsStatus state
frontend/app/analyze/page.tsx             — Structure view, tutorial, tooltips, animations
frontend/components/structure/ProteinViewer.tsx — Full rewrite with raycasting + tooltips
frontend/components/annotation/LikelihoodGraph.tsx — Theme-aware canvas colors
frontend/components/sequence/SequenceViewer.tsx — Theme-aware hover
frontend/components/workspace/CandidateLeaderboard.tsx — Animations + tooltips
frontend/components/workspace/PipelineStatus.tsx — Bouncing checkmarks + theme fixes
frontend/hooks/useDesignPipeline.ts       — WS status updates
frontend/app/globals.css                  — Light mode selection + scrollbar
```

### Store Shape (additions)
```typescript
{
  // New view mode
  viewMode: "..." | "structure",

  // New connection state
  wsStatus: "disconnected" | "connecting" | "connected",
  setWsStatus: (status) => void,
}
```

## What the Next Session Must Do

### 1. Backend Integration
- Set `NEXT_PUBLIC_API_URL=http://<gpu-ip>:8000` to connect to real backend
- Test full pipeline: design goal → WebSocket streaming → 3D structure
- The frontend already handles all backend events (intent_parsed, retrieval_progress, generation_token, candidate_scored, structure_ready, explanation_chunk, pipeline_complete)

### 2. Real PDB Data
- When backend returns `structure_ready` event with real PDB data, the 3D viewer will render it automatically
- ESMFold PDB files use B-factor column for pLDDT scores (already parsed)
- Test with real protein predictions from the backend

### 3. Base Editing API Integration
- `editBase()` and `editFollowup()` functions exist in `lib/api.ts`
- Wire into MutationPanel: when user edits a base, call the backend to re-score
- Show delta likelihood + predicted impact from backend response

### 4. Landing Page Polish
- The landing page at `app/page.tsx` still uses GSAP ScrollTrigger
- Consider adding protein structure preview to the "Structure" section of the landing scroll

## Key Decisions
- Tutorial is non-blocking coach marks (no backdrop), not a modal
- Structure view accessible from sidebar even without analysis (loads sample PDB)
- 3D viewer always renders — uses `/assets/sample-structure.pdb` as fallback
- All science terms have plain-English tooltips for non-bio users
- Connection status badge only appears when WS is active (not when disconnected)

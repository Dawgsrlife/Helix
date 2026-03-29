# Helix Frontend Handoff — Session 2

> State as of March 29 2026, late evening. Branch: `frontend`. All committed and pushed.
> PR: Dawgsrlife/Helix#2 (frontend → main)

## Quick Start

```bash
cd frontend && npm run dev          # http://localhost:3000
# OR with mock backend:
cd mock-backend && npm install && node server.js  # port 8000
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## What the Next Session Must Do

### 1. PRIORITY: 3D Protein Structure Visualization
**This is the selling point of the entire app.**

The ProteinViewer (`components/structure/ProteinViewer.tsx`) exists but needs major upgrades:
- Currently renders CA-alpha backbone + thin bond cylinders via React Three Fiber
- Uses a real 114-residue PDB at `public/assets/sample-structure.pdb`
- pLDDT confidence coloring works (teal >90, blue >70, amber >50, coral <50)

**What's needed:**
- Make the 3D viewer MUCH larger and prominent (currently tiny in side panels)
- Add a dedicated "Structure" view mode or full-screen toggle
- Add interactive tooltips on hover: show residue name, number, pLDDT score
- Add click-to-highlight: clicking a residue in 3D highlights it in the sequence viewer and vice versa
- Consider ribbon/cartoon representation instead of just spheres+tubes
- The mock backend (`mock-backend/server.js`) returns PDB data — it's already wired
- The real backend has ESMFold integration at `backend/services/structure.py` that hits Meta's API
- **Main branch** has the backend with test PDB generation scripts — merge main into frontend to get those

### 2. Tutorial / Onboarding System
Build a step-by-step tutorial overlay for first-time users:
- Step 1: "Paste a DNA sequence or describe what you want to design" (input view)
- Step 2: "Watch the pipeline analyze your sequence" (pipeline view)
- Step 3: "Review the analysis — click any region to explore" (analyze view)
- Step 4: "Inspect bases and their confidence scores" (explorer view)
- Step 5: "Edit bases and see the effect on protein function" (studio view)
- Step 6: "Compare candidates side by side" (compare view)
- Step 7: "Ask Copilot to explain anything" (copilot)

Implementation suggestion: Zustand `tutorialStep` state + overlay component with spotlight/mask on the relevant area. Skip button. Persist "tutorial completed" in localStorage.

### 3. Tooltips on Everything
Non-bio users can't understand the app without context:
- Hover over "Functional plausibility" → "How likely this sequence produces a working protein"
- Hover over "Off-target risk" → "Chance this sequence affects unintended genes"
- Hover over "pLDDT" → "AI confidence score: higher = more reliable structure prediction"
- Hover over colored bases (A/T/C/G) → "Adenine/Thymine/Cytosine/Guanine — the building blocks of DNA"
- Hover over annotation regions → "This section of DNA codes for a protein (exon) / doesn't code (intron)"
- Use shadcn Tooltip component (already installed)

### 4. Fluid Motion Design
Current state: basic Framer Motion opacity fades on view transitions. Needs:
- Staggered card entrances (analyze view cards, leaderboard rows)
- Smooth panel slide-ins (right panels in explorer/studio)
- Sidebar items: hover scale(1.02), active spring animation
- View transitions: slide left/right based on navigation direction
- Score bars: animate width on mount (grow from 0%)
- Sequence viewer: bases fade in staggered (already has GSAP for this)
- Pipeline stages: check marks bounce in
- CSS: `.transition-smooth`, `.hover-lift` utilities exist in globals.css

### 5. Design Polish (Lavoe-inspired)
Reference: `C:\Users\33576\Helix\materials\inspiration\Lavoe\` — editor-style app with project list, heatmap visualization. Key patterns to adapt:
- Project/sample list view (could be our "past analyses" or "saved sequences")
- Heatmap visualization (could be our likelihood score heatmap)
- Clean card-based layout with generous padding
- Subtle shadows and rounded corners throughout

### 6. Light Mode Refinement
Light mode works but needs polish:
- All `rgba(91,181,162,...)` accent overlays need light-mode variants
- The `::selection` color should adapt
- Canvas-based components (LikelihoodGraph) use hardcoded colors — need theme detection
- Three.js viewer lighting should adapt (brighter ambient in light mode)

### 7. Route-Based Navigation
URL sync is implemented (`/analyze?view=explorer`) but views should feel more like pages:
- Consider actual nested routes (`/analyze/explorer`, `/analyze/studio`) for cleaner URLs
- Browser back/forward already works via search params
- Each view should have proper page title via document.title

## Architecture Map

```
frontend/
  app/
    page.tsx                    # Landing page (GSAP scroll story, always dark)
    layout.tsx                  # Root (Inter, JetBrains Mono, Instrument Serif, Space Grotesk)
    globals.css                 # Obsidian Aura design system (OKLCH, light/dark)
    analyze/
      page.tsx                  # Main app — 7 view modes in one corridor
      layout.tsx                # Page title metadata
    api/                        # Next.js mock API routes (fallback when no backend)
  components/
    brand/HelixLogo.tsx         # Arc mark + wordmark (3 sizes, 3 variants)
    sequence/
      SequenceInput.tsx         # Two-mode input (Paste/Design) with examples
      SequenceViewer.tsx        # DNA base display with GSAP stagger reveal
      BaseToken.tsx             # Individual base with pLDDT coloring
      RegionHighlight.tsx       # Annotation region overlay (color-mix for alpha)
    annotation/
      AnnotationTrack.tsx       # Full-width region bar
      AnnotationLegend.tsx      # Region type color legend
      LikelihoodGraph.tsx       # Canvas-based per-position score graph
    mutation/
      MutationPanel.tsx         # Position + base selector + simulation trigger
      MutationDiff.tsx          # Delta score bar visualization
    structure/
      ProteinViewer.tsx         # THREE.js backbone + pLDDT spheres + bonds
      StructureControls.tsx     # Reset/highlight/color mode buttons + pLDDT legend
    workspace/
      CandidateLeaderboard.tsx  # Ranked table with 4D scores
      ChatPanel.tsx             # Copilot side panel with mock responses
      CompareView.tsx           # Split-pane sequence diff + score deltas
      PipelineStatus.tsx        # 6-stage progress (real WS or simulation fallback)
    ui/                         # ShadCN: button, badge, tooltip, LoadingState
  hooks/
    useSequenceAnalysis.ts      # Non-streaming /api/analyze (6.2s min animation)
    useDesignPipeline.ts        # Streaming /api/design + WS (mock fallback built in)
    useMutationSim.ts           # Mutation simulation via /api/mutations
  lib/
    store.ts                    # Zustand — viewMode, candidates, theme, auth, streaming, save/revert
    api.ts                      # All backend API functions (analyze, design, mutations, structure, health, edit)
    sequenceUtils.ts            # parseSequence, normalizeSequence, isValidSequence, gcContent
  types/                        # sequence, analysis, structure domain types
  public/assets/
    hero-editor.jpg             # Molecule render (hero background)
    sample-structure.pdb        # 114-residue protein (ESMFold-style)
    favicon.svg

mock-backend/                   # Standalone Express server (port 8000)
  server.js                     # All endpoints mocked + WebSocket pipeline streaming
  package.json                  # express, cors, express-ws, uuid

materials/                      # Design references (don't ship, dev-only)
  inspiration/Callio_Labs/      # Glassmorphism, sidebar, chat panel code
  inspiration/Lavoe/            # Editor-style app, project list, heatmaps
  best_inspo/                   # QClay design reference
  prototypes/                   # HTML prototypes with Aura/Obsidian design systems
```

## Design System (globals.css)

**Surfaces** (dark mode, OKLCH):
```
void    → oklch(0.065 0 0)       # Sidebar, deepest
base    → oklch(0.085 0.003 280) # Page background
raised  → oklch(0.105 0.003 280) # Panels, strips
elevated → oklch(0.128 0.003 280) # Cards, side panels
overlay → oklch(0.148 0.003 280) # Modals, overlays
```

**Light mode**: `.light` class on `<html>` flips all surface/text/accent variables.

**Accent**: `--accent` (functional teal), `--accent-bright` (display teal), `--accent-dim` (hover dark).

**Typography**: Inter (body), JetBrains Mono (code), Space Grotesk (labels, `.label-caps`), Instrument Serif (landing hero italic).

**Key CSS classes**: `.nav-active`, `.status-pulse`, `.grain`, `.panel`, `.label-caps`, `.wordmark`, `.hover-lift`, `.transition-smooth`.

## Store Shape (lib/store.ts)

```typescript
{
  // View
  viewMode: "input" | "pipeline" | "analyze" | "leaderboard" | "explorer" | "ide" | "compare",
  pipelineStatus: "idle" | "input" | "analyzing" | "complete" | "error",

  // Data
  rawSequence, bases, regions, scores, analysisResult,
  candidates, activeCandidateId,
  selectedPosition, activePdb, highlightResidues,
  mutationEffect, mutationLoading,
  editHistory, savedSnapshot,

  // Streaming pipeline
  sessionId, generatingSequence, explanation,
  retrievalStatuses, generationTokenCount, completedStages,

  // UI
  chatOpen, chatMessages,
  theme: "dark" | "light",
  user: { id, name, email } | null,
}
```

## Backend Integration

**Without backend** (default): Uses Next.js API routes at `app/api/*` for mock data. Design New mode falls back to simulated pipeline.

**With mock backend**: `cd mock-backend && node server.js`, set `NEXT_PUBLIC_API_URL=http://localhost:8000`. All endpoints + WebSocket streaming.

**With real backend**: Set `NEXT_PUBLIC_API_URL=http://<gpu-ip>:8000`. Backend repo has ESMFold, Evo2, and full pipeline.

## Key Decisions
- No 1px borders — tonal shifts only (Obsidian "no-line" rule)
- Ghost borders: 0.5px oklch(1 0 0 / 0.06) where structural separation needed
- Space Grotesk for all labels/buttons (tracked uppercase, 10px)
- Landing page is always dark mode
- 3D viewer loads PDB from static file (doesn't bloat JS bundle)
- PipelineStatus has dual mode: real WS events or simulation fallback
- Views sync to URL via `?view=` search params
- Mock auth auto-signs in as "Demo User" on mount

## PR Status
- PR #2: frontend → main (open, ready for review)
- Merge main into frontend first to get backend test scripts + real PDB data:
  ```bash
  git checkout frontend && git merge main
  ```

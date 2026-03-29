# Helix Development Plan

## Team

| Person | Role | Status |
|--------|------|--------|
| Alex | Frontend (you) | Building with 3 parallel Claude agents |
| Vishnu | Backend (FastAPI + Evo2 + pipeline) | Working from BACKEND_ARCHITECTURE.md |
| Henry | Fullstack glue + demo + pitch | MIT, leaves Sun 5am |
| TBD | 4th teammate | Recruiting at YHack |

## Timeline (YHack March 28-29)

| When | What |
|------|------|
| Sat 11am | Hacking starts |
| Sat 11-12pm | Frontend agents run in parallel. Backend mock server up. |
| Sat 12-2pm | Agent outputs merged. Analyze page wired. First working demo. |
| Sat 2-4pm | Polish pass. Prototype designs integrated. Mock data tuned. |
| Sat 4-6pm | Backend real inference wired (Evo2 NIM or local). WebSocket streaming. |
| Sat 6-10pm | Integration testing. Demo rehearsal. Edge cases. |
| Sat 10pm-Sun 5am | Final polish. Recording demo video. Sleep optional. |
| Sun 8:30am | Breakfast |
| Sun 11am | Hacking stops. Video submission HARD DEADLINE. |

---

## Frontend Architecture

### Pages

```
frontend/app/
  page.tsx              # Landing page (marketing, "Get started" CTA)
  layout.tsx            # Root layout (fonts, metadata, dark mode)
  analyze/page.tsx      # Main IDE workspace (4-panel layout)
```

### Component Map

```
frontend/components/
  layout/
    AppShell.tsx         # IDE chrome: top bar, logo, model status

  sequence/
    SequenceInput.tsx    # Paste/upload sequence screen
    SequenceViewer.tsx   # Scrollable monospace base viewer with line numbers
    BaseToken.tsx        # Single nucleotide (colored, clickable, memoized)
    RegionHighlight.tsx  # Annotation overlay on the track

  annotation/
    AnnotationTrack.tsx  # Horizontal colored bar above sequence
    AnnotationLegend.tsx # Color key for region types
    LikelihoodGraph.tsx  # Per-position Evo2 score bar chart

  mutation/
    MutationPanel.tsx    # Position input + base selector + predict button
    MutationDiff.tsx     # Delta likelihood bar visualization

  structure/
    ProteinViewer.tsx    # Three.js protein backbone with pLDDT coloring
    StructureControls.tsx# Orbit, zoom, highlight, color mode

  ui/
    button.tsx           # ShadCN button (already exists)
    LoadingState.tsx     # Animated ATCG loading indicator
    Badge.tsx            # Status badges (add via shadcn)
    Tooltip.tsx          # Hover tooltips (add via shadcn)
```

### Hooks

```
frontend/hooks/
  useSequenceAnalysis.ts  # Submit sequence, manage loading/error/result
  useAnnotations.ts       # Derive regions + bases from analysis result
  useMutationSim.ts       # Submit mutation, manage prediction state
```

### Types (Source of Truth)

```
frontend/types/
  sequence.ts    # Base, Nucleotide, SequenceRegion, AnnotationType
  analysis.ts    # AnalysisResult, LikelihoodScore, MutationEffect, PredictedProtein
  structure.ts   # ProteinStructure, PDBAtom, Residue
  index.ts       # Re-exports
```

### Libs

```
frontend/lib/
  api.ts             # Fetch wrappers, maps API responses to domain types
  sequenceUtils.ts   # Pure functions: parse, validate, chunk, complement
  colorMap.ts        # Annotation/base/impact color constants
  utils.ts           # ShadCN cn() utility
```

---

## Parallel Agent Strategy

### Why 3 Agents, Not 4

The main wiring page (analyze/page.tsx) imports from all three agent domains. Editing it in parallel causes merge conflicts. Agents 1-3 build independent component trees. After they finish, one pass wires analyze/page.tsx.

### Agent 1: Landing + Shell

**Files**: `frontend/app/page.tsx`, `frontend/app/layout.tsx`, `frontend/components/layout/AppShell.tsx`, `frontend/app/globals.css`

**Deliverables**:
- Visually stunning landing page. GSAP + Framer Motion.
- Design direction: Linear/Wealthsimple. Dark warm gray. Muted teal accent. No neon.
- "Get started" CTA linking to /analyze.
- AppShell: thin top bar with logo, sequence name, model status dot.
- Smooth page transition.

**Does NOT touch**: sequence/, annotation/, mutation/, structure/, analyze/page.tsx

### Agent 2: Genome Browser (This Conversation)

**Files**: `frontend/components/sequence/*`, `frontend/components/annotation/*`, `frontend/hooks/useAnnotations.ts`, `frontend/lib/sequenceUtils.ts`, `frontend/lib/colorMap.ts`

**Deliverables**:
- SequenceViewer with GSAP base-by-base stagger reveal on load.
- Muted base colors (A=#6bbd7a, T=#d47a7a, C=#6b9fd4, G=#c9a855).
- Line numbers in left gutter, blocks of 10 with spacing.
- Click-to-select with subtle highlight. Hover underline.
- AnnotationTrack: thin horizontal bar with colored regions. Tooltips on hover.
- LikelihoodGraph: vertical bars, muted teal at 60% opacity, white on highlight.
- SequenceInput: clean centered form (Notion empty-page style). No floating DNA letters.
- Mock data constants so everything renders standalone.
- Must handle sequences up to 10,000bp performantly.

**Does NOT touch**: layout/, mutation/, structure/, app/page.tsx, analyze/page.tsx

### Agent 3: Right Panel

**Files**: `frontend/components/mutation/*`, `frontend/components/structure/*`, `frontend/components/ui/*`, `frontend/hooks/useMutationSim.ts`

**Deliverables**:
- ProteinViewer: Three.js backbone trace + CA spheres. pLDDT coloring (blue > 0.7, amber 0.5-0.7, red < 0.5). Auto-rotate. OrbitControls. Sample PDB constant for standalone render.
- MutationPanel: position input, base selector buttons (small squares, selected = white border), "Run" button, result display with large delta number and colored impact text.
- MutationDiff: animated bar from center, color by impact.
- StructureControls: icon buttons for rotate/reset/highlight.
- LoadingState: refined loading indicator.
- Add any needed ShadCN components via `npx shadcn@latest add [name]`.

**Does NOT touch**: layout/, sequence/, annotation/, app/page.tsx, analyze/page.tsx

### Post-Agent Integration (Alex manually or single agent)

After all 3 agents complete:
1. Open `frontend/app/analyze/page.tsx`
2. Wire all panels together with updated imports
3. Add Zustand store for shared state (selected position, active candidate, pipeline status)
4. Resolve any type mismatches between agent outputs
5. Test full flow: landing -> input -> analysis view with all panels

---

## Design System Reference

### Colors

| Token | Hex | Usage |
|-------|-----|-------|
| bg-primary | #0c0c0e | Page background |
| bg-panel | #131315 | Panel backgrounds |
| border | #1e1e20 | All borders, dividers |
| text-primary | #e8e8e6 | Headings, important text |
| text-secondary | #8a8a8a | Body text, descriptions |
| text-muted | #6b6b6b | Labels, captions |
| text-faint | #4a4a4a | Placeholders, line numbers |
| accent | #5bb5a2 | CTAs, active states, progress |
| base-A | #6bbd7a | Adenine |
| base-T | #d47a7a | Thymine |
| base-C | #6b9fd4 | Cytosine |
| base-G | #c9a855 | Guanine |
| impact-benign | #6bbd7a | Benign mutations |
| impact-moderate | #c9a855 | Moderate mutations |
| impact-deleterious | #d47a7a | Deleterious mutations |

### Typography

| Level | Size | Weight | Font | Color |
|-------|------|--------|------|-------|
| H1 | 28px | 500 | Inter | text-primary |
| H2 | 18px | 500 | Inter | text-primary |
| Body | 14px | 400 | Inter | text-secondary |
| Label | 12px | 400 uppercase | Inter | text-muted |
| Caption | 11px | 400 uppercase tracking | Inter | text-faint |
| Code | 13px | 400 | JetBrains Mono | text-primary |
| Line numbers | 12px | 400 | JetBrains Mono | text-faint |

### Spacing

4px rhythm: 4, 8, 12, 16, 24, 32, 48, 64, 96, 120

### Animation

- Duration: 0.2-0.3s
- Easing: cubic-bezier(0.16, 1, 0.3, 1)
- Stagger: 30ms per item
- Pattern: fade-in-up (opacity 0 -> 1, translateY 12px -> 0)
- GSAP for sequence-level timelines only
- Framer Motion for everything else

---

## Inspiration (from winning hackathon projects)

### Callio Labs (GenAI Genesis, Health Care Hack winner)
- Also genomics. Used 3Dmol for PDB, glass morphism, SSE streaming, WebGL shader bg.
- Takeaway: streaming agent steps with collapsible detail is compelling.

### Agentropolis (GenAI Genesis, Google AI Impact winner)
- Zustand with selectors. WebSocket live updates. Cinematic 3D landing.
- Takeaway: real-time state management done right at scale.

### Q-Labs (GenAI Genesis, Demos & QA winner)
- ShadCN + Tailwind 4 + OKLch. Zero border-radius. One accent color. Staggered animations.
- Takeaway: sharp, minimal, professional. Status badges with tiny colored dots.

### Common patterns across all winners
- Fast, snappy animations (not theatrical)
- One accent color doing all the work
- Staggered fade-in-up on lists/cards
- Real-time status indicators (dots, progress bars, spinners)
- Information-dense but scannable layouts
- Clean typography hierarchy with consistent spacing

---

## Checklist Before Demo

- [ ] Landing page loads, looks exceptional, links to /analyze
- [ ] Sequence input accepts paste, validates, shows example sequences
- [ ] Sequence viewer renders with colored bases, line numbers, block spacing
- [ ] GSAP stagger animation on sequence load
- [ ] Annotation track shows colored regions
- [ ] Likelihood graph shows per-position scores
- [ ] Click a base -> highlights in viewer + graph
- [ ] Mutation panel accepts position + base, shows impact result
- [ ] Protein viewer renders 3D structure with pLDDT coloring
- [ ] All panels wire together in analyze/page.tsx
- [ ] Mock data produces a convincing demo flow
- [ ] Build passes, no TypeScript errors
- [ ] Committed and pushed

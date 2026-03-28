# Helix

## What This Is

Helix is a collaborative genomic design IDE. Researchers type a plain English design goal and the system generates, scores, folds, and explains candidate DNA sequences in real time. Powered by Evo 2 (Arc Institute, 40B parameters, 9 trillion base pairs, Nature 2026) and AlphaFold 3.

Pitch: "Cursor for DNA." Drug discovery takes 5-10 years and $2.6B. The sequence design phase alone takes weeks of manual work. Helix compresses it to minutes.

## Repo Structure

```
Helix/
  frontend/          # Next.js 16 app (all frontend code lives here)
    app/             # Next.js app router pages
    components/      # UI components by domain
    hooks/           # Custom hooks for async logic
    types/           # Domain type definitions (source of truth)
    lib/             # API wrappers, utilities, constants
  BACKEND_ARCHITECTURE.md   # Full backend spec for Vishnu
  CLAUDE.md                 # This file
```

## Tech Stack (Frontend)

- Next.js 16, React 19, TypeScript 5.9
- ShadCN/UI (component library, already initialized)
- Tailwind CSS 4 with OKLch color tokens
- Framer Motion (panel transitions, entrance animations)
- GSAP (sequence timeline, base-by-base reveal)
- Three.js + React Three Fiber + Drei (3D protein viewer)
- Zustand (shared pipeline state)
- Lucide React (icons)

## Design Direction

NOT sci-fi. NOT neon gradients. Think Linear meets Bloomberg terminal.

- Dark warm gray backgrounds (#0c0c0e, #131315, #1e1e20). Not pure black.
- White text (#e8e8e6), warm gray secondary (#8a8a8a), muted (#6b6b6b, #4a4a4a)
- One accent: muted teal (#5bb5a2). Used sparingly for active states and CTAs.
- Color carries meaning, not decoration. Bases are colored because that is data. Everything else is grayscale.
- Base colors (muted, not neon): A=#6bbd7a, T=#d47a7a, C=#6b9fd4, G=#c9a855
- Generous whitespace. 16px/24px/32px spacing rhythm.
- Sans-serif: Inter. Monospace: JetBrains Mono. One family each.
- Typography: 24px headings, 14px body, 12px labels, 11px captions.
- Minimal border-radius (rounded-md max). Clean, sharp.
- Animations: fast (0.2-0.3s), cubic-bezier(0.16, 1, 0.3, 1). Staggered fade-in-up.

## Architecture Principles

- SOLID. One component = one concern.
- No `any` types.
- No fetch logic inside components. Use hooks.
- No nested ternaries in JSX.
- API responses mapped to domain types at the boundary (hooks/lib), never inside components.
- Components depend on typed interfaces in /types, not on API shapes.
- Extend via composition, not internal conditionals.

## State Management

- Zustand for shared pipeline/session state (selected candidate, pipeline status, active position).
- Local useState for component-internal state (form inputs, hover).
- Zustand selectors to prevent unnecessary re-renders: `useStore((s) => s.field)`.

## Agent Ownership (Do Not Cross Boundaries)

Three agents work in parallel. Each owns specific files. Do not edit files outside your scope.

**Agent 1 (Landing + Shell)**: `frontend/app/page.tsx`, `frontend/app/layout.tsx`, `frontend/components/layout/*`, `frontend/app/globals.css` (add only, don't remove)

**Agent 2 (Genome Browser)**: `frontend/components/sequence/*`, `frontend/components/annotation/*`, `frontend/hooks/useAnnotations.ts`, `frontend/lib/sequenceUtils.ts`, `frontend/lib/colorMap.ts`

**Agent 3 (Right Panel)**: `frontend/components/mutation/*`, `frontend/components/structure/*`, `frontend/components/ui/*`, `frontend/hooks/useMutationSim.ts`

**Shared (no agent edits without coordination)**: `frontend/app/analyze/page.tsx`, `frontend/types/*`, `frontend/lib/api.ts`, `frontend/hooks/useSequenceAnalysis.ts`

## Commit Conventions

- No Claude attribution. No co-author lines. No AI mentions.
- Short imperative subjects. Body only if needed.

## Backend (Vishnu's Domain)

See BACKEND_ARCHITECTURE.md. FastAPI + Celery + Redis pipeline. WebSocket streaming. Two edit loop paths (base pair re-score vs NL partial re-run). ASUS Ascent GX10 with 128GB LPDDRX for local Evo2 7B inference.

## Prize Tracks (YHack 2026)

Targeting: Grand Prize, Societal Impact (ASUS), Best UI/UX, Most Creative.

# Helix - Genomic Development Environment

## Project Overview
Helix is a genomic IDE powered by Evo 2 (Arc Institute's 40B-parameter genomic foundation model) and AlphaFold. Researchers paste a genomic sequence and get functional annotation, mutation prediction, protein structure preview, and a debugger view.

## Tech Stack
- Next.js (latest), TypeScript, React
- Framer Motion (panel transitions, UI animations)
- GSAP (sequence timeline animations, base-by-base reveal)
- Three.js (3D protein structure rendering)
- Tailwind CSS (layout)

## Architecture Principles (SOLID)
- **Single Responsibility**: One component = one concern. SequenceViewer renders, it does not fetch.
- **Open/Closed**: Extend via composition and new variants, not internal conditionals.
- **Liskov Substitution**: Any SequenceRegion subtype works anywhere SequenceRegion is expected.
- **Interface Segregation**: Narrow props. Pass only what the component uses.
- **Dependency Inversion**: Components depend on typed interfaces in /types, not API response shapes.

## Code Conventions
- No global state managers (no Zustand, no Context for data flow)
- No `any` types
- No fetch logic inside components (use hooks)
- No nested ternaries in JSX
- State co-located at lowest common ancestor (analyze/page.tsx)
- API responses mapped to domain types at the boundary (hooks/lib), never inside components
- Do NOT add Claude attribution to commit messages

## Key Directories
- `/app` - Next.js app router pages
- `/components` - UI components organized by domain
- `/hooks` - Custom hooks for async logic
- `/types` - Domain type definitions (source of truth)
- `/lib` - API wrappers, utilities, constants

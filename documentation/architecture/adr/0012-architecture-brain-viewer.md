# ADR 0012: 3D architecture brain with three.js, shared by CodeAtlas and ArchLens

- Status: accepted
- Date: 2026-11-08
- Deviation from spec: none. The spec calls CodeAtlas the "Architecture Brain"; this adds a literal brain view of the index.

## Context

The founder asked for an architecture brain that looks and works like a human brain: the repository divided into lobes (frontend, backend, database, DevOps), each lobe opened by clicking it, and inside it every class and method with its inputs, output, callers and callees. The same result is expected from the ArchLens skill (given a repository link) and from CodeAtlas.

CodeAtlas already had 2D graphs (cytoscape, React Flow). ArchLens produced Markdown reports only.

## Decisions

1. **One shared package, `packages/brain`.** It holds the data model (`BrainModel`, format 1) with a validator, path and import heuristics that place code in a lobe, a deterministic layout, a relation index with search, and the viewer. Products import it; it imports no product (CLAUDE.md §8).
2. **three.js 0.186.1 (MIT) for the 3D view** (research R19). It renders thousands of points and lines with WebGL, has orbit controls in its examples, and has no runtime dependencies. A game engine or a React 3D wrapper would add size and a framework without need. The viewer is plain DOM and TypeScript so the same code works in the React app and in a standalone page.
3. **A single self-contained HTML file** is the output for ArchLens and the CodeAtlas CLI. Vite builds the viewer as one IIFE, and `scripts/make-template.mjs` inlines it into `template/brain-template.html` with a JSON data placeholder. `renderBrainHtml` (and the dependency-free `render-brain.mjs` shipped with the skill) puts a model into it, escaped so it cannot close its script element. The page works offline and needs no server.
4. **Lobes are an inference.** Every neuron carries the reason it was placed where it is, and the viewer labels the placement as inferred. Synapses keep CodeAtlas's observed / inferred / unknown confidence and their file and line.
5. **CodeAtlas records parameter and return types** for functions and methods from the TypeScript checker (`params`, `returns`, `returnsDeclared`). The TypeScript cache format moves to 2 so old cached analyses are rebuilt.
6. **CodeAtlas caps the brain at 6,000 neurons**, keeping the most connected ones, and says so in the model's notes. The validator accepts up to 20,000.

## Consequences

- The viewer needs WebGL. Without it the region lists, search and details still work, and the page says the 3D view is unavailable.
- The CodeAtlas Brain tab loads three.js (about 150 kB gzip) only when opened.
- `skills/archlens/assets/brain-template.html` and `skills/archlens/scripts/render-brain.mjs` are generated copies; a unit test fails if they drift from `packages/brain`.
- Method-level inputs and outputs exist for TypeScript and JavaScript (CodeAtlas) or for whatever ArchLens read by hand, and nowhere else.

# ADR 0007: Index with the TypeScript Compiler API and label confidence on every edge

- Status: accepted
- Date: 2026-11-01

## Context

Regex or tree-sitter indexing cannot resolve imports through path aliases or calls through types. Users need to know which facts are certain.

## Decision

Build a `ts.Program` per tsconfig group and use the type checker to resolve symbols. Edges resolved by the checker are `observed`; heuristic edges (unique-name fallback, framework conventions) are `inferred`; the rest are recorded as unresolved/`unknown` with reasons. Every edge stores evidence path and line.

## Consequences

Indexing is slower than syntactic parsing and limited to TS/JS. Large repos need the file and size limits. Re-index is full, not incremental.

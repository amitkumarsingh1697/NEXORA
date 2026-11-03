# ADR 0004: Deterministic first, local model optional, hosted model only with consent

- Status: accepted
- Date: 2026-11-01

## Context

Resumes and source code are private. Hosted LLMs cost money and move data off-device. Models can hallucinate.

## Decision

Parsing, evidence, scoring and retrieval are deterministic. A `ModelProvider` interface supports Ollama (default, local), an OpenAI-compatible endpoint (refuses to run unless `AI_REMOTE_CONSENT=true`) and a disabled provider. Model output must validate against a zod schema and pass grounding/fabrication checks, otherwise it is discarded and the deterministic result is used.

## Consequences

Every feature works with AI disabled. Model quality affects phrasing only.

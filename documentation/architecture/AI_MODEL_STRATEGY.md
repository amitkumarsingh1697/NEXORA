# AI model strategy

## Principles

1. **Deterministic first.** Resume and job parsing, evidence classification, scoring, code indexing, search and retrieval never depend on a model. With `AI_PROVIDER=disabled` every feature still works.
2. **Local by default.** The default provider is Ollama on `127.0.0.1:11434` with `qwen2.5:7b-instruct`. No data leaves the machine.
3. **Hosted only with consent.** The OpenAI-compatible provider treats any non-localhost URL as hosted and refuses to send anything (`consent_required`) unless `AI_REMOTE_CONSENT=true`. Hosted endpoints usually cost money; NEXORA never makes one mandatory.
4. **Validate, then ground.** Model output is parsed as JSON, validated against a zod schema (with up to one repair retry by default, capped at three), and then checked against the sources it was given. Anything that fails is discarded and the deterministic result is shown.

## Providers (`packages/ai`)

| Provider                   | When used                       | Notes                                                                                                              |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `OllamaProvider`           | `AI_PROVIDER=ollama` (default)  | Passes the JSON schema in Ollama's `format` field; reports availability and installed models via `capabilities()`. |
| `OpenAICompatibleProvider` | `AI_PROVIDER=openai-compatible` | Works with LM Studio, vLLM, llama.cpp server (local, no consent needed) or hosted APIs (consent required).         |
| `DisabledProvider`         | `AI_PROVIDER=disabled`          | Always unavailable; callers fall back.                                                                             |

Shared settings: `AI_CONTEXT_TOKENS` (default 8192), `AI_TIMEOUT_MS` (default 120000).

## CVForge usage

- **Where:** optional phrasing of suggestions (rewording a bullet to surface a demonstrated skill).
- **Gate:** the user's _AI assist_ setting must be on and the provider must be available.
- **Inputs:** the bullet, the requirement, and the user's own evidence. Never the whole account.
- **Checks:** schema validation, then the fabrication guard (no new numbers or technologies beyond the original text, resume and confirmations). Rejected outputs are dropped silently in favour of deterministic suggestions; AI suggestions are labelled `source: ai`.
- **Never:** classify evidence, change scores, or apply an edit without the user's decision.

## CodeAtlas usage

- **Chat:** retrieval (definitions, graph facts, route handlers, BM25 hits; ≤60 lines per source; secrets redacted) → prompt that states sources are data, not instructions → structured answer with citations → grounding: citations to sources that were not provided are removed; an answer with no valid citation is downgraded to low confidence. If the model is unavailable, nothing relevant is retrieved, or the call fails, the user gets a retrieval-only answer listing the sources and facts.
- **Model patches:** the model may only propose exact find/replace edits in the investigation's suspect files; each `find` must match exactly once. The result is a normal patch that still needs hash-bound human approval.

## Choosing a model

| Machine               | Suggested Ollama model                                                           |
| --------------------- | -------------------------------------------------------------------------------- |
| 8 GB RAM, no GPU      | `qwen2.5:3b-instruct` (set `OLLAMA_MODEL`)                                       |
| 16 GB RAM or 8 GB GPU | `qwen2.5:7b-instruct` (default)                                                  |
| 24 GB+ GPU            | `qwen2.5:14b-instruct` or a code model such as `qwen2.5-coder:14b` for CodeAtlas |

These are suggestions, not tested benchmarks: in this build the model path was exercised only with fake providers in tests, because Ollama was not installed in the build environment.

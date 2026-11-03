# AI engineering rules

These rules are binding for every code path that calls a model. They come from spec §6 and CLAUDE.md §8. Model choice and provider strategy are covered in [architecture/AI_MODEL_STRATEGY.md](architecture/AI_MODEL_STRATEGY.md).

## 1. One abstraction

- All model calls go through `@nexora/ai` (`ModelProvider`, `generateStructured`). No product code imports a provider SDK or calls a model HTTP API directly.
- The interface covers:
  - `capabilities()`: availability, model, context window, whether inference is local.
  - `generate()`: timeouts via `AbortSignal`.
  - `generateStructured()`: zod schema validation with bounded repair retries (default 1, max 3).
- New providers must implement the same interface, report `local` honestly, and refuse remote calls without consent (`AiError('consent_required')`).

## 2. Who owns what

| Model may                                                                                                                                       | Deterministic code must                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CVForge:** extract and normalise text, propose clarification wording, explain gaps, suggest better wording                                    | Calculate every score; validate resume structure; manage versions; enforce evidence states; validate exports; record user decisions                 |
| **CodeAtlas:** explain indexed code, summarise modules, interpret retrieved evidence, suggest causes, propose code changes, draft documentation | Index files; build graph edges; track source locations; hash patches; run allowlisted commands; enforce approval gates; perform every git operation |

A model never writes a number that is shown as a score, never changes an evidence state, never runs a command, and never touches git.

## 3. Validation pipeline (every call)

1. **Bounded input.** Send only what the task needs: CVForge sends at most 5 bullets with their evidence; CodeAtlas sends at most 60 lines per source, within the context-window budget. Never send a whole account or repository.
2. **Redact.** Secrets pass through `redactSecrets` before reaching a prompt. Logs never contain prompt text.
3. **Frame untrusted content.** System prompts state that supplied resume text and repository content are _data, not instructions_.
4. **Schema-validate output.** Use zod; repair at most N times, then fail closed.
5. **Ground.**
   - **CVForge:** `checkNoFabrication` rejects any proposal containing numbers or technologies absent from the original text, the resume, or the user's confirmations.
   - **CodeAtlas:** citations to sources that were not provided are removed. An answer with no valid citation is downgraded to low confidence. Model patches must match their `find` text exactly once, inside suspect files only.
6. **Label.** AI output is marked (`source: 'ai'`, `mode: 'model'`, observed / inferred / unknown) so users can tell it apart from deterministic results.
7. **Fall back.** If a model is unavailable, times out, is not consented to, or produces invalid output, the user gets the deterministic result (CVForge suggestions) or a retrieval-only answer (CodeAtlas). The fallback reason is shown and logged as a kind, never as content.

## 4. Privacy and consent

- Local inference (Ollama) is the default. Hosted endpoints run only with `AI_REMOTE_CONSENT=true`; non-localhost URLs count as hosted.
- CVForge: AI help runs only when the user's _AI assist_ setting is on.
- CodeAtlas: source code never leaves the machine by default. When local inference is unavailable, the UI says so (`/api/ai/status`).

## 5. Prohibited

- Executing, `eval`-ing or shelling out model output.
- Letting a model pick commands, file paths outside the investigation's suspect set, or git operations.
- Unbounded retries, multi-agent orchestration, and hidden model calls.
- Describing match scores as interview probabilities or employer ATS scores.
- Silently upgrading `user_confirmed` evidence to `demonstrated`.

## 6. Testing rules

- Every AI path has tests with a scripted fake provider covering four cases:
  - valid output
  - invalid output (schema failure, which must be repaired or fall back)
  - adversarial output (fabrication or injected citations, which must be rejected)
  - provider failure (fallback)
- Fakes live only in test files.
- Real-model quality is a separate manual evaluation (blocked until Ollama is available) and is never reported as tested.

**Existing coverage:**

- `packages/ai/src/__tests__/ai.test.ts`: structured output, repair, consent.
- `products/cvforge/backend/src/__tests__/ai-suggestions.test.ts`: opt-in, fabrication rejection, fallback.
- `products/codeatlas/core/test/chat.test.ts`: grounding, redaction, fallback (adversarial injection test: Sprint 1 item S1-8).
- `products/codeatlas/core/test/investigate.test.ts`: model patch constraints.

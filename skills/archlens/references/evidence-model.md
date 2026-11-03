# Evidence model

ArchLens uses three labels, the same ones CodeAtlas stores on every graph edge.

## [observed]

You read the text that establishes the fact, in this session, at a specific location.

- Cite `path:line` for a single line, `path:start-end` for a range, `path` for a whole-file fact (for example "this package has no dependencies").
- A resolved import is observed: `import { x } from './y'` at `a.ts:3`, plus `export function x` at `y.ts:10`.
- Configuration is observed only for what it literally says. "The Dockerfile exposes port 8080" is observed; "the service listens on 8080 in production" is inferred.
- A test asserting behaviour is observed evidence of **intended** behaviour, not of production behaviour.

## [inferred]

A reasonable conclusion from observed facts. Always name the basis.

Typical inferred facts:

- Name-based links ("`UserService` is probably used by `UserController`") when the import is not resolved.
- Framework conventions: Next.js `app/**/route.ts` handlers, Spring `@RestController`, Express `app.get(...)`. The convention is the basis.
- Dynamic dispatch, dependency injection containers, reflection, event buses, string-keyed handlers.
- The purpose of a module, from its exports and callers.
- Runtime topology, from deployment manifests.

Write it as: "[inferred] X, because A (`path:line`) and B (`path:line`)."

## [unknown]

Not determinable from what is available. Always say what would resolve it:

- A file to read.
- A command to run, which the user runs or approves.
- A person or system to ask.

Common unknowns:

- Behaviour of external services and third-party APIs.
- Production configuration not in the repository (secrets, feature flags, environment variables).
- Generated code that is not checked in.
- Why a design was chosen, unless an ADR, commit message or doc says so.
- Whether dead-looking code is used via reflection or external callers.

## Confidence wording

Do not use percentages. Use the label, plus at most a short qualifier ("strongly inferred: three independent call sites").

## Mixed claims

Split them: "[observed] `auth.ts:12` checks the session cookie; [inferred] every route under `app/api` is protected, because each handler wraps `withUser` (sampled 5 of 23); [unknown] for the remaining 18."

## Sampling

If you sample instead of reading everything, say so and give the ratio. Never generalise from a sample without marking the conclusion [inferred].

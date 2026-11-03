# CLAUDE.md: Nexora engineering governance

Nexora is the umbrella brand. This monorepo contains:

| Name                                                                 | What it is                                                    | Code                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| **CVForge** (Nexora Career, "Resume Intelligence" in the spec)       | Resume intelligence: web app, MV3 extension, Postgres backend | `products/cvforge/*`   |
| **CodeAtlas** (Nexora Engineering, "Architecture Brain" in the spec) | Local-first code intelligence: local service, web UI, indexer | `products/codeatlas/*` |
| **ArchLens**                                                         | Claude Code skill for evidence-labelled architecture work     | `skills/archlens/`     |

**Source of truth:** [documentation/product/MASTER_SPECIFICATION.md](documentation/product/MASTER_SPECIFICATION.md). When this file and the specification differ, the specification wins, unless an accepted ADR records the deviation and the reason for it.

## 1. Primary principle

Build only what explicit requirements, verified technical capabilities and tested implementation support. Correctness matters more than speed or the appearance of completeness.

Never invent API methods, library capabilities, package versions, database schemas, test results, external integrations, product capabilities, performance measurements or security guarantees. Label anything unknown as unknown.

## 2. Governance files (keep current)

| File                                                            | Purpose                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `documentation/RESEARCH_AND_ASSUMPTIONS.md`                     | Each research question with its finding, source URL, version, date checked, confidence, impact and remaining uncertainty |
| `documentation/REQUIREMENTS_TRACEABILITY.md`                    | Requirement ID → code → tests → status                                                                                   |
| `documentation/IMPLEMENTATION_STATUS.md`                        | Single tracker: not started / in progress / implemented / tested / blocked                                               |
| `documentation/SPRINT_PLAN.md`                                  | Sprints with scope, exclusions, acceptance criteria and evidence                                                         |
| `documentation/DEFINITION_OF_DONE.md`                           | When a task, sprint or release counts as done                                                                            |
| `documentation/AI_ENGINEERING_RULES.md`                         | Model boundaries and validation rules                                                                                    |
| `documentation/SECURITY_THREAT_MODEL.md`                        | Threats, mitigations, tests, residual risk                                                                               |
| `documentation/RISK_REGISTER.md`                                | Delivery, technical, security and commercial risks                                                                       |
| `documentation/RELEASE_READINESS.md`                            | Spec §17 acceptance criteria, each with its evidence                                                                     |
| `documentation/architecture/ARCHITECTURE_DECISIONS.md` + `adr/` | Significant decisions and deviations from the spec                                                                       |

## 3. Research before implementation

Before using an unfamiliar library, API, protocol or platform capability:

1. Identify the exact technology and version (the lockfile is authoritative).
2. Check sources in this order: official docs, official source code (including the installed package in `node_modules`), release notes, standards, reputable references. Community posts are supplementary only.
3. Record the question, finding, source URL, version, date, confidence, impact and remaining uncertainty in RESEARCH_AND_ASSUMPTIONS.md.
4. If a capability cannot be confirmed, either prove it with an executed test, or treat it as unsupported.

Never claim research was done if no source was checked.

## 4. Status vocabulary (never interchangeable)

- **Implemented:** the behaviour exists in code. A UI on its own does not count.
- **Tested:** the relevant automated tests ran and passed. Record the command and date.
- **Verified:** checked manually or in a real environment (for example a live job site or a real Ollama model).
- **Release-ready:** every applicable acceptance criterion in RELEASE_READINESS.md has passed.
- **Blocked:** an external dependency prevents progress. A blocked item is never "done".

## 5. No fake implementations

Prohibited: fake API responses in production paths, hardcoded scores, mock data shown as real, buttons that look functional but are not, simulated authentication or uploads, fake AI results, empty handlers, TODOs standing in for required behaviour, and catch blocks that swallow errors.

Mocks and fakes belong only in tests or in clearly labelled demo environments. In this repo the only fakes are model providers inside test files.

## 6. Workflow per change

1. Inspect the current code, its dependencies and its tests. Make the smallest reasonable change; no broad rewrites to fix narrow defects.
2. Write or extend tests first, covering normal and edge cases.
3. Implement.
4. Run `pnpm check` (typecheck + lint + all tests) and `pnpm format:check`. When a user journey changes, also run the relevant Playwright suite.
5. Update traceability, implementation status and any docs the change affects.
6. Never weaken or delete a test to get a pass. If a test cannot run, report the exact blocker and mark the feature unverified.

## 7. Commands

```bash
pnpm install
sudo service postgresql start          # or: docker compose -f infrastructure/local-development/docker-compose.yml up -d
pnpm --filter @nexora/cvforge-backend db:migrate
pnpm check                             # typecheck + lint + unit/integration tests
pnpm format:check
pnpm --filter @nexora/cvforge-web e2e
pnpm --filter @nexora/codeatlas-web build && pnpm --filter @nexora/codeatlas-web e2e
pnpm audit --prod
pnpm --filter @nexora/cvforge-web dev          # http://localhost:3000
pnpm --filter @nexora/codeatlas-service start  # http://127.0.0.1:4317/#token=…
```

Gotcha: `pkill -f <pattern>` also matches its own shell command line. Use a bracket pattern such as `pkill -f "[s]rc/cli.ts serve"`.

## 8. Architecture rules

- Products never import each other. Shared code goes in `packages/*` only.
- Domain logic lives in `products/*/core` (pure). Persistence and policy live in services (`cvforge/backend`, `codeatlas/core` store and workflow). UI and route handlers stay thin. No SQL in UI components.
- Before adding a dependency, check whether an existing one already solves the problem, then check its maintenance, licence, compatibility, security and size. Pin exact versions and record the reason.
- No microservices, queues, vector databases, graph databases or agent frameworks without a demonstrated requirement and an ADR.

## 9. AI reliability

Read `documentation/AI_ENGINEERING_RULES.md` before touching any code path that calls a model. In short:

- Model output is untrusted: validate it against a schema, ground it, and never execute it.
- Deterministic code owns scores, evidence states, versions, indexing, hashes, approvals and git.
- No private data or source code goes to a hosted model without explicit consent.

## 10. Security

- Validate every input at the boundary (zod). Enforce authorisation server-side, or in the trusted local service, never only in the UI.
- Never log passwords, tokens, cookies or resume or job content. Log ids and counts only.
- Do not overwrite user files. Make no destructive git operations without explicit approval.

## 11. Founder rules (verbatim intent from the spec, §18)

- Do not commit or push unless explicitly asked.
- Do not deploy publicly, buy domains, or create paid resources without authorisation.
- Do not make a paid service mandatory. Name any cost and ask first.
- Do not silently omit a requirement. If something is infeasible, explain the constraint and build the best safe alternative.
- Do not ask about things the specification already answers. Continue through sprints without waiting for approval between ordinary stages.

## 12. Sprint reporting

At the end of each sprint, report:

- What was built and which requirement IDs it covers.
- Files changed.
- Tests actually executed, with their results.
- Known defects, unverified functionality and security concerns.
- Remaining work and the recommended next sprint.

# Playbooks

Each playbook gives its steps and output. Always finish with the Coverage section from [report-templates.md](report-templates.md).

## Map: "What is this repository and how is it structured?"

1. Top-level listing; identify the workspace manager (pnpm/npm/yarn workspaces, Maven/Gradle modules, Go modules, Python packages).
2. Read every manifest: `package.json`, `pom.xml`, `build.gradle*`, `go.mod`, `pyproject.toml`, `Cargo.toml`, `*.csproj`.
3. Find entrypoints:
   - servers (`main`, `server`, `app`)
   - CLIs (`bin`)
   - workers and cron jobs
   - framework routes
   - Dockerfile `CMD`
   - CI jobs
4. Read architecture docs and ADRs, if present. Note where they disagree with code (drift).
5. Build the module table:

   | Column         | Content                             |
   | -------------- | ----------------------------------- |
   | Module         | Name                                |
   | Responsibility | [inferred] from exports and callers |
   | Depends on     | Resolved imports between modules    |
   | Evidence       | Citations                           |

6. Draw a dependency list or mermaid diagram from **resolved** imports only. Mark inferred edges as dashed or label them.

Output: Summary, System map, Coverage.

## Trace: "How does X flow?"

1. Pick one concrete example (a route, a CLI command, a message type). If the user did not name one, propose one.
2. Start at the entrypoint and follow each hop, citing the call site and the definition.
3. Mark each hop: [observed] for a resolved call, [inferred] for DI or convention, [unknown] for runtime or external.
4. Note where data is validated, authorised, persisted and returned.
5. Stop at external boundaries (database, HTTP client, queue). Name what crosses them.

Output: numbered flow with labels, plus an "Unresolved hops" list.

## Impact: "What breaks if I change X?"

1. Locate X's definition. List its exported surface.
2. Find direct references (`Grep` for the symbol, then confirm each by reading the import).
3. Follow callers transitively to entrypoints (routes, jobs, public APIs) and to tests.
4. Classify each dependent:
   - **compile-time break**: signature change
   - **behavioural risk**: semantics change
   - **unaffected**: with a reason
5. List tests that cover the change, and the gaps.

Output: Impact table (Dependent | Path | How it depends | Break type | Covered by test?), then recommended verification steps.

## Assess: "Review the architecture / where are the risks?"

1. Run Map first if it has not been done.
2. Apply the heuristics in [risk-heuristics.md](risk-heuristics.md). Each finding needs evidence and a limitation.
3. Rank by impact × likelihood. Give the smallest effective recommendation and an effort (S/M/L).

Output: Risks and recommendations table, then Unknowns.

## Investigate: "Why does X happen?"

1. Restate the symptom, expected behaviour, and reproduction (or [unknown] if not given).
2. Locate candidate code: error messages, route, symbol names from the report.
3. Form hypotheses. For each, list the confirming and refuting evidence you have read.
4. Name the most likely root cause, labelled. Never present a hypothesis as confirmed without evidence.
5. Propose a fix only as a diff for review (see [safe-change-protocol.md](safe-change-protocol.md)), with:
   - the tests to run
   - the risks
   - rollback (`git revert <sha>`)

Output: structured bug report:

- Symptom
- Evidence
- Hypotheses (ranked)
- Likely root cause
- Proposed fix (diff)
- Validation plan
- Risks
- Rollback

## Change: "Change X"

Follow [safe-change-protocol.md](safe-change-protocol.md) exactly.

## Onboard: "Help me get started"

1. Run Map at a high level (module table, top 3 flows).
2. Find the commands for setup, test, lint and run (README, manifests, CI). Mark each [observed] with its source.
3. Suggest a reading order: entrypoint, then the core domain module, then persistence, then tests for the core module.
4. List open questions for a teammate ([unknown]s).

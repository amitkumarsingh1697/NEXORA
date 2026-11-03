# Risk heuristics

Each heuristic lists the signal to look for, how to gather evidence, and what the evidence cannot prove. Report every finding with all three: signal, evidence, limitation.

| Heuristic                       | Signal                                                                                            | Evidence to gather                                                | Limitation to state                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Circular dependencies           | Module A imports B and B imports A, directly or through a chain                                   | The import lines forming the cycle                                | Type-only imports may be harmless at runtime                 |
| God module                      | High fan-in **and** high fan-out; many unrelated exports                                          | Counts of importers and imports; export list                      | Utility modules legitimately have high fan-in                |
| Layer violation                 | UI imports persistence; domain imports framework                                                  | The offending import                                              | Layers must be [inferred] unless documented                  |
| Missing tests on critical paths | Auth, payments, persistence or permission code with no test referencing it                        | Search tests for the symbol or file                               | Tests may cover it indirectly through integration tests      |
| Complexity hotspot              | Long functions, deep nesting, many branches                                                       | Line counts; branch keywords in the function                      | Complexity alone is not a defect                             |
| High churn                      | File changed very often (`git log --format= --name-only` counts, if the user runs or approves it) | Commit counts and window                                          | Churn can reflect active development, not instability        |
| Security boundary gaps          | Routes without auth wrappers; unvalidated input reaching SQL/shell/filesystem; secrets in config  | Handler code; validation calls; config lines (never print values) | Middleware or a gateway may enforce it elsewhere ([unknown]) |
| Unsafe execution                | `exec`/`spawn` with a shell, `eval`, dynamic `require` of user input                              | Call sites                                                        | Inputs may be constant; check them                           |
| Data ownership conflict         | Two modules write the same table or collection                                                    | Write call sites                                                  | Ownership intent is usually [unknown]                        |
| Doc drift                       | README or ADR says X; code does Y                                                                 | Both citations                                                    | Docs may describe a planned state                            |
| Unresolved references           | Dynamic imports, DI tokens, string dispatch                                                       | Call sites                                                        | Runtime may resolve them; mark [unknown]                     |
| Sensitive configuration         | Files that look like `.env`, keys or credentials; tokens in config                                | Path only, never contents                                         | May be test fixtures; say so if they look like it            |

## Ranking

Impact (1–3) × likelihood (1–3). Show the score. Do not rank on gut feel.

## Recommendations

Prefer the smallest change that removes the risk. Name what to verify first, and give effort as S (< ½ day), M (≤ 3 days) or L (more).

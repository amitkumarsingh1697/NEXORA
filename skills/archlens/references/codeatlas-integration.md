# Using CodeAtlas as an evidence source

CodeAtlas is Nexora's local architecture service. When it is running (by default at `http://127.0.0.1:4317`, token in `~/.codeatlas/token`), ArchLens can use its index instead of re-deriving everything by hand.

## Mapping

| CodeAtlas                   | ArchLens use                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Edge `confidence: observed` | [observed], cite `evidence_path:evidence_line` and the index revision                   |
| Edge `confidence: inferred` | [inferred], basis is the edge `detail`                                                  |
| Unresolved list             | [unknown] items                                                                         |
| Coverage report             | Coverage section (files indexed and skipped, parse failures, limitations)               |
| Risk view                   | Starting points for the Assess playbook. Re-check each finding in source.               |
| Ownership view              | Signal only, never proof of ownership                                                   |
| Investigation workflow      | Preferred path for Change: isolated worktree, allowlisted commands, hash-bound approval |

## Read-only endpoints

All require the header `x-codeatlas-token`:

- `GET /api/repos`: registered repositories and latest coverage.
- `GET /api/repos/:id/views/{modules,dependencies,risk,ownership,knowledge}`
- `GET /api/repos/:id/search?q=`
- `GET /api/repos/:id/nodes/:nodeId`
- `GET /api/repos/:id/source?path=&start=&end=`

Calling these needs a tool such as `Bash(curl ...)`, which is not pre-approved by this skill. Ask the user before using it, or ask them to paste the output.

## Rules

- The index reflects one revision. If the working tree has moved on, say so and re-read the files you cite.
- Re-read the source for any finding that drives a recommendation.
- Never start investigations, approve patches or merge through CodeAtlas on the user's behalf. Those steps belong to the user in the CodeAtlas UI.

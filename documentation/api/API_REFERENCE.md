# API reference

All endpoints exchange JSON unless noted. Errors use one shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Human-readable message", "details": null } }
```

| Code                | HTTP | Code                  | HTTP |
| ------------------- | ---- | --------------------- | ---- |
| `VALIDATION_FAILED` | 400  | `PAYLOAD_TOO_LARGE`   | 413  |
| `UNAUTHENTICATED`   | 401  | `UNSUPPORTED_MEDIA`   | 415  |
| `FORBIDDEN`         | 403  | `PRECONDITION_FAILED` | 412  |
| `NOT_FOUND`         | 404  | `RATE_LIMITED`        | 429  |
| `CONFLICT`          | 409  | `UNAVAILABLE`         | 503  |
| `INTERNAL`          | 500  |                       |      |

---

## CVForge (`http://localhost:3000/api`)

**Authentication.** Web routes use the `HttpOnly` session cookie set by login/signup. Every state-changing cookie request must carry an `Origin` (or `Referer`) matching `APP_ORIGIN`, otherwise `403`. Extension routes marked **ext** use `Authorization: Bearer ext1.…` and no cookies. Resources belonging to another user return `404`.

### Health and AI

| Method | Path         | Notes                                                                                        |
| ------ | ------------ | -------------------------------------------------------------------------------------------- |
| GET    | `/health`    | Public. `{ status: "ok" }`, or `503` with `{ status: "degraded", database: "unreachable" }`. |
| GET    | `/ai/status` | Provider, model, availability, whether hosted.                                               |

### Auth and account

| Method       | Path                 | Body / result                                                                                                   |
| ------------ | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| POST         | `/auth/signup`       | `{ email, password, displayName?, acceptPrivacy: true }` → sets session cookie                                  |
| POST         | `/auth/login`        | `{ email, password }` → sets cookie. Rate-limited: 10 per 15 min per email and per IP                           |
| POST         | `/auth/logout`       | Revokes the current session                                                                                     |
| GET          | `/auth/me`           | Current user                                                                                                    |
| POST         | `/auth/forgot`       | `{ email }` → always `200` (no account enumeration); 5 per hour                                                 |
| POST         | `/auth/reset`        | `{ token, password }` (token valid 30 min, single use; revokes all sessions)                                    |
| POST         | `/auth/password`     | `{ currentPassword, newPassword }`                                                                              |
| GET / DELETE | `/auth/sessions`     | List sessions / revoke all other sessions                                                                       |
| DELETE       | `/auth/sessions/:id` | Revoke one                                                                                                      |
| PUT          | `/account/settings`  | `{ displayName?, country?, careerStageOverride?: early\|mid\|senior\|lead\|executive\|null, aiAssistEnabled? }` |
| GET          | `/account/storage`   | Bytes used and quota                                                                                            |
| GET          | `/account/export`    | Download all account data as JSON (attachment)                                                                  |
| POST         | `/account/delete`    | `{ password, confirm: "DELETE" }` → deletes everything, clears cookie                                           |

### Resumes and versions

| Method       | Path                          | Body / result                                                                                                                                              |
| ------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET          | `/resumes`                    | List                                                                                                                                                       |
| POST         | `/resumes`                    | `multipart/form-data`: `file` (PDF or DOCX, ≤ 10 MB, type checked from bytes), `title?` → `{ resumeId, versionId, confidence, warnings, unassignedLines }` |
| GET / DELETE | `/resumes/:id`                | Resume with document metadata and versions / delete                                                                                                        |
| GET          | `/resumes/:id/original`       | Download the uploaded file                                                                                                                                 |
| GET          | `/versions/:id`               | Version content                                                                                                                                            |
| PUT          | `/versions/:id`               | `{ content }` — drafts only                                                                                                                                |
| DELETE       | `/versions/:id`               | Drafts only                                                                                                                                                |
| POST         | `/versions/:id/draft`         | New draft from a version                                                                                                                                   |
| POST         | `/versions/:id/finalize`      | `{ label? }`                                                                                                                                               |
| GET          | `/versions/compare?from=&to=` | Section-level diff                                                                                                                                         |

### Workspaces, analysis, suggestions

| Method       | Path                            | Body / result                                                                                                                                                                                                                                                                 |
| ------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET          | `/workspaces`                   | List                                                                                                                                                                                                                                                                          |
| POST         | `/workspaces`                   | `{ resumeVersionId, jobText (50–… chars), name?, source?, sourceUrl?, sourceSite? }`                                                                                                                                                                                          |
| GET / DELETE | `/workspaces/:id`               | Workspace with job, requirements, latest analysis, questions, suggestions                                                                                                                                                                                                     |
| GET          | `/workspaces/compare?ids=a,b,…` | 2–6 workspace UUIDs (others → `400`; workspaces you do not own are left out) → `{ workspaces[] (id, name, job, latestAnalysis, resumeVersionId), sameResumeVersion, overlap: { shared[] (concept, jobs[] of id, importance, state), unique: { [workspaceId]: concept[] } } }` |
| PUT          | `/workspaces/:id/job`           | Replace job text and re-parse                                                                                                                                                                                                                                                 |
| PUT          | `/workspaces/:id/base-version`  | Switch the resume version being analysed                                                                                                                                                                                                                                      |
| POST         | `/workspaces/:id/requirements`  | `{ kind, text, importance, hard?, minYears? }`                                                                                                                                                                                                                                |
| PUT / DELETE | `/requirements/:id`             | Edit / remove a requirement                                                                                                                                                                                                                                                   |
| POST         | `/workspaces/:id/analyze`       | Run the analysis                                                                                                                                                                                                                                                              |
| GET          | `/workspaces/:id/analyses`      | Analysis history                                                                                                                                                                                                                                                              |
| POST         | `/questions/:id/answer`         | `{ response: yes\|no\|skipped\|deferred, text }` — `yes` needs ≥ 10 characters in the user's own words; re-runs the analysis                                                                                                                                                  |
| POST         | `/workspaces/:id/suggestions`   | Generate suggestions                                                                                                                                                                                                                                                          |
| PATCH        | `/suggestions/:id`              | `{ decision: accepted\|rejected\|pending, editedProposed? }`                                                                                                                                                                                                                  |
| POST         | `/workspaces/:id/versions`      | `{ label? }` → new version from accepted suggestions: `{ versionId, resumeId, counts }`                                                                                                                                                                                       |

### Exports

| Method | Path                    | Body / result                                                                                   |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/exports`              | List (unexpired)                                                                                |
| POST   | `/exports`              | `{ versionId, template: classic\|modern, format: docx\|pdf }` → export with verification report |
| GET    | `/exports/:id/download` | File download                                                                                   |
| DELETE | `/exports/:id`          | Delete file and row                                                                             |

### Extension

| Method | Path                      | Auth   | Body / result                                                                                                                          |
| ------ | ------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/extension/pairing-code` | cookie | → `{ code: "ABCD-EFGH", expiresAt }` (5 min, single use)                                                                               |
| GET    | `/extension/devices`      | cookie | Paired devices                                                                                                                         |
| DELETE | `/extension/devices/:id`  | cookie | Revoke a device                                                                                                                        |
| POST   | `/extension/pair`         | none   | `{ code, deviceName? }` → `{ deviceId, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt }`; 10 per 15 min        |
| POST   | `/extension/refresh`      | none   | `{ refreshToken }` → new pair; reuse of a used token revokes the device                                                                |
| POST   | `/extension/logout`       | ext    | Revokes the device                                                                                                                     |
| GET    | `/extension/resumes`      | ext    | Resume versions to pick from                                                                                                           |
| POST   | `/extension/jobs`         | ext    | `{ resumeVersionId, jobText, sourceUrl, sourceSite: linkedin\|naukri\|generic, title?, company?, location? }` → `{ workspaceId, url }` |

---

## CodeAtlas (`http://127.0.0.1:4317/api`)

**Authentication.** Every route except `/health` requires header `x-codeatlas-token: <token>` (printed by `serve`, stored at `$CODEATLAS_HOME/token`, mode 0600). Requests with a `Host` other than `127.0.0.1:<port>` / `localhost:<port>` get `421`; requests with a foreign `Origin` get `403`.

### Repositories and indexing

| Method       | Path                    | Notes                                                                                                              |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET          | `/health`               | `{ status: "ok" }`                                                                                                 |
| GET          | `/repos`                | Registered repos with latest coverage                                                                              |
| POST         | `/repos`                | `{ path }` — absolute local path; must be inside `CODEATLAS_ALLOWED_ROOTS` if set; CodeAtlas's own home is refused |
| GET / DELETE | `/repos/:id`            | Repo, coverage, recent runs / unregister and delete all its indexed data (409 while indexing)                      |
| POST         | `/repos/:id/index`      | Starts a background index job → `{ jobId }`                                                                        |
| GET          | `/jobs/:id`             | Job status                                                                                                         |
| DELETE       | `/jobs/:id`             | Cancel a running index job (SIGTERM, then SIGKILL after 3 s). The previous index is kept. Unknown id → `404`       |
| GET          | `/repos/:id/unresolved` | Unresolved references with reasons                                                                                 |

### Exploration

| Method | Path                            | Query                                                   |
| ------ | ------------------------------- | ------------------------------------------------------- |
| GET    | `/repos/:id/views/modules`      |                                                         |
| GET    | `/repos/:id/views/dependencies` | `module`, `external=1`, `limit` (≤ 1000, default 250)   |
| GET    | `/repos/:id/flows`              | Flow start candidates (routes, entrypoints)             |
| GET    | `/repos/:id/views/flow`         | `start` (node id), `depth` (≤ 8, default 4)             |
| GET    | `/repos/:id/views/risk`         |                                                         |
| GET    | `/repos/:id/views/ownership`    |                                                         |
| GET    | `/repos/:id/views/knowledge`    |                                                         |
| GET    | `/repos/:id/search`             | `q` — BM25 over code and docs                           |
| GET    | `/repos/:id/find`               | `q` — node name lookup                                  |
| GET    | `/repos/:id/nodes/:nodeId`      | Node with incoming/outgoing edges and evidence          |
| GET    | `/repos/:id/impact/:nodeId`     | Transitive dependents                                   |
| GET    | `/repos/:id/source`             | `path`, `start`, `end` — refuses paths outside the repo |

### Chat

| Method | Path                       | Notes                                                                                                                                                                                                           |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/ai/status`               | Provider availability                                                                                                                                                                                           |
| POST   | `/repos/:id/chat`          | `{ question }` → `{ mode: model\|retrieval-only, answer, citations[] (source, filePath, startLine, endLine, symbol, note?), confidence: high\|medium\|low, gaps[], warnings[], sources[], facts[], provider? }` |
| POST   | `/repos/:id/chat/feedback` | `{ rating: up\|down, note? (≤1000 chars), confidence?, citations? }` → stored as a local analytics event. Unknown fields → `400`                                                                                |
| GET    | `/settings`                | `{ dataLocation, database, worktrees, clones, firstRun, analytics: { storedLocally: true, transmitted: false } }`                                                                                               |
| POST   | `/settings/welcome`        | Dismiss the first-run welcome screen                                                                                                                                                                            |
| GET    | `/analytics?repo=`         | Local analytics summary for all repositories or one: indexing, questions, feedback (with recent notes), findings, patches, validation, merges                                                                   |
| POST   | `/data/delete-all`         | `{ confirm: "DELETE" }` → clears the database (repos, indexes, investigations, analytics, settings). `409` while indexing. Repository files and the worktree and clone folders are not touched                  |

### Investigations

| Method     | Path                             | Body                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET / POST | `/repos/:id/investigations`      | Create: `{ title, description }` → analysis with suspects, facts, affected routes, tests to run                                                                                                                                                                                                                                                                                                                                                    |
| GET        | `/repos/:id/investigations/:inv` | Investigation, patches, runs, events, allowed commands, `approvals[]`, `merges[]`, `validation` of the current patch, structured `report` (evidence, suspects, inferred root cause, validation, risks, rollback), `mergeCheck` `{ ok, targetBranch, problems[] }` when committed, and `instructions` when committed or merged                                                                                                                      |
| POST       | `…/:inv/worktree`                | Create the isolated worktree and branch                                                                                                                                                                                                                                                                                                                                                                                                            |
| POST       | `…/:inv/patches/manual`          | `{ diff, explanation? }` (unified diff, applied with `git apply --check` first)                                                                                                                                                                                                                                                                                                                                                                    |
| POST       | `…/:inv/patches/model`           | Ask the model for a patch (needs an available provider)                                                                                                                                                                                                                                                                                                                                                                                            |
| GET        | `…/:inv/patches/:patch`          | Patch detail                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| POST       | `…/:inv/commands`                | `{ commandId }` — must be in the allowed list; otherwise `403 NOT_ALLOWED` and an audit event                                                                                                                                                                                                                                                                                                                                                      |
| POST       | `…/:inv/approve`                 | `{ sha256, acknowledgeFailedValidation? }` — must equal the current patch hash (`409 HASH_MISMATCH`). If the latest checks failed, `409 VALIDATION_FAILED` unless acknowledged. Records an approval row                                                                                                                                                                                                                                            |
| POST       | `…/:inv/reject`                  | `{ reason? }` — records a rejection row                                                                                                                                                                                                                                                                                                                                                                                                            |
| POST       | `…/:inv/commit`                  | `{ message? }` — re-verifies the hash, commits in the worktree, returns merge instructions                                                                                                                                                                                                                                                                                                                                                         |
| POST       | `…/:inv/merge`                   | `{ confirm }` — the first 8 hex characters of the approved hash. Fast-forwards your current branch to the investigation commit. `409 MERGE_REFUSED` (nothing changed) if the confirmation is wrong or any merge check fails: no matching approval, branch moved, committed diff does not hash to the approval, your branch moved from the base, uncommitted tracked changes, or detached HEAD. Returns `merge` and `rollback` (`git revert <sha>`) |
| POST       | `…/:inv/discard`                 | Removes the worktree; the branch is kept once committed or merged                                                                                                                                                                                                                                                                                                                                                                                  |

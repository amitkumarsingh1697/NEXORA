# Privacy and data handling

## CVForge

### What is collected

| Data                                                        | Why                           | Where                     | Retention                                                                |
| ----------------------------------------------------------- | ----------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| Email, display name, country, password hash                 | Account                       | Postgres `users`          | Until account deletion                                                   |
| Privacy consent version and time                            | Proof of consent              | `users`                   | Until account deletion                                                   |
| Uploaded resume file                                        | Re-parse, download original   | File storage (random key) | Until the resume or account is deleted                                   |
| Extracted text and structured versions                      | Core product                  | Postgres                  | Until deleted                                                            |
| Job descriptions (pasted or captured), source URL and site  | Analysis                      | Postgres                  | Until workspace or account deletion                                      |
| Answers to clarification questions (user's own words, date) | Evidence for confirmed claims | Postgres                  | Until deleted                                                            |
| Generated exports                                           | Download                      | File storage              | `EXPORT_RETENTION_DAYS` (default 30), then purged                        |
| Sessions (token hash, user agent, last seen)                | Login, session management     | Postgres                  | Until expiry (14 days) or revocation, then purged                        |
| Extension devices and token hashes                          | Extension access              | Postgres                  | Refresh tokens purged after expiry; devices until revoked/deleted        |
| Audit events (action, ids, minimal metadata; no content)    | Security                      | Postgres                  | `AUDIT_RETENTION_DAYS` (default 365); user id nulled on account deletion |

No analytics, advertising or third-party trackers are included.

### User controls

- **Export:** Settings → Privacy → _Download my data_ returns all account data as JSON.
- **Delete:** Settings → Privacy → _Delete account_ (password and typing DELETE). Deletes all rows and stored files immediately.
- **AI assist:** off/on per user. When off, no resume text is sent to any model.
- **Devices and sessions:** view and revoke.

### AI and third parties

- Default model is local (Ollama). Hosted OpenAI-compatible endpoints refuse to run until the operator sets `AI_REMOTE_CONSENT=true`; the operator must then disclose the provider in the privacy notice and obtain user consent.
- Only the minimum text needed (a bullet, a requirement, the user's evidence) is sent per request.

### Extension

The extension processes only the page the user is on, only after clicking Extract, and sends only the reviewed job text, URL, site type and fields the user saw. It stores two values locally (device id, refresh token) and one in session storage (access token).

### Retention job

Run `pnpm --filter @nexora/cvforge-backend maintain` hourly (cron, systemd timer, or the platform scheduler). It is idempotent and logs only counts.

## CodeAtlas

- Everything stays on the local machine: index databases and worktrees live under `CODEATLAS_HOME` (default `~/.codeatlas`).
- Secret-looking files are not indexed; chat context is redacted.
- No telemetry. The only outbound connection is to the configured model endpoint (local Ollama by default). Source code is never sent to a hosted model without `AI_REMOTE_CONSENT=true`.
- Removing a repository deletes all of its indexed rows. Discarding an investigation removes its worktree and branch.

## Open items before public launch

- A published privacy notice and terms (legal review), a data processing record, and a named contact for data requests.
- Email verification and a real mail provider (the current mailer writes to a local outbox directory).
- Decide hosting region and backups encryption; document sub-processors.

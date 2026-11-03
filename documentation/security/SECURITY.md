# Security

## Reporting

NEXORA is pre-release and not publicly deployed. Report issues privately to the founder; do not open public issues for vulnerabilities.

## Controls: CVForge

| Area                | Control                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords           | scrypt (N=2^15, r=8, p=1, 64-byte key, per-hash salt; parameters stored in the hash so they can be raised later). Minimum 12 characters (`passwordSchema`). Constant-time comparison.                                                                                                             |
| Sessions            | 32-byte random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production); only the SHA-256 is stored. 14-day TTL, revocable individually or all at once; password reset revokes all sessions.                                                                                        |
| CSRF                | Cookie-authenticated mutations must send an `Origin`/`Referer` matching `APP_ORIGIN`. Extension routes use bearer tokens and never cookies.                                                                                                                                                       |
| Rate limits         | Login 10 / 15 min per email and per IP; password reset 5 / hour; pairing 10 / 15 min. In-memory limiter (per instance; see limitations).                                                                                                                                                          |
| Account enumeration | Forgot-password always returns success. Login errors do not distinguish unknown email from wrong password.                                                                                                                                                                                        |
| Authorisation       | Every service call is scoped by `user_id`; another user's resource returns `404`.                                                                                                                                                                                                                 |
| Uploads             | 10 MB limit checked before and after reading; type sniffed from magic bytes (PDF / DOCX zip structure), not from the filename or MIME header; per-user quota (200 MB default); files stored under random keys outside the web root.                                                               |
| Extension tokens    | Pairing code: 5 min, single use, hashed. Access token: HMAC-signed `ext1.*`, 15 min. Refresh token: 30 days, hashed, rotated on every use; reuse of a spent token revokes the device (`refresh_token_reuse`).                                                                                     |
| Headers             | CSP (`default-src 'self'`, `frame-ancestors 'none'`, `connect-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.                                                                                                                                          |
| Secrets             | `APP_SECRET` must be set (≥ 32 chars, not the dev default) when `NODE_ENV=production`; config errors name the variable, never the value.                                                                                                                                                          |
| Logging             | pino with redaction of password, token, refresh/access token, cookie and authorization fields. Resume text and job text are never logged; logs carry ids and counts only.                                                                                                                         |
| Audit               | Security and privacy events (signup, login and failed login, logout, password change/reset, session revocation, settings change, pairing, refresh-token reuse, data export, resume/workspace/account deletion) in `audit_events`, without content. Retained `AUDIT_RETENTION_DAYS` (default 365). |

## Controls: CVForge extension

- Permissions: `activeTab`, `scripting`, `storage`, and host permission for the configured CVForge origin only. No `cookies`, `tabs`, `webRequest` or broad host permissions.
- Reads a page only when the user clicks **Extract**; the extracted text is shown for review and editing before anything is sent.
- Does not read job-site cookies or credentials, does not bypass logins, paywalls or CAPTCHAs, and does not crawl.
- Access token lives in `storage.session` (cleared when the browser closes); refresh token in `storage.local`. Requests use `credentials: 'omit'`.

## Controls: CodeAtlas

| Area              | Control                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Network exposure  | Binds to `127.0.0.1` only.                                                                                                                                                                                                                                                                             |
| Authentication    | Random 32-byte token in `$CODEATLAS_HOME/token` (mode 0600), sent as `x-codeatlas-token`. The UI receives it once via the URL fragment (never sent to the server in a request line), stores it in `sessionStorage`, and strips it from the URL.                                                        |
| DNS rebinding     | `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`, otherwise `421`.                                                                                                                                                                                                                       |
| Cross-origin      | Requests with a foreign `Origin` are refused (`403`); no CORS headers are sent.                                                                                                                                                                                                                        |
| Headers           | Strict CSP, `nosniff`, `X-Frame-Options: DENY`, `no-referrer`.                                                                                                                                                                                                                                         |
| Repository access | Optional `CODEATLAS_ALLOWED_ROOTS`; CodeAtlas's own home is refused; `/source` refuses paths that resolve outside the repo (including via symlinks).                                                                                                                                                   |
| Secrets in code   | Files that look like secrets (`.env*`, keys, `id_rsa`, `.npmrc`, credentials) are never indexed; chat sources pass through a secret redactor (private keys, AWS/GitHub/Slack keys, `sk-` keys, JWTs, password assignments, URL credentials).                                                           |
| Prompt injection  | Retrieved code is framed as data, not instructions; answers are grounded to provided sources; model patches are limited to exact edits in suspect files and still need human approval.                                                                                                                 |
| Command execution | Only allowlisted package scripts (`test`, `typecheck`, `lint`, `build`, `check`, with optional `:suffix`) and `install --ignore-scripts`; `execFile` without a shell; scrubbed environment (no tokens or cloud credentials); 10-minute timeout; output capped at 200 KB; refused commands are audited. |
| Git               | Hooks disabled (`core.hooksPath=/dev/null`), signing disabled, work happens in a separate worktree and branch. Commit only after the approved SHA-256 matches the worktree diff. CodeAtlas never merges or pushes.                                                                                     |

## Dependencies

All versions are pinned exactly. `pnpm audit --prod` reported no known vulnerabilities at the last check (see IMPLEMENTATION_STATUS for the date). The CI workflow runs it on every change once the repository is pushed.

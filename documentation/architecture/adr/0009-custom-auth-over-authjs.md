# ADR 0009: Custom email/password auth instead of Auth.js

- Status: accepted
- Date: 2026-11-03
- Deviation from spec: §3.2 suggests "Auth.js or a maintained authentication solution"

## Context

CVForge needs:

- Email and password login.
- Server-side sessions that users can list and revoke individually (spec §7: session revocation).
- Revocation of all sessions on password reset.
- Account recovery.

Research R10 found that the Auth.js Credentials provider does not persist users to the database and works only with JWT sessions, and that it is "intentionally limited to discourage use of passwords". JWT-only sessions cannot be revoked individually without extra infrastructure. https://next-auth.js.org/providers/credentials

## Decision

Keep a small, tested auth module in `products/cvforge/backend/src/services/auth.ts`:

- **Passwords:** scrypt from `node:crypto`, with parameters stored in each hash.
- **Sessions:** 32-byte opaque tokens. Only the SHA-256 is stored. Cookies are HttpOnly, SameSite=Lax, and Secure in production.
- **Abuse controls:** rate limits, generic login errors, no account enumeration on reset.
- **Audit:** every security event is recorded.

## Consequences

- More review burden than a library. Tracked as risk S-01; an external review is needed before public launch.
- If OAuth sign-in is needed later, Auth.js or another maintained library can be added for those providers alongside the existing session model.

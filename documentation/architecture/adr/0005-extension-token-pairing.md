# ADR 0005: Extension authenticates with one-time pairing codes and rotating refresh tokens

- Status: accepted
- Date: 2026-11-01

## Context

The extension must call the CVForge API without reading the site's cookies or the user's password.

## Decision

The signed-in user generates an 8-character code (5-minute TTL, single use, hashed at rest, rate-limited). The extension exchanges it for a short-lived `ext1.*` access token (default 15 minutes, kept in `storage.session`) and a refresh token (30 days, `storage.local`). Refresh rotates the token within a family; reuse of an old refresh token revokes the device. Extension requests use bearer auth with `credentials: 'omit'`.

## Consequences

No CSRF surface for extension routes; a stolen refresh token is detected on its next legitimate use. Users can revoke devices from settings.

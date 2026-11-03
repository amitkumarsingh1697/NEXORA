# ADR 0006: CodeAtlas is a local service with SQLite + FTS5 via node:sqlite

- Status: accepted
- Date: 2026-11-01

## Context

Source code must not leave the machine. Install must be simple.

## Decision

A Node HTTP service bound to 127.0.0.1 with a random token, Host allowlist and Origin check. One SQLite file (`codeatlas.db`, rows scoped by repository) using Node 22's built-in `node:sqlite` (FTS5 included), so no native module build is needed. Indexing runs in a forked child process.

## Consequences

`node:sqlite` is still flagged experimental in Node 22 and prints a warning. Single-user only; no remote access.

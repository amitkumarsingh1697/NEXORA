# ADR 0008: Investigation patches are approved by hash and never merged by CodeAtlas

- Status: accepted (the "never merges" clause is superseded by ADR 0010)
- Date: 2026-11-01

## Context

Automated code changes must not reach the user's branch without review, and the reviewed patch must be the one committed.

## Decision

Each investigation gets its own git worktree and branch (`codeatlas/inv-<id>`). Patches are recorded with the SHA-256 of `git diff --cached --binary`. Approval requires that hash; commit re-computes it and refuses on mismatch. Only allowlisted package scripts (`test`, `typecheck`, `lint`, `build`, `check`, with optional `:suffix`) and `install --ignore-scripts` can run, via `execFile` without a shell, with a scrubbed environment. Git hooks are disabled. CodeAtlas prints merge commands for the human and never runs them.

## Consequences

Slightly more friction; no silent changes. Model-proposed patches are limited to exact find/replace edits in suspect files.

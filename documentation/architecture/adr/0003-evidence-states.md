# ADR 0003: Three evidence states, with explicit confirmation for risky claims

- Status: accepted
- Date: 2026-11-01

## Context

Resume tailoring tools commonly invent skills. CVForge's promise is that every claim is traceable.

## Decision

Each requirement is `demonstrated` (cites resume text), `user_confirmed` (the user said yes in their own words; the text and date are stored) or `missing`. Work-authorisation constraints (visa, sponsorship, right to work, citizenship, security clearance) always require explicit confirmation, even when resume text matches. Years-of-experience requirements are computed from dated roles and shown as computed evidence. A fabrication guard blocks any suggestion that introduces numbers or technologies absent from the allowed sources.

## Consequences

Scores can be lower than keyword-matching tools report; the UI explains why. Suggestions are narrower but defensible.

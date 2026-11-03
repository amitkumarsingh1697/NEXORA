# Definition of done

## A task (one requirement or sprint item) is done when all of these hold

1. **Requirement:** it has an ID in REQUIREMENTS_TRACEABILITY.md, and the behaviour matches the spec text, or an ADR records the deviation.
2. **Implementation:** the behaviour exists in non-UI code. A button, page or route on its own is not enough.
3. **Tests:** normal and edge cases are covered at the right level (unit, integration, E2E, security), and they **ran and passed**. Record the test file and the command.
4. **Quality gates pass:**
   - `pnpm typecheck`
   - `pnpm lint` (zero warnings)
   - `pnpm test`
   - `pnpm format:check`
   - the relevant Playwright suite, when a user journey changed
5. **Error handling:** inputs are validated with zod, failures produce a typed error and a user-readable message, and no catch block swallows errors.
6. **Security review:** authorisation, input handling, logging (no secrets or private content) and data retention are checked. New threats go into SECURITY_THREAT_MODEL.md.
7. **AI review** (if a model is involved): the rules in AI_ENGINEERING_RULES.md hold, with schema validation, grounding and fallback.
8. **Docs updated:**
   - traceability and implementation status
   - API reference, schema docs and user-facing docs if behaviour changed
   - CHANGELOG
9. **Limitations recorded** in KNOWN_LIMITATIONS.md.
10. **No fake implementations:** no mock data on production paths, no placeholder controls.

A task blocked by an external dependency is marked **blocked**, never done.

## A sprint is done when

- Every item meets the task DoD, or is explicitly carried over with a reason.
- Every acceptance criterion in SPRINT_PLAN.md has recorded evidence.
- The full suite (`pnpm check`, both E2E suites, `pnpm audit --prod`) passes on the final state.
- A sprint report is posted with the 10 points from CLAUDE.md §12.

## A release is ready when

- Every applicable criterion in RELEASE_READINESS.md is met, with evidence.
- No critical or high risk in RISK_REGISTER.md is open without an accepted mitigation.
- Manual verification items (live sites, real model) are done, or the release notes state they are unverified.
- The founder has approved the release. Nothing is deployed or published without that approval.

## Words we do not use loosely

"Done", "complete", "secure", "production-ready" and "validated" each need the evidence above. Prefer the precise status words in CLAUDE.md §4.

# Report templates

Use the sections that apply, in this order. Keep the whole report short enough to read in five minutes, with detail in tables.

```markdown
## Summary

Two to four sentences that answer the question directly, with labels on key claims.

## System map

| Module | Responsibility | Depends on | Evidence |
| ------ | -------------- | ---------- | -------- |

## Key flow: <name>

1. <hop> — [observed] `path:line`
2. <hop> — [inferred] because …
3. <hop> — [unknown] (resolve by …)

## Impact of changing <X>

| Dependent | Path | How it depends | Break type | Covered by test? |
| --------- | ---- | -------------- | ---------- | ---------------- |

## Risks and recommendations

| #   | Risk | Evidence | Limitation | Score (I×L) | Recommendation | Effort |
| --- | ---- | -------- | ---------- | ----------- | -------------- | ------ |

## Bug report

- **Symptom:**
- **Evidence:**
- **Hypotheses (ranked):**
- **Likely root cause:** [label] …
- **Proposed fix:** (diff below, not applied)
- **Validation plan:** commands for the user to run
- **Risks:**
- **Rollback:** `git revert <sha>`

## Unknowns

- <unknown> — resolve by …

## Coverage

- Read: <files/dirs>
- Skipped: <files/dirs> (why)
- Effect on conclusions: …
```

## Style

- Use plain sentences, not arrow chains.
- Put citations inline in backticks.
- Never hide a weak conclusion. Label it and move it to Unknowns if needed.

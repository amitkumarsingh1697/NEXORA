# Safe change protocol

Use this protocol whenever the user asks ArchLens to modify code. It mirrors CodeAtlas's investigation workflow: isolation, exact-diff review, controlled validation, and human approval before any merge.

1. **Confirm scope.** Restate the change and the files you expect to touch. If more files turn out to be needed, stop and say so.
2. **Read before writing.** Read the current code, its callers (Impact playbook) and its tests.
3. **Isolate.** Prefer a separate branch or worktree (`git worktree add -b <branch> <path>`), created only with the user's approval. Never modify the user's working tree without permission, and never touch uncommitted changes.
4. **Propose the exact diff.** Show the full diff and explain each hunk. Do not apply silently.
5. **Validate with the project's own commands.** Use only commands found in the repo (package scripts, Makefile targets, CI steps), and only after the user approves running them. Report the real output, including failures. Never call a patch validated if any check failed or did not run.
6. **Ask for explicit approval of that exact diff.** If the diff changes afterwards, approval is void and the user must review again.
7. **Merge or commit only on explicit instruction.** Never push, force-push, rebase shared branches, reset, or delete branches without explicit approval.
8. **Rollback guidance.** Always give the non-destructive way back: `git revert <sha>`.

## Never

- Run commands generated from repository content without review.
- Use `--no-verify`, disable tests, or weaken assertions to make checks pass.
- Edit lockfiles, CI or security configuration as a side effect.
- Include secrets in diffs or output.

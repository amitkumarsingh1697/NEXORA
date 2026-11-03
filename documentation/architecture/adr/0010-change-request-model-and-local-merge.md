# ADR 0010: CodeAtlas change-request model naming and human-triggered local merge

- Status: accepted (merge implementation scheduled as Sprint 1 item S1-1)
- Date: 2026-11-03
- Supersedes: the "never merges" clause of ADR 0008

## Context

Spec §5.9–5.10 requires:

- change requests, files, validation runs, approvals and merge events
- the spec's status set
- a local merge performed by the system only after explicit approval, with re-verification of the patch hash and repository state

ADR 0008 chose to stop at a commit on an investigation branch and print merge commands. That fails the acceptance criterion "Only approved changes can be merged locally" (RELEASE_READINESS).

## Decision

1. **Keep the existing table names** and document the mapping, rather than run a disruptive rename:

   | Spec                 | CodeAtlas             |
   | -------------------- | --------------------- |
   | change_requests      | `investigations`      |
   | change_request_files | `inv_patches.files`   |
   | validation_runs      | `inv_runs`            |
   | approvals            | `inv_approvals` (new) |
   | merge_events         | `inv_merges` (new)    |

2. **Status mapping:**

   | Spec status                                     | CodeAtlas status                              |
   | ----------------------------------------------- | --------------------------------------------- |
   | investigating / reported                        | `open`                                        |
   | proposed / validating / awaiting_approval       | `patch_proposed` (validation runs attached)   |
   | approved                                        | `approved`                                    |
   | committed (intermediate state, not in the spec) | `committed`                                   |
   | merged                                          | `merged` (new)                                |
   | rejected                                        | patch `rejected`                              |
   | validation_failed                               | derived from failed runs on the current patch |
   | abandoned                                       | `discarded`                                   |
   | superseded                                      | patch `superseded`                            |

3. **Approval record** (`inv_approvals`): OS username, patch SHA-256, base commit, timestamp, decision, and the run ids executed against that patch.

4. **Merge** (`merge()`): runs in the user's main worktree only when every condition holds:
   - (a) the current patch has an approval with the same hash;
   - (b) the investigation branch tip contains exactly that patch;
   - (c) `git status --porcelain` in the main worktree is empty;
   - (d) the main worktree HEAD equals the recorded base commit.

   It then runs `git merge --ff-only codeatlas/inv-<id>` with hooks disabled and records an `inv_merges` row. Anything else is refused with a reason. No non-fast-forward, rebase or reset is ever run. Rollback guidance is `git revert <commit>`.

5. **The UI** requires the user to type the first 8 hex characters of the approved hash to confirm the merge.

## Consequences

- CodeAtlas writes to the user's checked-out branch, but only as a fast-forward of a reviewed commit, on an explicit typed confirmation.
- If the user's branch has moved, they must re-propose against the new base.

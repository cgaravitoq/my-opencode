## PRD-To-Execution Playbook

End-to-end playbook for executing one `status:prd` GitHub issue inside its target repo.

## Workflow Position

```text
idea-to-issue -> [project-to-draft] -> draft-to-prd -> prd-to-execution
```

`prd-to-execution` is the only skill that touches the local filesystem and remote GitHub. Every other skill in the bundle stays in the issue tracker.

## Repo Resolution

The single source of truth for repo resolution is `../../SKILL.md` (Multi-Repo Resolution section). This playbook does not redefine the order - it only adds execution-time concerns.

Persistence format (after resolution):

```md
## Repo

- GitHub: https://github.com/<owner>/<name>
- Local: ~/<repos>/<owner>/<name>
```

The `Local` path is machine-specific. On a new machine, re-resolve and overwrite. Verify the path exists before using it; do not trust a stale path inherited from another machine.

## Pre-Execution Checks

Before running any `git` or `gh` command, confirm the resolved local path is a usable repo:

1. **Path exists**: `ls <local-path>`. If not, ask the user to re-resolve.
2. **Is a git repo**: `git -C <local-path> rev-parse --git-dir`. If not, stop and report - the resolved path is not a git checkout.
3. **Has a remote**: `git -C <local-path> remote get-url origin`. If empty (e.g. fresh `git init`), stop and ask whether to add `origin` or pick a different path.
4. **Remote matches `## Repo`'s GitHub URL** (compare `nameWithOwner`, ignore `.git` suffix, ignore `https`/`ssh` differences). If they differ, stop and ask - do not push to the wrong repo.
5. **Working tree is clean enough** to start a new branch (no uncommitted changes the user did not authorize). If dirty, stop and surface the diff.
6. **`gh` auth is valid** for this repo: `gh repo view <owner/name> --json nameWithOwner,url`. If it errors with auth/permission, stop and ask the user to re-auth.

After all six pass, switch the working directory to the local path (use `workdir`, never `cd && cmd`) and proceed.

## Parent Body Shape

While execution runs, the parent issue body has these sections:

- `## Why` (from PRD)
- `## What` (from PRD)
- `## Scope` (from PRD)
- `## Verify` (from PRD)
- `## Repo` (resolved during execution)
- `## AI Agent Execution Plan` (from PRD; checkboxes mutated during execution)
- `## Implementation` (added or refreshed by this skill)
- `## Parent Reference` (from PRD, when applicable)

`## Implementation` evolves through three states:

```md
## Implementation

Branch: <username>/<issue-number>-<short-slug>
Commit: pending
PR: pending
```

→

```md
## Implementation

Branch: user/42-add-jwt-rotation
Commit: 9c1f4a3
PR: pending
```

→ (final, on `status:hitl`)

```md
## Implementation

Branch: user/42-add-jwt-rotation
Commit: 9c1f4a3
PR: https://github.com/me/api/pull/87
Verify: `bun test` (pass), manual smoke at `/auth/refresh` (pass)
Files changed: src/auth/jwt.ts, src/auth/jwt.test.ts, src/middleware/auth.ts
```

## Label Mapping (this skill's slice)

| Trigger                                                                                  | Active label    |
| ---------------------------------------------------------------------------------------- | --------------- |
| All task checkboxes are `[ ]`                                                            | `status:prd`     |
| Any checkbox is `[-]` or any task has a non-empty `Commit`                               | `status:running` |
| Every checkbox is `[x]` AND `## Implementation` has Branch + Commit + PR + Verify + PR label filled | `status:hitl`    |
| PR merged (issue closed via `Closes #N`) or human flips it manually                      | `status:ready`   |

The agent owns the first three transitions (each via a single `gh issue edit --remove-label X --add-label Y`). The human (or the merge + repo automation) owns `status:ready`.

## Code Work: Delegate to `pipeline-execution`

This skill does **not** call writers or reviewers directly.
The global `pipeline-execution` skill owns that contract end-to-end.

Per-task delegation:

1. Before launching, flip the task's checkbox to `[-]`, set `Status: in_progress`, append a "Started Task X" comment (`gh issue comment <N>`).
2. Invoke `pipeline-execution` for the task with:
   - `repo_path`: resolved local repo path.
   - `parent_branch`: the shared branch name from `## Implementation`.
   - `tasks`: a single-element list with the task block (title, surface, output, depends-on, verify).
   - `tracker_url`: the GitHub issue URL.
   - Skip `verify_command` here (per-task verify is inside the task block).
   - `pr_title` / `pr_summary`: leave empty for per-task calls if the integration call will own the PR (see PRD-level run below).
3. After `pipeline-execution` returns, read the per-task commit hash from the report, verify it exists (`git log --oneline -1 <hash>`), then update the body: flip checkbox to `[x]`, fill `Commit: <hash>`, set `Status: done`, append a "Completed Task X" comment.

PRD-level integration run:

After all per-task work is committed, invoke `pipeline-execution` once more for the integration / review pass:

- `repo_path`, `parent_branch` as above.
- `tasks`: optional. If the integration run only triggers review (no further code edits), pass an empty task list and rely on the reviewer to read the existing commit range.
- `verify_command`: the PRD's `## Verify` command, run by the writer before the read-only audit.
- `tracker_url`: GitHub issue URL.
- `pr_title`: conventional commit summary referencing the issue (`feat(scope): summary (#42)` or `feat(scope): summary (owner/repo#42)`).
- `pr_summary`: one-line intent built from `## What`. Must include `Closes <owner/repo#N>` (or `Closes #<N>` same-repo) so the merge auto-closes the issue.
- `pr_label_approved`: `approved`.
- `pr_label_human`: `hitl`.

The writer runs the verification gate and handles any findings returned by the bounded read-only reviewer audit before publishing the PR.
Approved PRs are ready for merge.
Human-required PRs stay draft with the `hitl` label.

## Parallel Execution Rules

Multiple per-task `pipeline-execution` calls may run in parallel only when:

- Their `Surface:` blocks are disjoint (no shared files).
- Their `Depends on:` blocks are satisfied (dependencies are `[x]` already).
- Their changes can land in the same parent PR without conflict.

Do not parallelize when:

- Tasks touch shared core modules.
- One task's output is another's input (sequential dependency).
- The PRD has only 1–2 tasks (overhead exceeds benefit).

The PRD-level integration call is **always** sequential - invoked once after all per-task work is committed.

## Verification

Three layers, all owned downstream by `pipeline-execution`:

1. **Per-task `Verify`** - `exec` runs the task's verify before claiming done.
2. **Pre-review verify** - `pipeline-execution` runs the integration `verify_command` over the combined change before handing to the reviewer.
3. **Final audit** - the read-only reviewer audits the verified exact head and returns its verdict to the writer.

This skill does not run any verify directly.
It only checks that `pipeline-execution`'s report shows verify passed and a PR label was applied before flipping the parent to `status:hitl`.

## End-To-End Dry Run

When validating the workflow on a real PRD:

- Parent issue was `status:prd`, had `## Repo` resolved, included `## AI Agent Execution Plan` with `- [ ]` tasks.
- No GitHub sub-issues created. All task progress in checkbox state, inline `Status`/`Commit`, and issue comments.
- Label transitions followed the checkbox aggregate: `status:prd` → `status:running` (any `[-]`) → `status:hitl` (all `[x]` + implementation evidence).
- Repo work stayed on one `<username>/<issue-number>-<short-slug>` branch.
- Verification output and PR label were read before claiming `status:hitl`.
- Final issue update leaves enough evidence in body + comments that a developer could continue without reading the chat transcript.
- PR body includes `Closes <owner/repo#N>` so the merge auto-closes the issue.

## Anti-Patterns

- Running `git` from the workspace root when the workspace root is not the target repo.
- Trusting a `Local:` path persisted from another machine without verifying it exists.
- Pushing to a remote whose `nameWithOwner` does not match `## Repo`'s GitHub URL.
- Caching the issue body across `pipeline-execution` results - re-fetch before each write to avoid clobbering parallel updates.
- Persisting a commit hash to the issue body without verifying it exists with `git log --oneline -1 <hash>`.
- Silently retrying a `pipeline-execution` call that returned a blocker. Surface it as a `Blocker:` and stop.
- Silently retrying when `pipeline-execution` reports `hitl`. Surface residual blockers or uncertainty; the human decides.
- Invoking a writer, `reviewer`, or any `reviewer-*` directly from this skill. Always go through `pipeline-execution`.
- Bypassing `pipeline-execution` with a manual `git push` + `gh pr create`. The label, the review loop summary, and the verify gate are part of the contract.
- Restarting an in-flight PRD without checking `## Implementation` first. Detect resume scenarios and ask the user.
- Creating per-task branches.
- Skipping the integration `pipeline-execution` call because all per-task verifies passed.
- Moving to `status:hitl` before `## Implementation` has the PR URL **and** the label.
- Committing files the PRD did not touch ("while I'm here" cleanups).
- Forgetting `Closes <owner/repo#N>` in the PR body - without it the merge does not auto-close the issue, leaving the bookkeeping stale.
- Leaving the issue with two `status:*` labels or none. Always swap atomically.

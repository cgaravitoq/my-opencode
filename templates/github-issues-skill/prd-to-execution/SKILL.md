---
name: prd-to-execution
description: Execute a `status:prd` GitHub issue inside its target repo, tracking task progress inline (body checkboxes + issue comments) on the parent issue, committing all task work into a single parent branch, and finishing in one shared PR. Resolves the target repo from the issue body. Use when the user asks to execute a GitHub PRD or connect issue work to a branch/PR.
---

# PRD To Execution

## Goal

Execute one `status:prd` GitHub issue inside its target repo. The parent spec is the only delivery unit and the only GitHub issue. No sub-issues, no parent-linked trackers - task coordination lives in the parent issue's body checkboxes and issue comments.

For the personal GitHub Issues flow, this runs after:

```text
idea-to-issue -> [project-to-draft] -> draft-to-prd
```

End-to-end: resolve the target repo, switch into it, prepare the parent spec, then **delegate code work to the global `pipeline-execution` skill** (which owns `exec → reviewer → fixer × ≤3 → PR`). This skill only handles GitHub Issues bookkeeping - label transitions, body checkboxes, issue comments, `## Implementation` updates.

Coordination model: each task in the `## AI Agent Execution Plan` is a markdown checkbox in the parent body. The architect (not the worker) updates the checkbox state plus inline `Status` and `Commit` fields based on the worker's report, and appends issue comments to log events. The body is source-of-truth status; the comment timeline is the event log.

## Required Inputs

- GitHub PRD issue ref (`#N` if in the same repo, `owner/repo#N` cross-repo).
- Optional execution preference: `plan-only`, `assignments-only`, or `implement` (default).

If the user does not request plan-only, default to `implement`.

## Sources Of Truth

- Use `gh` CLI for issue / label / comment reads and writes (`gh issue view`, `gh issue edit`, `gh issue comment`, `gh issue develop`).
- Use `gh` for repository or PR metadata (`gh repo view`, `gh pr view`).
- Use `git` for branch state and commits.
- Use `../SKILL.md` for status flow, multi-repo resolution, and shared invariants.
- Use [references/execution-playbook.md](references/execution-playbook.md) for the full playbook (repo resolution, parent body shape, worker prompt requirements, dry-run checklist).

## Execution Invariants

- The `## AI Agent Execution Plan` in the issue body is the source of truth. Do not invent a new plan during execution.
- The parent spec is the only delivery unit and the only GitHub issue: one parent branch, one PR, one set of inline checkboxes, one comment timeline.
- Do not create sub-issues, parent-link new issues for tasks, or open additional issues for coordination.
- Status is derived from the aggregate of checkbox states (see status flow below) and reflected via a single `status:*` label transition.
- Record branch, commit, PR URL, verification output, changed-file summary, and PR label on the parent issue before moving it to `status:hitl`.

## Status Flow (this skill's slice)

```text
status:prd -> status:running -> status:hitl -> status:ready
```

Owned transitions:

- Keep the parent at `status:prd` while planning only - every task checkbox is `[ ]`.
- Move the parent to `status:running` as soon as any task flips to `[-]` (in progress) or has a non-empty `Commit` field. Single edit: `gh issue edit <N> --remove-label status:prd --add-label status:running`.
- Move the parent to `status:hitl` only after every task checkbox is `[x]`, the parent branch + commit hash + PR URL + verification output + PR label are recorded in the body, and the comment timeline includes a completion comment for each task. Single edit: `gh issue edit <N> --remove-label status:running --add-label status:hitl`.
- Do not move the parent to `status:ready`. Human review owns that - `status:ready` happens when the PR merges (or the human flips the label after review).

## Workflow

### 1. Load the PRD and resolve the repo

Fetch the issue (`gh issue view <N> --json number,title,body,labels,milestone,url`) and verify:

- active label is `status:prd`
- body has `## AI Agent Execution Plan` with at least one `- [ ]` task entry
- `## Repo` section is present

If the active label is not `status:prd`, stop and route the user back to `draft-to-prd`.

If `## Repo` is missing or unresolved (no GitHub URL or no local path), apply the multi-repo resolution algorithm defined in `../SKILL.md` (single source of truth - do not redefine the steps here). On ambiguity, follow the disambiguation rules in the same section: stop and ask the user which repo, never guess.

If the GitHub URL is resolved but the `Local` path on this machine is missing, ask:

> *"This PRD's repo `<github-url>` has no local path on this machine. Where is it cloned?"*

Persist the answer in the `## Repo` section. Verify the path exists with `ls` before using it; do not trust a stale path inherited from another machine.

Switch the working directory to the resolved local repo path before any git/file operations. Use the `workdir` parameter on bash; do not `cd && cmd`.

### 2. Prepare single-PR execution

Read the spec for `Scope`, `Verify`, decisions, and the `AI Agent Execution Plan`.

Add or update an `## Implementation` section in the parent body:

```md
## Implementation

Branch: <username>/<issue-number>-<short-slug>
Commit: pending
PR: pending
```

The `## AI Agent Execution Plan` already in the body holds the task checkboxes - do not duplicate the task list elsewhere.

If the execution plan is missing, ambiguous, or too large to ship safely as one PR, stop and record the blocker as a comment on the parent issue. Do not improvise scope.

Move the parent to `status:running` only when work actually starts (first task flips to `[-]`).

### 3. Track tasks via body checkboxes and comments

Each task in the execution plan carries inline state. Update both the checkbox and the inline fields directly in the parent body:

```md
- [ ] [Task title]
  - Owner: [`exec` direct, or `architect` for tasks with no code change]
  - Surface: [files / package / app / system area]
  - Output: [what must be committed]
  - Depends on: [task title or `none`]
  - Verify: [command or manual flow]
  - Status: pending
  - Commit: -
```

Checkbox states:

- `[ ]` pending
- `[-]` in progress (worker started)
- `[x]` done (commit integrated, verify ran clean)

Worker start:
- Flip checkbox to `[-]`, set `Status: in_progress`.
- Append a comment: *"Started Task X - branch `<branch>` from `<base-commit>`."* via `gh issue comment <N>`.

Worker complete:
- Flip checkbox to `[x]`, set `Status: done`, fill `Commit: <hash>`.
- Append a comment: *"Completed Task X - commit `<hash>`. Verify ran: `<command>` (pass)."*.

Worker blocker:
- Leave checkbox at `[-]`, add a `Blocker:` field under the task.
- Append a blocker comment.

Do not create GitHub sub-issues, parent-linked issues, or external trackers for tasks.

### 4. Branches and GitHub linking

- Do not create the branch before implementation actually starts.
- The parent body's `## Implementation` section names the suggested branch:

  ```text
  <username>/<issue-number>-<short-slug>
  ```

- When starting implementation, create the branch via `gh issue develop <N> --name <branch> --checkout`. This links the branch to the issue (visible in the sidebar) and switches the local checkout to it.
- All worker commits land on that branch. Do not create per-task branches.

### 5. Implement via the global `pipeline-execution` skill

Code work is **not** implemented inline in this skill. Delegate the entire `exec → reviewer → fixer × ≤3 → PR` loop to the global `pipeline-execution` skill. This bundle only handles GitHub Issues bookkeeping around it.

Unless the user asked for `plan-only`:

1. Switch to the resolved local repo path.
2. Create or switch to the shared implementation branch (via `gh issue develop` on the first task; subsequent tasks reuse it).
3. Move the parent to `status:running` when about to start (first task flips to `[-]`).
4. **For each task** (in dependency order, possibly in parallel):
   - **Before launching**: flip its checkbox to `[-]`, set `Status: in_progress`, append a "Started Task X - branch `<branch>` from `<base-commit>`." comment.
   - **Invoke `pipeline-execution`** for the task with: repo path, parent branch, the single task block, the GitHub issue URL as `tracker_url`, no `verify_command` yet (per-task verify is inside the task block).
   - **After the call returns**: read the per-task commit hash from the report. Verify the commit exists on the parent branch (`git log --oneline -1 <hash>`). Flip the checkbox to `[x]`, fill `Commit: <hash>`, set `Status: done`, append a "Completed Task X - commit `<hash>`. Verify ran: `<command>` (pass)." comment.
5. **PRD-level run** (after all per-task work is committed): invoke `pipeline-execution` once more with the full task list collapsed to a single "post-integration" entry, the PRD `## Verify` block as `verify_command`, the GitHub issue URL as `tracker_url`, the PR title and summary built from `## What`, and `pr_label_approved: approved` / `pr_label_human: hitl`.
   This run owns the swarm, the fixer loop, the final verify gate, and the PR push.
   The reviewer ensures the PR body contains `Closes #<N>` (or `Closes owner/repo#<N>` cross-repo) so the parent issue auto-closes on merge.

   *Alternative*: the per-task `pipeline-execution` invocations skip the reviewer (mode `audit-only` if supported), and only the final integration call runs the swarm + fixer loop + opens the PR. Pick whichever the architect supports - the contract is "one PR per PRD, reviewer-owned".

6. **After the final `pipeline-execution` returns**: update `## Implementation` with the final branch, latest commit hash (after fixer passes if any), PR URL, label applied (`approved` or `hitl`), the review loop summary (passes used, blockers resolved, residual concerns), and the final verify evidence.
7. Move the parent to `status:hitl`: `gh issue edit <N> --remove-label status:running --add-label status:hitl`.

What this skill does **not** do:

- Run `exec`, `reviewer`, `fixer`, or `reviewer-*` directly. Those are owned by `pipeline-execution`.
- Run `git push` or `gh pr create` directly. The reviewer (inside `pipeline-execution`) pushes and opens the PR.
- Decide swarm composition or fixer iteration limits. Those live in `pipeline-execution` and `reviewer`.

If the reviewer (inside `pipeline-execution`) returns `hitl`, still move the parent to `status:hitl`. The PR is open with the `hitl` label and residual concerns or uncertainty in its body - the human owns the next step. Surface this explicitly to the user; do not silently retry the loop.

If `pipeline-execution` returns an `exec` blocker before reaching the reviewer, leave the affected task's checkbox at `[-]`, add `Blocker: <reason>`, append a blocker comment, stop new task launches. Do not invoke the reviewer until all tasks are `[x]`.

### Worker failure modes (GitHub Issues bookkeeping perspective)

`pipeline-execution`'s `exec` phase:

- **Reports `Blocker:`** → leave the affected task's checkbox at `[-]`, record the blocker on the issue (comment + `Blocker:` field), stop new launches.
- **Reports a commit that does not exist on the branch** → before persisting `Commit:` to the body, verify with `git log --oneline -1 <hash>`. If missing, mark `Blocker: exec reported a commit that does not exist`.
- **Reports done but verify did not pass** → do not flip to `[x]`. Mark `Blocker: verification did not pass`.

`pipeline-execution`'s `reviewer` phase:

- **Returns `hitl`** → move the parent to `status:hitl`, record `Human review required: <reason> - see PR body` under `## Implementation`. Surface explicitly to the user.
- **Fails before opening the PR** → do not move the parent to `status:hitl`. Record `Blocker: reviewer unreachable - <error summary>` and stop. Do not bypass the loop with a manual push.
- **Returns a PR URL but label missing** → do not move the parent to `status:hitl` until the label is verified (`gh pr view <pr-number> --json labels`). Ask the reviewer to retry the label step.

### Parallel write safety

When multiple workers complete close in time, the architect updates the parent body sequentially. To avoid clobbering each other:

- **Re-fetch the issue body** before each write (`gh issue view <N> --json body --jq .body > body.md`). Do not cache the body across worker results.
- Mutate only the specific task block being updated (and `## Implementation` if applicable). Leave other task blocks untouched even if they look stale in your local copy.
- Write back with `gh issue edit <N> --body-file body.md`. If the issue updated between read and write, GitHub will not detect the conflict - re-fetch and diff your local mutation against the current body before retrying once. On second failure, surface the conflict and stop new writes until resolved.

### Resume detection

Before starting any work on a PRD, check if `## Implementation` already has non-`pending` values:

- **Branch is set, Commit is `pending`, PR is `pending`**: a previous run started but did not finish. Inspect task checkboxes - `[-]` tasks need to be either resumed or reset. Ask the user: *"This PRD has an in-flight branch `<branch>` and N tasks in progress. Resume from there or restart?"*. Do not silently restart.
- **Branch and Commit are set, PR is `pending`**: a previous run committed but did not push or open a PR. Continue from the push step; do not redo committed work.
- **Branch, Commit, and PR are set**: the PRD already shipped (or is mid-`status:hitl`). Refresh state from GitHub - do not start a new branch.

Resume must never overwrite checkboxes that are already `[x]` unless the user explicitly says to redo them.

### 6. Output

When the parent moves to `status:hitl`, report:

- parent issue ref and active label
- repo local path and branch
- task checkbox aggregate (counts of `[x]`/`[-]`/`[ ]`)
- `exec` workers launched (if any)
- shared branch, latest commit hash, PR URL, label applied (`approved` or `hitl`)
- review loop summary: passes used, swarm reviewers run, blockers resolved, residual concerns
- verification commands and results
- next unstarted task (if execution stopped early)
- anything not done because tools did not support it

**Always include this reminder when moving to `status:hitl`** - adapt to the label:

For `approved`:

> *"Automated approval: review loop closed clean and the PR is ready for merge. Merge `<pr-url>` when repository checks are green. The PR body has `Closes <owner/repo#N>` so the issue label flips to `status:ready` automatically on merge."*

For `hitl`:

> *"HITL handoff: automated approval could not be granted. Open the draft PR `<pr-url>` (label: `hitl`) and review the residual concerns or missing evidence before marking it ready. The issue flips to `status:ready` automatically on merge via the PR's `Closes` reference."*

This pairs the human's review action on the PR with the GitHub auto-close (via `Closes`) so the issue label transitions to `status:ready` without manual intervention, and makes the loop outcome visible at handoff time.

## Multi-Repo Notes

- Always switch to the resolved local repo path before git operations. Do not run `git` from the workspace root if the workspace root is not the target repo.
- The local path lives only in the issue body; it is machine-specific. Re-resolve on a new machine if missing.
- If the issue's `## Repo` resolves to multiple GitHub URLs (rare for a single PRD - usually means the PRD is too big), stop and recommend re-shaping via `project-to-draft`.

## Auto-Close Wiring

`status:ready` is reached when the PR merges. To make that automatic:

- The PR body MUST include `Closes <owner/repo#N>` (or `Closes #N` if the PR lives in the same repo as the issue).
- A repo-side automation (workflow or Actions step) flips the closed issue's label from `status:hitl` to `status:ready`. Without that automation, the issue closes but its label remains `status:hitl` - the human must run `gh issue edit <N> --remove-label status:hitl --add-label status:ready` after the merge.

If you want zero manual cleanup, add a GitHub Actions workflow under `.github/workflows/close-to-ready.yml` in the target repo:

```yaml
name: status hitl -> ready on close
on:
  issues:
    types: [closed]
jobs:
  flip:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            const labels = context.payload.issue.labels.map(l => l.name);
            if (labels.includes("status:hitl")) {
              await github.rest.issues.removeLabel({
                ...context.repo, issue_number: context.payload.issue.number,
                name: "status:hitl",
              });
              await github.rest.issues.addLabels({
                ...context.repo, issue_number: context.payload.issue.number,
                labels: ["status:ready"],
              });
            }
```

That workflow is the bundle's only required automation. Without it the flow still works - only the last label flip becomes manual.

## Guardrails

- Do not create GitHub sub-issues for task coordination. Use body checkboxes and issue comments.
- Do not parent-link other issues to this PRD for coordination.
- Do not create additional issues for sub-tasks.
- Do not create more than one branch or PR for a PRD.
- Do not move the parent to `status:running` unless work is actually starting.
- Do not move issues to `status:ready` from this skill - human review (and the merge auto-close) owns that.
- Do not invoke `exec`, `reviewer`, `fixer`, or any `reviewer-*` agent directly. Always go through the global `pipeline-execution` skill.
- Do not push the parent branch or run `gh pr create` directly. `pipeline-execution` (via the reviewer) owns push + PR.
- Do not skip the `pipeline-execution` call because the swarm "would probably pass". Every PRD goes through the loop before `status:hitl`.
- Do not skip the repo resolution step. Without `## Repo` resolved, no execution.
- Keep the parent issue body concise and executable; the body is the source-of-truth status surface.
- Always swap labels in a single `gh issue edit` (`--remove-label A --add-label B`). Never leave the issue without a `status:*` label, even briefly.

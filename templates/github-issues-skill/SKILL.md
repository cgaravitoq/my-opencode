---
name: github-issues
description: Per-repo GitHub Issues workflow router. Defines this repo's status flow (label-based), sub-skills, and handoffs. The `architect` agent loads this bundle when it detects `.agents/skills/github-issues/SKILL.md` in the active repo. Trigger phrases include "tengo una idea", "captura esto", "trabajemos en #42", "abordemos esta issue", "shape this idea", "promote to PRD", "execute #42", "let's work on owner/repo#42".
license: MIT
metadata:
  author: cgaravitoq
  version: "1.0"
---

# GitHub Issues (per-repo bundle)

Entry point for this repo's GitHub Issues workflow. Loaded by the `architect` agent when present at `.agents/skills/github-issues/SKILL.md`.

This bundle is **per-repo**. Each repo declares its own status labels, sub-skill set, and handoff rules. The architect adapts to whatever this file says — there are no hard-coded status names in the agent.

The execution sub-skill (`prd-to-execution` in this default bundle) delegates to the global `pipeline-execution` skill for the actual code work (`exec → reviewer → fixer × ≤3 → draft PR`). Customizing this bundle is mostly about renaming status labels and tweaking shaping rules — the implementation pipeline stays the same across repos.

## Customizing for your workspace

After installing this template into a repo (`./scripts/install-github-issues-skill.sh`), edit:

1. **The status label names below** if you prefer different conventions (e.g. `status:spec-draft` instead of `status:draft`, `status:spec-ready` instead of `status:prd`).
2. **The sub-skill bodies** to match your shaping conventions (e.g. always-parent-issue vs. single-issue intake).
3. **`references/status-mapping.md`** if you want a translation table instead of editing every file.

Run `references/setup-labels.sh` once to seed the status and type labels in the repo.

The default below is an opinionated flow. Replace it with whatever your workflow uses.

## Status Flow

The single source of truth for workflow position is a `status:*` label on the issue. **Exactly one `status:*` label is active per issue at any time.** Transitions = remove the old label + add the new one in a single `gh issue edit`.

```text
idea -> draft -> prd -> running -> hitl -> ready
```

| Status          | Meaning                                                                                     | Owner                  |
| --------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| `status:idea`   | Raw capture. Why is unclear or value is unconfirmed. Cannot yet be shaped without guessing. | `idea-to-issue`        |
| `status:draft`  | Shape known but missing decisions still block execution.                                    | `project-to-draft`, `draft-to-prd` (shaping) |
| `status:prd`    | Final spec ready to execute. AI-agent execution plan is written to the body.                | `draft-to-prd`         |
| `status:running`| At least one execution task is in progress on the parent branch.                            | `prd-to-execution`     |
| `status:hitl`   | All tasks done, draft PR open, awaiting human review.                                       | `prd-to-execution` → human |
| `status:ready`  | PR merged / shipped.                                                                        | human / GitHub         |

Workspaces with different label names map them in `references/status-mapping.md` (create one if your labels differ from the defaults).

`type:*` labels run in parallel and never conflict with `status:*`: `type:feature`, `type:bug`, `type:refactor`, `type:chore`, `type:docs`, `type:infra`, `type:perf`, `type:test`. They mirror conventional-commit prefixes for the eventual ship.

## Skills

- `idea-to-issue/SKILL.md`: classify a raw idea and capture it on GitHub Issues, either as a single `status:idea`/`status:draft` issue or as a parent issue (acting as a "project") + initial draft set.
- `project-to-draft/SKILL.md`: split an existing parent issue into `status:draft` child issues, with `status:idea` fallbacks for slices that cannot yet be shaped.
- `draft-to-prd/SKILL.md`: promote one `status:draft` issue into `status:prd` through a structured guided interview that resolves missing decisions and writes the AI-agent execution plan into the issue body.
- `prd-to-execution/SKILL.md`: execute one `status:prd` issue inside its target repo through a single parent branch and one draft PR.

## Routing

When the user invokes the architect with a GitHub-Issues-related request, route by **current state of the artifact**, not by the verb the user used:

1. **Raw idea, no GitHub issue yet** → `idea-to-issue`.
2. **Existing parent issue without enough child issues** → `project-to-draft`.
3. **Existing `status:draft` issue, missing decisions or no execution plan** → `draft-to-prd`.
4. **Existing `status:prd` issue, ready to ship** → `prd-to-execution`.
5. **Existing `status:running` / `status:hitl` / `status:ready` issue** → no skill; report status and ask the user what they want next.

If the user gives an issue ID (`#42` or `owner/repo#42`), fetch it first via `gh issue view --json number,title,body,labels,milestone` and let the actual `status:*` label decide the route. Do not trust verbs like "execute" if the issue is still in `status:draft`.

## Multi-Repo Resolution

Projects can span many GitHub repos. Before starting any execution work, the agent must resolve the target repo for the issue. **This is the single source of truth for the resolution algorithm**; sub-skills reference this section instead of redefining the order.

### Resolution order

Stop at the first hit:

1. The **issue body** has an explicit `## Repo` section with `GitHub:` set.
2. The **issue body** has an inline GitHub link (repo URL, blob, tree, or PR URL) outside `## Parent Reference`.
3. The **parent issue body** (when this issue is a child via tasklist) has a `## Repo` section or inline GitHub URL.
4. The **issue resides in** a single-repo bundle (i.e. it lives in the only repo that owns this work) — use that repo's `owner/name`.
5. Ask the user explicitly: *"Which local path is this repo at?"*.

`## Parent Reference` links are intentionally lower priority than the issue body's own links — a child issue can override its parent's repo.

### Disambiguation

If multiple sources at the **same priority level** point to different GitHub URLs (e.g. the body has links to two distinct repos), do not guess:

- Stop and present the candidates to the user with their source (which section / which inline link).
- Ask which is the target repo.
- After the answer, write the resolved repo into a `## Repo` section in the issue body so future runs do not re-ask.

If a single PRD genuinely needs to ship in two repos, that PRD is too big — recommend splitting via `project-to-draft`.

### Persistence

Once resolved, write to the issue body under a `## Repo` section so future runs reuse it:

```md
## Repo

- GitHub: https://github.com/<owner>/<name>
- Local: <absolute or `~`-relative path on this machine>
```

The `Local` path is machine-specific. On a new machine, re-resolve and overwrite. The architect must never assume a path persisted from another machine works on the current one — verify it exists before using it.

## Shared Workflow Invariants

- GitHub Issues is the source of truth for workflow state, issue shape, and execution handoffs. The active `status:*` label is the contract.
- A **parent issue** (when one exists) is the durable brief; child issues link back via the parent's tasklist (`- [ ] owner/repo#N`) and carry only slice-specific context.
- Status names are the workflow contract. Do not abstract `idea`, `draft`, `prd`, `running`, `hitl`, `ready` into generic states inside the body — they live as `status:*` labels.
- One executable PRD = one parent branch + one draft PR + one GitHub issue. Task coordination during execution lives inline in the parent body (markdown checkboxes plus `Status` and `Commit` fields) and issue comments. No sub-issues are created for tasks.
- The default flow does not assume a project lead or weekly project-update cadence. Add those conventions in your per-repo bundle if you need them.
- The agent never flips `status:idea → status:draft` autonomously. That transition requires the human to confirm the value hypothesis is real (see `idea-to-issue/SKILL.md`).
- The agent flips `status:draft → status:prd` only after the explicit consolidation gate in `draft-to-prd`.
- The agent moves `status:prd → status:running` only when the first execution task starts. It moves `status:running → status:hitl` only when every task is done, the draft PR exists, and verification passed. It does not move issues to `status:ready`; the human (or a merge) owns that.

## Workflow

```text
idea-to-issue -> [optional: project-to-draft] -> draft-to-prd -> prd-to-execution
```

1. Use `idea-to-issue` to classify and capture. The skill itself decides whether the input becomes a single issue or a parent issue plus initial drafts.
2. Use `project-to-draft` only when an existing parent issue still needs child issues, or when `idea-to-issue` created a parent and you want to expand the slice set.
3. Use `draft-to-prd` to promote one `status:draft` issue to `status:prd`. One promotion per session unless the user explicitly asks for a batch.
4. Use `prd-to-execution` to execute exactly one `status:prd` issue at a time. Resolve the repo, switch to it, run the parent branch + draft PR loop, hand off to human review.
5. When the user wants narrow standalone work that does not need the full flow, use the `gh` CLI directly without loading the sub-skills.

## Tooling

Reads and writes happen through `gh` CLI commands. Useful patterns the sub-skills depend on:

```bash
# Read
gh issue view <N> --json number,title,body,labels,milestone,state,url
gh issue list --label "status:ready" --state open --json number,title,labels --limit 50

# Create
gh issue create --title "..." --body-file ./body.md --label "status:idea,type:feature"

# Edit body (full replace; re-fetch first to avoid clobbering)
gh issue edit <N> --body-file ./body.md

# Edit labels (single transition: swap status)
gh issue edit <N> --remove-label "status:draft" --add-label "status:prd"

# Comment (event log)
gh issue comment <N> --body-file ./comment.md

# Branch from issue (linked in the sidebar)
gh issue develop <N> --name <username>/<N>-<short-slug> --checkout

# Close
gh issue close <N> --reason completed
gh issue close <N> --reason "not planned"
```

For parent-tasklist progress (sub-issues `- [ ] owner/repo#N` in the parent body), GitHub renders progress automatically. To mutate the parent body safely under concurrent writes, always:

1. `gh issue view <parent> --json body --jq .body > parent.md`
2. Mutate `parent.md` locally (only the specific task block).
3. `gh issue edit <parent> --body-file parent.md`

If the body changed between read and write (e.g. another agent commented or you edited via UI), re-fetch and retry once.

## End-To-End Dry Run

Use this checklist when validating the workflow on a real issue:

1. `idea-to-issue` either created a `status:idea` issue (value unconfirmed), a `status:draft` issue (single executable slice), or a parent issue with at least one `status:draft` slice attached via tasklist.
2. `project-to-draft` created shaped `status:draft` issues or `status:idea` fallbacks, all linked from the parent's tasklist, with no duplicates.
3. `draft-to-prd` promoted exactly one issue to `status:prd` only after resolving missing decisions and writing `## AI Agent Execution Plan` to the issue body.
4. `prd-to-execution` resolved the target repo, recorded it on the issue, ran every execution-plan task inline (body checkbox + `Status` + `Commit`) on the parent issue, started one shared branch, recorded implementation evidence in the body and issue comments, and shipped one draft PR.
5. Final handoff to the user includes: issue state, repo, branch, commit, draft PR URL, verification evidence, and any non-goals that were skipped.

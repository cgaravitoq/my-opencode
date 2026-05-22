## Draft-To-PRD Readiness Reference

Templates and rules for promoting a `status:draft` GitHub issue into `status:prd`.

## Workflow Position

```text
idea-to-issue -> [project-to-draft] -> draft-to-prd -> prd-to-execution
```

`draft-to-prd` has one job: promote a draft into an executable PRD with a final AI-agent execution plan wired into the issue body. If a draft cannot become executable without guessing, leave it at `status:draft` and make the missing decisions visible.

## PRD Criteria

Before flipping to `status:prd`, the issue must answer:

- Why are we doing this? (one line that moves: revenue, retention, cost, risk, learning, fun, ergonomics)
- What has to be true when shipped? (concrete behavior, not aspiration)
- What is out of bounds? (explicit non-goals)
- How do we verify it? (concrete commands or observable proof)
- Which repo owns the work? (`## Repo` resolved)
- Does the body include `## AI Agent Execution Plan` with `- [ ]` tasks?

If any answer is missing, leave the issue at `status:draft`.

## PRD Issue Template

Label: `status:prd` + relevant `type:*`. Body shape:

```md
## Why

[What line this moves: revenue, retention, cost, risk, learning, fun, ergonomics. One sentence.]

## What

[What must be true when this ships. Concrete behavior.]

## Scope

### In

- [Concrete included behavior]

### Out

- [Explicit non-goal]

## Verify

- [Observable proof: command, manual flow, screenshot, metric]

## Repo

- GitHub: [repo URL]
- Local: [filled at execution time, leave blank now]

## AI Agent Execution Plan

Execution mode: [direct agent execution | split into parallel agent tasks]
Parent branch: <username>/<issue-number>-<short-slug>
Parent PR: one draft PR only

Agent tasks:

- [ ] [Task title]
  - Owner: [`exec` direct, or `architect` for tasks with no code change]
  - Surface: [files / package / app / system area]
  - Output: [what must be committed]
  - Depends on: [task title or `none`]
  - Verify: [command or manual flow for this task]
  - Status: pending
  - Commit: —

Coordination rules:

- All task work lands on the parent branch.
- No task gets its own branch, PR, GitHub sub-issue, or release label.
- Task progress tracked inline via the checkbox (`[ ]` → `[-]` in progress → `[x]` done) plus the `Status` and `Commit` fields. Sub-issues are not created.
- Comments on the parent issue document events (start, commit, blocker, completion). The body holds source-of-truth status; the comment timeline is the event log.

## Parent Reference

- Parent: [owner/repo#N or `standalone`]
- Relevant resources: [links or none]
```

`## AI Agent Execution Plan` is required before `status:prd`. Use direct execution for small specs; use task slices only when the work has disjoint surfaces that can ship in one parent PR.

## Branch Naming

```text
<username>/<issue-number>-<short-slug>
```

- `<username>`: the assignee's GitHub username (e.g. `carlos`).
- `<issue-number>`: the issue number without `#` (e.g. `42`, `127`).
- `<short-slug>`: kebab-case summary, ≤ 6 words (e.g. `add-jwt-rotation`).

Full example: `carlos/42-add-jwt-rotation`. This is what `gh issue develop <N> --name <branch>` writes, and what GitHub displays as the linked branch in the issue's sidebar.

## Label Transitions

| Situation                                              | Active label    |
| ------------------------------------------------------ | --------------- |
| Execution can start without guessing                   | `status:prd`    |
| Shape mostly known but decisions still pending         | `status:draft`  |
| Separate unresolved product question surfaced          | `status:idea`   |
| Implementation actively running                        | (left for `prd-to-execution`) |

Do not move promoted issues past `status:prd` from this skill. `status:running`, `status:hitl`, and `status:ready` belong to execution and human review. Workspace-specific overrides live in `../../references/status-mapping.md`.

## Issue Update Requirements

Before flipping the label to `status:prd`, update the issue body with:

- finalized PRD content (Why, What, Scope, Verify, Repo, Parent Reference)
- `## AI Agent Execution Plan` (execution mode, parent branch, parent PR rule, task list)
- coordination rules block

Do not leave the final plan only in chat. The issue body is the source of truth for `prd-to-execution`.

## Anti-Patterns

- Flipping to `status:prd` while `Missing Decisions` remain.
- Empty `## Verify` ("looks fine when done") — must be observable.
- `## Repo` left as `TBD`.
- Task list with vague tasks ("add stuff to the API"). Each task names its surface.
- Listing more than ~5 tasks for a single PRD — that usually means the slice should be split into multiple drafts and re-shaped via `project-to-draft`.
- Skipping the consolidation gate.
- Editing the issue body without re-fetching first under concurrent writes.

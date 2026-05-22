## Project-To-Draft Readiness Reference

Templates and rules for splitting a parent GitHub issue into `status:draft` child issues (with `status:idea` fallbacks).

## Workflow Position

```text
idea-to-issue -> [project-to-draft] -> draft-to-prd -> prd-to-execution
```

`project-to-draft` only splits parent issues. It does not promote, plan, or implement.

## Slice Split Guidance

Create multiple drafts when the parent has distinct:

- user workflows
- launch surfaces (CLI, web, API, dashboard)
- repos (multi-repo parent)
- permission or access boundaries
- analytics or instrumentation contracts
- integrations
- implementation areas with different technical surfaces

Prefer 2–7 drafts. One-draft "parents" are usually a sign the parent should be a standalone draft instead — flag it in the handoff.

Good drafts are independently promotable: each has its own clear scope, repo, and verification path. `draft-to-prd` should be able to harden one without reconstructing the others.

## Draft Criteria

Before creating a `status:draft`, the slice must answer:

- Why does this slice exist (which line does it move)?
- What likely must be true when it ships?
- What is tentatively in vs out?
- What decisions still block `status:prd` promotion?
- What verification path is likely?
- Which repo owns the work?
- Does the slice reference the parent brief without duplicating it?

If any of these are unanswerable without guessing, create a `status:idea` issue instead.

## Draft Issue Template

Label: `status:draft` + relevant `type:*`. Body shape:

```md
## Why

[What line this moves: revenue, retention, cost, risk, learning, fun, ergonomics. One sentence.]

## What

[What likely must be true when this slice ships. Concrete behavior, not aspiration.]

## Scope

### In

- [Concrete included behavior]

### Out

- [Explicit non-goal]

## Missing Decisions

- [Decision that blocks `status:prd` promotion]

## Verify

- [Likely observable proof: command, manual flow, screenshot, metric]

## Repo

- GitHub: [repo URL for this slice]
- Local: [filled at execution time]

## Parent Reference

- Parent: [owner/repo#N]
- Relevant resources: [links or none]
```

## Idea Fallback Template

Label: `status:idea` + relevant `type:*` (omit type if unclear). Use when the slice cannot become a draft without guessing.

```md
## Why

[Why this slice matters within the parent.]

## Value Hypothesis

- Value: [What this would unlock if validated. Mark as assumption if unproven.]
- Validation Path: [How to confirm. Examples: prototype, customer interview, instrumentation, lead approval.]

## Current Understanding

- [What is known]

## Missing Decisions

- [Question that blocks turning this into a `status:draft`]

## Next Step

[The smallest action that turns this into a `status:draft`.]

## Repo

- GitHub: [repo URL for this slice, or `unresolved` — must be filled before promotion to `status:draft`]
- Local: [filled at execution time]

## Parent Reference

- Parent: [owner/repo#N]
```

`## Repo` is included even on `status:idea` issues so the slice carries its target repo from inception. If the repo is genuinely unknown (e.g. the slice is "decide where this lives"), set `GitHub: unresolved` and add the repo decision to `## Missing Decisions`.

`Value Hypothesis` is required. A `status:idea` exists not just because the shape is unclear but because the value is unconfirmed.

## Promotion Rules

- `status:idea → status:draft` is **human-only**. Agents may shape the body of a `status:idea` but must not flip the label. The human confirms the value hypothesis is validated.
- `status:draft → status:prd` is owned by `draft-to-prd`, not by this skill.
- `status:draft` is not "ready to execute". `Missing Decisions` are gates: while any are open, `prd-to-execution` must not run on the slice.

## Status Mapping

| Situation                                          | Label          |
| -------------------------------------------------- | -------------- |
| Shape mostly known, refinement pending             | `status:draft` |
| Why exists but scope or value not yet confirmed    | `status:idea`  |
| Slice is shaped, planned, and execution-ready      | (left for `draft-to-prd`) |

Do not leave classified parent-backed issues unlabeled or with a generic `triage` label that is not in the canonical flow. Pick `status:idea` or `status:draft` explicitly.

## Multi-Repo Parents

If the parent owns slices across multiple repos:

- The parent body's `## Repo` section lists every repo with its slice mapping (see `idea-to-issue/references/capture-shape.md`).
- Each child `status:draft` names a single repo in its own `## Repo` section.
- Slices that claim "all repos" are too big — split them further.
- Child issues can live in different repos; reference them in the parent's `## Children` tasklist with the cross-repo form `owner/repo#N`.

## Tasklist hygiene

The parent's `## Children` tasklist is the single source of truth for which child issues are in scope. Whenever a child is created, closed, or renamed:

- Re-fetch the parent body before editing (do not cache).
- Update only the tasklist block; leave the rest of the parent body alone.
- Use the cross-repo form `- [ ] owner/repo#N` even when child lives in the same repo — it survives renames and is unambiguous.

## Anti-Patterns

- Creating one giant `status:draft` because slicing felt hard.
- Promoting a `status:idea` to `status:draft` autonomously.
- Copying the full parent brief into every child issue.
- Silent `## Repo: TBD`. Either resolve the repo or capture a `status:idea` asking which repo it belongs to.
- Creating drafts for slices that were never in the parent description (drift).
- Forgetting to update the parent's `## Children` tasklist after creating a child issue — breaks GitHub's native progress rendering.

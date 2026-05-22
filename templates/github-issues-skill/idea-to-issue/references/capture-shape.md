## Idea-To-Issue Capture Reference

Templates and classification rules for the personal GitHub Issues flow.

## Workflow Position

```text
idea-to-issue -> [optional: project-to-draft] -> draft-to-prd -> prd-to-execution
```

`idea-to-issue` has one job: classify the input and persist it as a GitHub issue with the right `status:*` label. It does not promote, plan, or implement.

## Classification Rules

Use this table to pick exactly one outcome.

| Signal                                                                                       | Outcome                       |
| -------------------------------------------------------------------------------------------- | ----------------------------- |
| User said "tengo una idea pero no sé si vale", "captura esto", "para después", "quizá".      | Single `status:idea` issue    |
| Value is unclear, no validation path, no scope, no repo.                                     | Single `status:idea` issue    |
| One repo, one verifiable outcome, scope fits in a single PR, user wants to work on it soon.  | Single `status:draft` issue   |
| Multiple distinct user workflows, surfaces, repos, or permission boundaries.                 | Parent issue + child drafts   |
| Idea has a launch milestone or completion window spanning several slices.                    | Parent issue + child drafts   |
| Idea is a research / exploration with no implementation surface.                             | Single `status:idea` issue    |
| Existing parent issue already covers this — just need a new slice.                           | Update existing parent (no new parent) |

When two rules conflict, prefer the **smaller** artifact. It is easier to grow a `status:idea` into a `status:draft` later than to dismantle a noisy parent issue.

## Single `status:idea` Issue Template

Label: `status:idea`. The body must make ambiguity visible without faking certainty.

```md
## Why

[Why this matters. What line it would move if validated: revenue, retention, cost, risk, learning, fun, ergonomics.]

## Value Hypothesis

- Value: [What I expect this to unlock. Mark as assumption if unproven.]
- Validation Path: [How I will know if the hypothesis holds. Examples: try it for a week, ship a quick prototype, ask N users, run a benchmark.]

## Current Understanding

- [What I know right now]

## Missing Decisions

- [Question that blocks turning this into a `status:draft`]

## Next Step

[The smallest action that can either validate the hypothesis or sharpen the shape into a `status:draft`.]

## Repo

- GitHub: [repo URL or `n/a` for non-code work]
- Local: [filled at execution time, leave blank now]
```

## Single `status:draft` Issue Template

Label: `status:draft`. Use only when the slice is genuinely executable as one PR.

```md
## Why

[What line this moves: revenue, retention, cost, risk, learning, fun, ergonomics.]

## What

[What must be true when this ships. Concrete behavior, not aspiration.]

## Scope

### In

- [Concrete included behavior]

### Out

- [Explicit non-goal]

## Missing Decisions

- [Decision that still blocks `status:prd` promotion. None is fine if there really aren't any.]

## Verify

- [Observable proof: command output, manual flow, screenshot, metric.]

## Repo

- GitHub: [repo URL]
- Local: [filled at execution time, leave blank now]

## Parent Reference

- Parent: [parent issue ref like `owner/repo#N` or `standalone`]
```

`Missing Decisions` is the gate: while any are open, the issue stays in `status:draft`. The `status:draft → status:prd` promotion is owned by `draft-to-prd`.

## Parent Issue Template

For project-sized ideas, GitHub Issues uses a **parent issue** with a tasklist of child issues. The parent body holds the durable brief; children carry only slice-specific context.

```md
[One short paragraph: what this parent owns, why it exists, what currently blocks the outcome.]

## Scope

### 1. [Slice group]

- [Concrete capability or boundary]

### 2. [Slice group]

- [Concrete capability or boundary]

## Launch Behavior

[What I can do, observe, or measure when the parent is "done".]

## Out Of Scope

- [Explicit non-goal]

## Repo

- GitHub: [repo URL or list of repos if multi-repo]
- Local: [filled at execution time]

## Children

- [ ] owner/repo#<child-N>  [short title]
- [ ] owner/repo#<child-M>  [short title]
```

GitHub renders `- [ ] owner/repo#N` tasklist items with live status (open/closed icon, title autopopulate, progress count in the parent's listing). Keep the parent description durable enough that `project-to-draft` can split it into draft slices later without reconstructing intent.

## Multi-Repo Capture

For parent issues spanning multiple repos, list each repo under `## Repo` with the slice that belongs to it:

```md
## Repo

- https://github.com/me/api — backend slices
- https://github.com/me/web — frontend slices
- https://github.com/me/cli — operator tooling
```

Each child draft issue then names its specific repo in its own `## Repo` section. Slices never claim "all repos"; if they do, split them further.

Where does the parent issue *live*? Pick the repo whose work dominates the parent (or a `meta`/`coordination` repo if you have one). Children can live in different repos and reference the parent across repos via `owner/repo#N`.

## Promotion Rules

- `status:idea → status:draft` is **human-only**. The agent may shape the body of an existing `status:idea` (fill `Why`, `Value Hypothesis`, `Current Understanding`, `Missing Decisions`, `Next Step`) but must not flip the label. The human confirms validation explicitly.
- `status:draft → status:prd` is owned by `draft-to-prd` after the consolidation gate. Not by this skill.
- Skipping statuses (e.g. `status:idea → status:prd`) is forbidden. Walk the flow.

## Label Mapping (workspace overrides)

The defaults are `status:idea`, `status:draft`, `status:prd`, `status:running`, `status:hitl`, `status:ready`. If your repo uses different label names, record the mapping in `../../references/status-mapping.md` before relying on the skills.

Without overrides, all skills assume the defaults and write label names verbatim.

## Anti-Patterns

- Creating a parent issue for a single-slice idea "in case it grows".
- Forcing a `status:draft` when the value is still unconfirmed (it should be `status:idea`).
- Copying the full parent brief into every child draft.
- Setting `## Repo` to "TBD" silently — either resolve it or ask.
- Using `Missing Decisions` as a wishlist instead of as the gate to `status:prd`.
- Two `status:*` labels on the same issue. Always remove the old before adding the new.

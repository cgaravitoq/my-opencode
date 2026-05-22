---
name: project-to-draft
description: Split an existing parent GitHub issue into status:draft child issues, or create status:idea fallback issues for slices that cannot yet be shaped. Use after idea-to-issue (when it created a parent issue) and before draft-to-prd.
---

# Project To Draft

Split a parent GitHub issue into one or more `status:draft` child issues that `draft-to-prd` can promote later. For slices that cannot be shaped without guessing, create or update a `status:idea` fallback issue.

This is the optional middle step in the personal GitHub Issues workflow:

```text
idea-to-issue -> [project-to-draft] -> draft-to-prd -> prd-to-execution
```

Skip this skill when the parent already has a complete draft set, when there is no parent (single-issue work), or when the slices were created upfront in `idea-to-issue`.

## Inputs

- Parent issue ref (`#N` if in the same repo, `owner/repo#N` if cross-repo) or URL.
- Optional: parent goal, target date, known constraints, desired slice breakdown, repo(s).

## Sources Of Truth

- Use `gh` CLI for all reads and writes (`gh issue view`, `gh issue create`, `gh issue edit`).
- Load the parent issue (`gh issue view <parent> --json number,title,body,labels,milestone,url`).
- Parse the parent's `Children` tasklist (`- [ ] owner/repo#N`) to discover existing child issues; fetch each in parallel with `gh issue view` to get their current `status:*` labels.
- Treat the parent body as the durable brief — never duplicate it into child issues.
- Use [references/draft-readiness.md](references/draft-readiness.md) for draft criteria, the `status:draft` and `status:idea` body templates, and the slice promotion rules.
- Use `../SKILL.md` for status flow, multi-repo resolution, and shared invariants.

## Workflow

1. **Fetch the parent and its children.**
   - Confirm parent labels (`status:draft` is the expected label for a shaped parent), title, body, and `## Repo` section.
   - Parse the `## Children` tasklist; for each `- [ ] owner/repo#N`, fetch the child to see its current `status:*` label.
   - Refine or extend existing context; do not create duplicate slices.

2. **Resolve repo(s) for the parent.**
   - Apply the multi-repo resolution rules from `../SKILL.md`.
   - For multi-repo parents, ensure the parent body's `## Repo` section lists every repo with the slice it owns.
   - Each child draft must name a single repo in its own `## Repo` section.

3. **Split the parent into slices.**
   - Derive slices from the parent description (`## Scope`, `## Launch Behavior`, `## Out Of Scope`).
   - Create multiple drafts for distinct user workflows, surfaces, repos, permission boundaries, integrations, or analytics contracts.
   - Prefer 2–7 drafts per real parent. Use one draft only when the parent is genuinely a single executable slice (in which case you probably should not have a parent at all — flag it).
   - Each draft must be independently promotable by `draft-to-prd`.

4. **Decide draft vs idea per slice.**
   - Create or update a `status:draft` issue when the slice has a clear why, rough scope, observable verification, and known missing decisions.
   - Create or update a `status:idea` issue when the slice is missing product judgment, scope, value validation, or owner/repo clarity.
   - Never create `status:prd`, `status:running`, `status:hitl`, or `status:ready` issues from this skill.

5. **Write each child issue.**
   - Use the templates in [references/draft-readiness.md](references/draft-readiness.md).
   - Title: imperative, repo-prefixed when relevant.
   - Labels: `status:draft` (or `status:idea`) + the relevant `type:*`.
   - Reference the parent via `## Parent Reference` (`owner/repo#N`); do not copy the full brief into the child body.
   - Include only slice-specific context, scope, missing decisions, verification, and the slice's repo.
   - Create with `gh issue create --title "..." --body-file ./body.md --label "status:draft,type:<x>"` (capture the returned issue number).

6. **Update the parent's tasklist.**
   - Re-fetch the parent body: `gh issue view <parent> --json body --jq .body > parent.md`.
   - Append (or update) the `## Children` block with `- [ ] owner/repo#<child-N>  <short title>`.
   - Write back: `gh issue edit <parent> --body-file parent.md`.
   - This keeps GitHub's native sub-issue progress (open/closed counter on the parent) accurate.

7. **Promotion guardrail for existing `status:idea` issues.**
   - You may shape the body of an existing `status:idea` (fill `Why`, `Value Hypothesis`, `Current Understanding`, `Missing Decisions`, `Next Step`) but **must not** flip its label to `status:draft`.
   - The `status:idea → status:draft` transition is human-only — the human confirms the value hypothesis is validated.
   - Surface the proposed promotion in the handoff so the human can act.

8. **Hand off.**
   - Return every created or updated issue grouped by `status:*` label.
   - For `status:draft` issues, list the recommended `draft-to-prd` order (smallest blast radius first, blockers earliest).
   - For `status:idea` issues, list the missing decisions per slice.
   - Confirm the parent still has a `## Repo` section pointing at the right repo(s).

## Readiness Check

Before creating a `status:draft`, confirm the slice meets the criteria in [references/draft-readiness.md](references/draft-readiness.md). If it does not, create or update a `status:idea` issue instead.

## Guardrails

- Do not create parent issues from this skill — that is `idea-to-issue`'s job.
- Do not create duplicate drafts for the same slice.
- Do not collapse unrelated slices into one oversized draft.
- Do not promote `status:idea` to `status:draft` from this skill — human-only.
- Do not promote `status:draft` to `status:prd` from this skill — that's `draft-to-prd`.
- Do not copy the full parent brief into every child body.
- Do not skip the `## Repo` section on child drafts; `prd-to-execution` will fail without it.
- Do not invent slices that are not in the parent description. If a missing surface is needed, update the parent description first or create a `status:idea` to capture the gap.
- Do not write more than one `status:*` label per issue. When updating an existing one, always remove the old before adding the new in a single `gh issue edit`.

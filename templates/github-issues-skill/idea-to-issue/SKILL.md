---
name: idea-to-issue
description: Capture a raw idea on GitHub Issues. Decides whether the idea becomes a single issue (status:idea or status:draft) or a parent issue (acting as a project) plus an initial draft set. Use as the first step before project-to-draft, draft-to-prd, and prd-to-execution.
---

# Idea To Issue

Turn a raw idea into the right GitHub Issues artifact for a personal project or side-project, without losing the original intent and without inventing scope.

This is the entry point of the personal GitHub Issues workflow:

```text
idea-to-issue -> [optional: project-to-draft] -> draft-to-prd -> prd-to-execution
```

Use [references/capture-shape.md](references/capture-shape.md) for issue and parent-issue body templates, classification rules, and the multi-repo capture format.

## Goal

Decide one of three outcomes and execute it:

1. **Single `status:idea` issue** — value or shape is too unclear to commit to scope. Capture the why, hypothesis, and missing decisions; do not invent scope.
2. **Single `status:draft` issue** — narrow executable slice with a clear shape. One repo, one slice, no parent container needed.
3. **Parent issue + initial `status:draft` issues** — multi-slice work that needs a shared brief. Create the parent issue with the brief and a tasklist (`- [ ] owner/repo#N`), attach an initial draft set (or `status:idea` fallbacks for unclear slices), and recommend the next skill.

Never create `status:prd`, `status:running`, `status:hitl`, or `status:ready` issues from this skill.

## Inputs

- One raw idea, free-form.
- Optional: target repo (GitHub URL or local path), urgency, dependencies, prior issues to link.

## Sources Of Truth

- Use `gh` CLI for all reads and writes (`gh issue view`, `gh issue create`, `gh issue list`, `gh issue edit`).
- Search GitHub Issues for similar work before creating anything; prefer extending an existing artifact over creating a duplicate (`gh issue list --search "<keywords>"`).
- Use `../SKILL.md` for the status flow, multi-repo resolution rules, and shared invariants.
- Use [references/capture-shape.md](references/capture-shape.md) for templates and classification criteria.

## Workflow

1. **Clarify only blocking ambiguity.**
   - Ask only what changes the boundary, the repo, or the classification (idea vs draft vs parent).
   - Maximum 2 questions. If more are needed, capture as `status:idea` and stop — the input is not ready for `status:draft`.

2. **Search before creating.**
   - `gh issue list --search "<keywords>" --state open` and `gh issue list --search "<keywords>" --state closed --limit 20`.
   - If a matching `status:idea`, `status:draft`, or active parent issue exists, update or extend it instead of creating a duplicate.
   - Surface the matches to the user before mutating.

3. **Resolve the target repo.**
   - Apply the multi-repo resolution rules from `../SKILL.md`.
   - If unresolved and the user did not specify, ask once: *"Which repo does this belong to?"*. Record the answer in the `## Repo` section of the issue/parent body.
   - For pure-product or research ideas with no repo, skip the `## Repo` section.

4. **Classify.**
   - Apply the classification rules in [references/capture-shape.md](references/capture-shape.md).
   - Pick exactly one of: `status:idea` issue, `status:draft` issue, or parent issue + drafts.

5. **Create the artifact.**

   For a single `status:idea` issue:
   - Title: imperative, repo-prefixed if relevant (e.g. `repo-name: short title`).
   - Labels at creation: `status:idea` + the relevant `type:*` (when the type is unambiguous; skip if unclear).
   - Body: use the `idea` template from `references/capture-shape.md`.
   - Create: `gh issue create --title "..." --body-file ./body.md --label "status:idea,type:<x>"`.

   For a single `status:draft` issue:
   - Title: imperative, repo-prefixed if relevant.
   - Labels at creation: `status:draft` + `type:*`.
   - Body: use the `draft` template from `references/capture-shape.md`.
   - Attach the repo link inside `## Repo` and any prior decision references.

   For a parent issue + initial drafts:
   - Create the parent issue with the parent template from `references/capture-shape.md`.
   - Labels at creation: `status:draft` on the parent (the parent itself is a shaped brief, not an idea) + `type:*`. Optionally a custom `kind:parent` label if you want to filter parents from regular drafts.
   - Create one or more child issues at `status:draft` for shaped slices.
   - Create child issues at `status:idea` for slices that are not yet shaped.
   - Add a tasklist to the parent body: `- [ ] owner/repo#<child-N>` for each child. GitHub renders progress automatically.
   - Recommend `project-to-draft` next if more slices need to be carved.

6. **Hand off.**
   - Return the created or updated artifacts grouped by `status:*` label.
   - State the next skill in the flow:
     - `status:idea` issue → wait for the human to validate the hypothesis, then re-run `idea-to-issue` (or move to `project-to-draft` if it grew into a parent).
     - `status:draft` issue → `draft-to-prd` whenever the user is ready to promote.
     - Parent + drafts → `project-to-draft` to expand, or `draft-to-prd` to promote one of the existing drafts.
   - Never instruct the user to change labels manually unless explicitly authorized.

## Classification (Quick Rules)

Use the full criteria in [references/capture-shape.md](references/capture-shape.md). Quick version:

- **`status:idea` issue** when value is unconfirmed, scope is unknown, or the user said "let's capture this for later".
- **`status:draft` issue** when there is one clear slice, one repo, one verifiable outcome, and the user wants to work on it soon.
- **Parent issue + drafts** when the idea has multiple distinct surfaces, multiple repos, multiple workflows, or a launch boundary that spans several slices.

## Guardrails

- Do not promote a `status:idea` to `status:draft` autonomously. The transition is human-only — the human must confirm the value hypothesis is validated.
- Do not create `status:prd`, `status:running`, `status:hitl`, or `status:ready` issues from this skill.
- Do not create parent issues for narrow ideas just to "be safe". A parent with a single child issue is noise.
- Do not duplicate existing issues; extend them instead.
- Do not invent the repo. If unresolved, ask.
- Do not skip the `## Repo` section for repo-bound work; future skills depend on it.
- Do not exceed 2 clarifying questions. If you need more, capture as `status:idea` and let the human shape it later.
- Do not write more than one `status:*` label per issue. If the create command would attach two, fail loudly — that is a workflow bug.

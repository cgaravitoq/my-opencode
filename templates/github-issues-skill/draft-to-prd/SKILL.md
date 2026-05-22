---
name: draft-to-prd
description: Promote one GitHub issue from status:draft to status:prd through a three-phase guided interview that resolves missing decisions, scope, verification, and the AI-agent execution plan. Use after idea-to-issue or project-to-draft and before prd-to-execution.
---

# Draft To PRD

Turn one `status:draft` issue into one `status:prd` issue through a structured guided interview, so `prd-to-execution` can run it without reconstructing intent or inventing an execution plan.

This is the readiness gate in the personal GitHub Issues workflow:

```text
idea-to-issue -> [project-to-draft] -> draft-to-prd -> prd-to-execution
```

Do not use this skill to split parents, capture ideas, or implement code. Use it to harden one `status:draft` into an executable `status:prd` and write the AI-agent execution plan into the issue body.

## Inputs

- Issue ref (`#N` or `owner/repo#N`) for a `status:draft` issue.
- Optional: answers to known missing decisions, repo confirmation, verification preferences.

## Sources Of Truth

- Use `gh` CLI for all reads and writes (`gh issue view`, `gh issue edit`, `gh issue comment`).
- Fetch the draft issue (`gh issue view <N> --json number,title,body,labels,milestone,url`).
- Fetch the parent issue (if `## Parent Reference` is set) for the durable brief.
- Treat the parent body (when present) as the durable brief.
- Use [references/prd-readiness.md](references/prd-readiness.md) for the `prd` template, execution plan template, and label mapping.
- Use `../SKILL.md` for status flow, multi-repo resolution, and shared invariants.

## Coordination Model

`draft-to-prd` is a **co-authored phase**, not an administrative label flip. The agent runs a structured guided interview while the human reviews the issue body in parallel — two channels working on the same artifact.

### Dual-channel collaboration

- **Chat channel**: agent asks targeted questions; user answers.
- **GitHub channel**: agent updates the issue body live (silently, no verbal announcements). The user can open the issue on GitHub at any moment to verify the spec is taking the shape they intended.

Either side can request changes anytime before the consolidation gate. The GitHub issue body is always the source of truth; chat is one path to update it.

### Human-in-the-loop checkpoints

Three checkpoints anchor human authority across the wider flow. `draft-to-prd` owns the middle one and respects the others:

1. **Before `status:draft` (`status:idea → status:draft`)** — owned by `idea-to-issue` / `project-to-draft`. Human-only transition.
2. **During `status:draft → status:prd`** — owned by this skill, via the three interview phases below.
3. **After PR draft creation (`status:hitl`)** — owned by `prd-to-execution` and the human reviewer.

If the input issue is not yet `status:draft`, stop and route the user back to `idea-to-issue` or `project-to-draft`. Do not promote `status:idea` from this skill.

## Three-Phase Guided Interview

The interview is the primary mechanism this skill uses. Three phases, in order, each with explicit stop conditions.

### Phase 1 — Pre-flight Audit (silent)

Before asking the user anything, audit the draft body and classify every gap into one of three buckets:

- **Blocking gaps** — sections without which `prd-to-execution` cannot start: `Why` not concrete, `Scope` (`### In` / `### Out`) ambiguous, `Verify` missing concrete commands or observable proof, `Missing Decisions` still open, `## Repo` missing or unresolved.
- **Critical gaps** — sections that shape execution shape: `## AI Agent Execution Plan` missing, split decision (single agent vs parallel) unclear, parent branch slug not chosen, task list not concrete.
- **Cosmetic gaps** — wording, ordering, light rephrasing, optional sections.

The output of Phase 1 is **internal**. The agent records the gap inventory and decides how many questions Phase 2 will need.

### Phase 2 — Question Phase (capped)

Ask the user only what blocks promotion. Hard limits:

- **Maximum 3–5 questions per session.** If more are needed, the draft was not ready for `draft-to-prd` — leave it in `status:draft`, add a comment listing what still requires shaping, and stop.
- **Priority order**: blocking gaps first, critical gaps second. Cosmetic gaps are filled by the agent's best reading.
- **One or two questions at a time**, never a wall of questions.
- **Concrete and specific**, never generic. Bad: *"How do you verify this?"* Good: *"Does verify rely on `bun test` only, or do you want a manual smoke run after deploy too?"*
- **Cosmetic fills are marked.** When the agent fills a cosmetic gap on its own, tag the line in the body with `[agent: drafted, please confirm]` so the human can spot it during the consolidation gate.

After each user answer:

- Re-fetch the issue body (`gh issue view <N> --json body --jq .body > body.md`), mutate the corresponding section, write back (`gh issue edit <N> --body-file body.md`). Do not cache the body across edits — parallel writes can clobber.
- Do not announce *"I updated the issue"* in chat.
- Re-evaluate the gap inventory. If all blocking and critical gaps are closed, exit Phase 2 immediately.

If a user answer surfaces a separate unresolved product question that is not part of this draft, capture it as a follow-up `status:idea` issue (do not let it inflate the current draft).

If the user **cannot answer** a blocking gap ("I don't know", "let me think about it", "skip this one"):

- Leave the draft at `status:draft`.
- Add a comment on the issue (`gh issue comment <N> --body-file ./blocker.md`) listing every unresolved blocking gap, verbatim.
- If the unresolved gap is a separable product question (not just "this draft is half-baked"), also create a follow-up `status:idea` issue capturing that specific decision.
- Stop the interview. Do not continue Phase 2 with the remaining questions; the missing answer changes what the rest of the spec needs.
- Do **not** demote the draft to `status:idea`. The draft already has shape; only the missing decision blocks promotion.

The user can resume the interview later by re-invoking `draft-to-prd` on the same issue. Phase 1 will re-audit and start from where the previous session stopped.

### Phase 3 — Final Consolidation Gate

When all blocking and critical gaps are closed:

- Render a compact summary in chat: resolved decisions, parent branch suggestion, the AI Agent Execution Plan (split mode, task list, verification), and the count of `[agent: drafted]` cosmetic items the user should review.
- **Always include the GitHub issue URL** so the user can do a final visual review of the body before answering.
- Ask **one** question, phrased so the user knows the agent — not them — performs the label flip on confirmation: *"PRD ready for promotion. Open the issue at `<URL>` for a final visual review. Reply 'confirm' and I will move `<owner/repo#N>` to `status:prd` for you, or tell me what to adjust first."*
- If the user requests an adjustment, return to Phase 2 narrowed to the requested change.
- On explicit confirmation, the agent — not the user — flips the label via a single `gh issue edit <N> --remove-label status:draft --add-label status:prd`. Do not instruct the user to change the label manually.

Promotion to `status:prd` is the explicit end of `draft-to-prd`. Execution belongs to `prd-to-execution`.

## Workflow

1. **Fetch the draft issue and any parent context.**
   - Confirm `status:draft` is the active label. If `status:idea`, stop and route back to `idea-to-issue` (the `status:idea → status:draft` transition is human-only).
   - Confirm `## Repo` is present and resolved; if not, this is a Phase 2 blocking gap.
   - Search nearby issues with `gh issue list --search "<keywords>"` to avoid overlapping with an existing `status:prd`.

2. Run **Phase 1 — Pre-flight Audit (silent)**. Classify gaps, decide question budget.

3. Run **Phase 2 — Question Phase**. Ask 3–5 targeted questions max, update the issue body live after each answer, mark cosmetic fills.

4. **Harden the spec body.**
   - Replace tentative language with concrete behavior.
   - Preserve parent reference (when applicable) instead of duplicating.
   - Keep only slice-specific context, decisions, scope, verification, repo.
   - Apply the PRD shape from [references/prd-readiness.md](references/prd-readiness.md).
   - Replace any `## Proposed Build Slices` with a final `## AI Agent Execution Plan`.
   - Keep the execution plan concrete enough for `prd-to-execution` to launch workers without re-planning. Tasks are tracked inline as checkboxes — no sub-issues.

5. **Wire the AI-agent execution plan.**
   - Choose direct execution when the spec is small enough for one agent.
   - Choose parallel agent tasks when the work has disjoint surfaces that can land in one parent PR.
   - For each task: owner role, surface (files / package / app area), expected output, dependencies, verification, inline `Status: pending` and `Commit: —`. Tasks are `- [ ]` checkboxes per the template.
   - Include the suggested parent branch name:

     ```text
     <username>/<issue-number>-<short-slug>
     ```

     `<username>` is the assignee's GitHub username. `<issue-number>` is the issue number (no `#`). `<short-slug>` is kebab-case, ≤ 6 words. This is what `gh issue develop <N> --name <branch>` will write.

   - State that all task work uses the parent branch and parent PR only.
   - Do not create sub-issues from this skill.

6. Run **Phase 3 — Final Consolidation Gate**. Render summary, ask the single promotion question, require explicit confirmation before flipping the label.

7. **Persist and promote on GitHub.**
   - Update the issue body with the final PRD content and `## AI Agent Execution Plan` (re-fetch + write).
   - Flip the label only after every readiness criterion below passes and the consolidation gate confirmed promotion: `gh issue edit <N> --remove-label status:draft --add-label status:prd`.
   - Keep the milestone, assignees, and `## Parent Reference` attached.
   - Leave unresolved drafts at `status:draft`; move separate unresolved product questions to new `status:idea` issues.

8. **Hand off.**
   - Return the promoted issue ref and URL.
   - Summarize resolved decisions, remaining non-goals, verification commands.
   - Summarize the AI-agent execution plan that was written to the issue body.
   - List any `[agent: drafted]` cosmetic fills the user should still review.
   - State that the spec is ready for `prd-to-execution`.

## Readiness Check

Before flipping to `status:prd`, the issue must answer:

- Why are we doing this?
- What has to be true?
- What is out of bounds?
- How do we verify it?
- Which repo owns the work?
- Does the issue reference the parent brief without duplicating it (when parent-backed)?
- Can `prd-to-execution` implement without reconstructing intent?
- Does the body include the final `## AI Agent Execution Plan` with `- [ ]` task entries and the parent branch suggestion?
- Did the Phase 3 consolidation gate get an explicit confirmation from the human?

If any criterion is missing, leave the issue at `status:draft` and list the missing decisions.

## Guardrails

- Do not skip the issue lookup or the `## Repo` check.
- Do not promote multiple drafts in one run unless the user explicitly asks for a batch.
- Do not promote `status:idea` issues — that's human-only.
- Do not skip the three-phase interview. Even when the draft looks complete, run Phase 1 silently to verify and Phase 3 explicitly to confirm.
- Do not exceed the 3–5 question budget in Phase 2. If you need more, the draft is not ready — bounce it back.
- Do not announce silent body updates ("I updated the issue") during Phase 2.
- Do not flip the label to `status:prd` without an explicit `confirm` (or equivalent unambiguous affirmative: "yes", "ok", "do it", "go ahead") at the consolidation gate. The Phase 3 prompt asks for `confirm`; accept that or any clear synonym, but never flip on hedged answers ("maybe", "I think so", "let me check").
- Always include the GitHub issue URL in the consolidation gate prompt.
- Do not flip to `status:prd` before updating the issue body with the final AI-agent execution plan.
- Do not create implementation work, sub-issues, or branches from this skill — those belong to `prd-to-execution`.
- Always swap labels in a single `gh issue edit` call (`--remove-label status:X --add-label status:Y`). Never leave the issue without a `status:*` label, even briefly.

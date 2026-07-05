## Status Mapping

The default GitHub Issues flow assumes these six status labels exist in your repo:

```text
status:idea -> status:draft -> status:prd -> status:running -> status:hitl -> status:ready
```

If you prefer different label names (for example, `status:triage`, `status:backlog`, `status:in-progress`, `status:done`), map them here. The architect agent reads this file to translate between the canonical flow names and your repo's label names.

## Default mapping

When this file has no `## Workspace Overrides` section, all skills assume the canonical names verbatim. Label writes use the canonical names; label reads compare against the canonical names.

## Workspace Overrides

Add a `## Workspace Overrides` section below to override. Format:

```md
## Workspace Overrides

| Canonical          | Your repo label    |
| ------------------ | ------------------ |
| status:idea        | status:triage      |
| status:draft       | status:backlog     |
| status:prd         | status:ready       |
| status:running     | status:in-progress |
| status:hitl        | status:in-review   |
| status:ready       | status:done        |
```

The architect translates in both directions:

- When writing a label to the issue, it uses the repo label from the table.
- When reading a label from the issue, it maps the repo label back to the canonical name before routing.

If an issue carries a `status:*` label not in the mapping, the architect treats it as **unrecognized** and falls back to the routing rule defined in `agents/architect.md` (report the issue as-is, do not guess a route).

## Notes

- Do not add new canonical names. The flow has six states by design.
- If your repo has additional terminal labels (`status:cancelled`, `status:duplicate`, `status:wont-fix`), they are not in the flow. The architect treats them as terminal: report and stop, do not route.
- Per-repo mapping is supported but only one mapping per file. If different teams share this repo and need different label names, you have bigger problems - pick one set and stick to it.

## Seeding labels

To create the canonical labels in a fresh repo, run once:

```bash
for s in idea:d4c5f9 draft:fbca04 prd:0e8a16 running:1d76db hitl:5319e7 ready:0e8a16; do
  name="${s%%:*}"; color="${s##*:}"
  gh label create "status:$name" --color "$color" --force
done

for t in feature bug refactor chore docs infra perf test; do
  gh label create "type:$t" --color "cccccc" --force
done

gh label create "approved" --color "0e8a16" --force  # PR label: automated review says mergeable
gh label create "hitl"     --color "b60205" --force  # PR label: human review required
```

`approved` and `hitl` (no `status:` prefix) are PR labels applied by the reviewer inside `pipeline-execution`.
They are intentionally separate from issue `status:*` labels: a PR can carry `approved` while its parent issue carries `status:hitl` until the PR merges.

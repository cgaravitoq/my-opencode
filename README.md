# my-opencode

Public, versioned [OpenCode](https://opencode.ai) configuration for a **single review/fix/approve agent** plus a multi-model reviewer swarm.
Clone it on any machine, run the installer, and your OpenCode setup is ready.

This config covers exactly one role: closing the loop on code that was planned and implemented elsewhere - by you, another tool, or another agent; it does not matter which.
Open an OpenCode tab in a repo and you land directly in the `reviewer` agent, which investigates the current branch against its target base, tests the change end-to-end, fixes blockers itself, pushes, and leaves the branch's already-open PR labeled `approved` or `hitl` for a downstream merge agent.

## What's inside

```
.
├── opencode.json              # Main config: model, providers, MCP servers, permissions
├── AGENTS.md                  # Opinionated global rules loaded into every agent
├── package.json               # OpenCode plugin dependencies
├── agents/                    # Custom agents
│   ├── reviewer.md            # The agent (default): review + fix loop + push + label
│   ├── fixer.md               # Subagent: applies the blocker fixes the reviewer hands it
│   └── reviewer-*.md          # Four specialized swarm reviewers (subagents)
├── templates/
│   └── github-issues-skill/   # Per-repo GitHub Issues bundle template (legacy, see below)
├── scripts/
│   └── cli.ts                 # Bun CLI: `setup`, `cleanup`, `install-issues-bundle`
├── .opencode/
│   ├── plugins/               # Global OpenCode plugins symlinked into ~/.config/opencode/plugins/
│   │   └── review-guardrails.ts # Observability plugin: records reviewer swarm invocations
│   └── tools/                 # Global OpenCode tools symlinked into ~/.config/opencode/tools/
│       └── review-state.ts    # Custom tool owning review-fix loop state (consumed by `agents/reviewer.md`)
└── __tests__/                 # Tests for the tool and the plugin
```

## Setup on a new machine

### 1. Install OpenCode

```bash
curl -fsSL https://opencode.ai/install | bash
```

### 2. Clone this repo

```bash
git clone https://github.com/cgaravitoq/my-opencode.git ~/code/my-opencode
cd ~/code/my-opencode
```

### 3. Run the installer

```bash
bun run setup
```

This symlinks every file in this repo into `~/.config/opencode/`.
Existing files are backed up to `<name>.backup` before being replaced.
Re-run any time you add new agents to the repo (existing symlinks resolve through `git pull` automatically; only new files need re-linking).

### 4. Subscribe to OpenCode Go (optional, recommended)

The reviewer subagents use models from [OpenCode Go](https://opencode.ai/go) ($10/month).
Subscribe and connect:

```bash
opencode
# in the TUI:
/connect
# select OpenCode Go and paste the API key
```

### 5. Verify

```bash
opencode
# in the TUI:
/agents    # should list: reviewer, fixer, reviewer-arch, reviewer-reasoning, reviewer-e2e, reviewer-quick
/models    # should include anthropic/claude-sonnet-5, openai/gpt-5.5, opencode-go/deepseek-v4-flash,
           # opencode-go/deepseek-v4-pro, opencode-go/glm-5.2, opencode-go/minimax-m3
```

## How it works

### The `reviewer` agent (default)

Open a fresh OpenCode tab and you are already in `reviewer`.
It resolves everything itself: repo = current workdir, branch = current `HEAD`, base = the repo's default branch (`origin/main` typically), or whatever base you name.

Every invocation runs the full loop by default:

1. Investigate the diff (risk-selected swarm + its own reading).
2. Test the change end-to-end (exercise the affected flow, not just typecheck).
3. Hand every blocker to the `fixer` subagent, which commits surgical fixes.
4. Push the branch.
5. Label the already-open PR `approved` or `hitl`.

It never opens PRs (the PR is expected to already exist) and never merges - a downstream agent owns the merge.
Say "solo revisa" / "audit only" for a read-only run with findings and a would-be verdict.

The review-fix loop is capped at **3 passes** - at most 2 fix rounds, since recording pass 3 always returns `publish_blocked` - enforced by the `review-state` tool (see below).
The fixer is surgical: blockers only (`critical` + `important`), reproduce first, minimum delta, one conventional commit per logical group, per-fix verify with revert on failure.
Nits are never fixed - they go in the report for the human.

The final gate resolves commands in this order: an explicit command you give it → the repo's E2E / integration suite covering the change → the repo's own scripts (`typecheck`, `lint`, `test`, `build`).

### The subagents (swarm + fixer)

Pass 1 delegates to the smallest useful set of specialized reviewers, launched in parallel with background tasks.
Blocker fixes are delegated to the `fixer`:

| Agent | Model | Lab | Role |
|---|---|---|---|
| `reviewer-quick` | DeepSeek V4 Flash | DeepSeek | Fast first-pass: typos, copy-paste errors, dead code. |
| `reviewer-reasoning` | DeepSeek V4 Pro | DeepSeek | Logic correctness, edge cases, error paths. |
| `reviewer-arch` | GLM-5.2 | Zhipu | Architecture, design patterns, abstractions. |
| `reviewer-e2e` | MiniMax M3 | MiniMax | Bounded cross-file impact, integration, breaking changes. |
| `fixer` | GPT-5.5 | OpenAI | Applies the blocker fixes: minimum delta, verified, committed. |

Diversity by design: five labs in the loop - Anthropic orchestrates the review, DeepSeek / Zhipu / MiniMax audit from different angles, and OpenAI writes the fixes.
No lab reviews its own work, avoiding shared blind spots while keeping costs low.
Say "lanza el swarm completo" / "full swarm" to force all four reviewers regardless of change size.

Background subagents must be enabled for real wall-clock parallelism:

```bash
export OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true
export OPENCODE_REVIEW_SWARM_CAP=8
```

The swarm cap is advisory.
When the counter exceeds it, `review-state.record_swarm` returns `overBudget: true` instead of blocking the agent.

### Verdict contract

`approved` means the review loop found no remaining blockers, no unresolved disagreements, and the end-to-end gate passed - the downstream agent can merge once repository checks are green.
`hitl` means human review is required: unresolved or `unable` blockers, loop exhaustion, verify failure or unavailability, or reviewer disagreement.
The verdict lands as a label on the branch's existing PR (swapped atomically with its opposite); if no PR exists, the agent pushes anyway, reports it, and does not create one.

### Review state (`.opencode/plugins/` + `.opencode/tools/`)

The loop is enforced by two global files symlinked into `~/.config/opencode/` by the installer.
`.opencode/tools/review-state.ts` is the custom tool the `reviewer` agent uses to track the review-fix loop and record the publish verdict (see `agents/reviewer.md` "Loop State").
`.opencode/plugins/review-guardrails.ts` records `reviewer-*` swarm invocations in the same state file for observability, and hard-gates publishes: `git push`, `gh pr create`, and `gh pr edit` fail until `request_publish` has authorized the branch.
Set `OPENCODE_REVIEW_BYPASS=1` to skip the publish gate in an emergency.
The swarm counter itself never blocks - the cap stays advisory.
The loop budget (3 passes / 2 fix rounds + advisory swarm cap) is per review cycle; re-reviewing the same branch after a published cycle starts a fresh budget automatically and archives the prior cycle in `cycles[]`, so manually deleting state is rarely needed for a normal re-review.
Inspect state at `$XDG_STATE_HOME/opencode/review-state/<repo-hash>/<branch>.json` (defaults to `~/.local/state/opencode/review-state/...`) when debugging loop behavior.
Add your own plugins or tools by dropping `.ts`/`.js` files into these directories and re-running `bun run setup`.

### Context window tuning

OpenCode does not expose an agent-level knob that shrinks or expands a model's usable context window.
For built-in providers, OpenCode loads model limits from Models.dev automatically.
For custom providers or custom model entries, configure `provider.<id>.models.<model>.limit.context` and `limit.output` so OpenCode knows the model's real capacity.

Use `compaction` for session behavior around that capacity:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 10000
  }
}
```

`reserved` leaves a token buffer before compaction.
It does not increase the model's actual context window.

## GitHub Issues bundle (per repo, legacy)

`templates/github-issues-skill/` is a per-repo GitHub Issues workflow bundle (status-label flow `status:idea → ... → status:ready` plus shaping sub-skills), installable with:

```bash
bun run install-issues-bundle /path/to/your/repo [--force]
```

**Status**: this bundle predates the single-agent consolidation.
It was written to be driven by an OpenCode `architect` agent and its execution sub-skill delegates to a `pipeline-execution` skill; both were removed from this config.
Keep it as a reference or adapt its sub-skills to whatever drives your issue workflow before relying on it.

## MCPs

The canonical `opencode.json` ships with the MCP servers used here: `sequential-thinking` and `memory-cloud`.
GitHub integration goes through the `gh` CLI directly - no MCP required.

### Optional MCPs you can plug in

Drop any of these into `opencode.json` under `"mcp"` if you want them.
None are required.

- **cloudflare** - Cloudflare Workers / DNS / KV management. Remote server, no install: `{ "type": "remote", "url": "https://mcp.cloudflare.com/mcp" }`.
- **tavily** - web search and content extraction. Remote server, requires a Tavily API key in the auth flow: `{ "type": "remote", "url": "https://mcp.tavily.com/mcp/" }`.
- **vercel** - Vercel projects, deployments, env vars. Remote server, no install: `{ "type": "remote", "url": "https://mcp.vercel.com" }`.
- **btca** - local MCP for users who have the `btca` CLI installed: `{ "type": "local", "command": ["bun", "x", "btca", "mcp"] }`.

## Updating the config

Edit files **in this repo** (not in `~/.config/opencode/` - those are symlinks).
Commit and push.
On other machines, `git pull` and changes apply immediately (symlinks resolve to the repo).

If you ever pull a version of this repo that removed a globally-symlinked file, the old symlink becomes a dangling pointer.
Re-run `bun run cleanup && bun run setup` once to refresh.

## Uninstalling

```bash
bun run cleanup
```

Removes only the symlinks pointing into this repo; restores `.backup` files if they exist.

## Security

- **Never commit secrets.** `gh` CLI uses its own keyring-backed token (`gh auth login`) - no `.env` file is required for anything shipped here. Remote MCPs authenticate through OpenCode's `/connect` OAuth flow or `{env:VAR_NAME}` references.
- The `.gitignore` excludes `.env` and `*.backup` so env-var-backed integrations stay out of git.
- Rotate any token that ever ended up in a commit, even after deleting it - git history keeps everything.

# my-opencode

Public, versioned [OpenCode](https://opencode.ai) configuration for a **read-only review agent** plus a multi-model reviewer swarm.
Clone it on any machine, run the installer, and your OpenCode setup is ready.

This config covers exactly one role: auditing code that was planned and implemented elsewhere.
Open an OpenCode tab in a repo and you land directly in the `reviewer` agent, which investigates the current branch against its target base and returns an exact-head verdict to its caller.
It cannot edit files, execute write-capable shell commands, create commits, push branches, or change GitHub state.

## What's inside

```
.
├── opencode.json              # Main config: model, providers, MCP servers, permissions
├── AGENTS.example.md          # Example global rules - copy/adapt as your own ~/.config/opencode/AGENTS.md
├── package.json               # OpenCode plugin dependencies
├── agents/                    # Custom agents
│   ├── reviewer.md            # The default read-only review orchestrator
│   └── reviewer-*.md          # Four specialized read-only swarm reviewers
├── templates/
│   └── github-issues-skill/   # Per-repo GitHub Issues bundle template (legacy, see below)
├── scripts/
│   └── cli.ts                 # Bun CLI: `setup`, `cleanup`, `install-issues-bundle`
├── .opencode/
│   ├── plugins/               # Global OpenCode plugins symlinked into ~/.config/opencode/plugins/
│   │   └── review-guardrails.ts # Observability plugin: records reviewer swarm invocations
│   └── tools/                 # Global OpenCode tools symlinked into ~/.config/opencode/tools/
│       └── review-state.ts    # Legacy review-loop state tool, denied to reviewer agents
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

This symlinks the config files in this repo into `~/.config/opencode/`.
Existing files are backed up to `<name>.backup` before being replaced.
Re-run any time you add new agents to the repo (existing symlinks resolve through `git pull` automatically; only new files need re-linking).

Global agent rules (`~/.config/opencode/AGENTS.md`) are deliberately **not** installed - they are personal, not part of the product config.
Use `AGENTS.example.md` as a starting point: copy it to `~/.config/opencode/AGENTS.md`, or symlink it from your own dotfiles repo.

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
/agents    # should list: reviewer, reviewer-arch, reviewer-reasoning, reviewer-e2e, reviewer-quick
/models    # should include anthropic/claude-sonnet-5, openai/gpt-5.5, opencode-go/deepseek-v4-flash,
           # opencode-go/deepseek-v4-pro, opencode-go/glm-5.2, opencode-go/minimax-m3
```

## How it works

### The `reviewer` agent (default)

Open a fresh OpenCode tab and you are already in `reviewer`.
It resolves the review scope itself: repo = current workdir, branch = current `HEAD`, base = the local default branch (`origin/main` typically), or whatever base you name.

Every invocation runs a read-only review:

1. Inspect the exact local head and diff.
2. Delegate risk-specific analysis to read-only reviewer subagents.
3. Consolidate findings and return `VERDICT: APPROVE|REJECT` with the reviewed commit SHA.

The reviewer does not contact GitHub or execute test commands because either can mutate local or remote state.
The writer or integration owner owns fixes, verification, publishing, and merge decisions.

### The subagents

Pass 1 delegates to the smallest useful set of specialized reviewers, launched in parallel with background tasks.

| Agent | Model | Lab | Role |
|---|---|---|---|
| `reviewer-quick` | DeepSeek V4 Flash | DeepSeek | Fast first-pass: typos, copy-paste errors, dead code. |
| `reviewer-reasoning` | DeepSeek V4 Pro | DeepSeek | Logic correctness, edge cases, error paths. |
| `reviewer-arch` | GLM-5.2 | Zhipu | Architecture, design patterns, abstractions. |
| `reviewer-e2e` | MiniMax M3 | MiniMax | Bounded cross-file impact, integration, breaking changes. |

Diversity by design: Anthropic orchestrates the review while DeepSeek, Zhipu, and MiniMax audit from different angles.
Say "lanza el swarm completo" / "full swarm" to force all four reviewers regardless of change size.

Background subagents must be enabled for real wall-clock parallelism:

```bash
export OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true
export OPENCODE_REVIEW_SWARM_CAP=8
```

The swarm cap is advisory.
When the counter exceeds it, `review-state.record_swarm` returns `overBudget: true` instead of blocking the agent.

### Verdict contract

`APPROVE` means the read-only audit found no blockers and the observed head matches the requested head.
`REJECT` means a blocker, unresolved disagreement, head mismatch, or material verification limitation remains.
The verdict is returned to the caller only.

### Legacy review state (`.opencode/plugins/` + `.opencode/tools/`)

These files remain installed for backward compatibility and observability.
The read-only reviewer cannot invoke the state tool or any publish command.
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

The canonical `opencode.json` ships with the MCP servers used here: `sequential-thinking`, `memory-cloud`, and `figma-bridge`.
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

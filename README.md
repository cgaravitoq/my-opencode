# my-opencode

Public, versioned [OpenCode](https://opencode.ai) configuration for a multi-agent coding workflow: global agents, reusable skills, review guardrails, and a per-repo GitHub Issues bundle template. Clone it on any machine, run the installer, and your OpenCode setup is ready.

## What's inside

```
.
├── opencode.json              # Main config: model, providers, MCP servers, permissions
├── AGENTS.md                  # Opinionated global rules loaded into every agent
├── package.json               # OpenCode plugin dependencies
├── agents/                    # Custom agents
│   ├── architect.md           # Primary orchestrator (GitHub-Issues-aware + ad-hoc) - Opus 4.8 high
│   ├── coder.md               # Primary fast-path agent for trivial changes - Sonnet 5 medium
│   ├── exec.md                # Subagent: implementer driven by pipeline-execution - GPT-5.5
│   ├── reviewer.md            # Default agent (mode: all): review-fix loop owner + PR opener - Sonnet 5 medium
│   ├── fixer.md               # Subagent: applies blocker deltas from reviewer - GPT-5.5
│   └── reviewer-*.md          # Four read-only swarm reviewers
├── skills/                    # Global skills; also installable per repo with `bunx skills add ... --all`
│   ├── pipeline-execution/    # Generic exec → reviewer → fixer → PR pipeline (tracker-agnostic)
│   └── swarm-review/          # Multi-model parallel code review (used by `coder` fast path)
├── templates/
│   └── github-issues-skill/   # GitHub Issues bundle template - installed PER REPO via `bun run install-issues-bundle`
├── scripts/
│   └── cli.ts                 # Bun CLI: `setup`, `cleanup`, `install-skills`, `install-issues-bundle`
├── .opencode/
│   ├── plugins/               # Global OpenCode plugins symlinked into ~/.config/opencode/plugins/
│   │   └── review-guardrails.ts # Publish gate: blocks `git push` / `gh pr create` until review-state authorizes
│   └── tools/                 # Global OpenCode tools symlinked into ~/.config/opencode/tools/
│       └── review-state.ts    # Custom tool owning review-fix loop state (consumed by `agents/reviewer.md`)
└── .gitignore
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

This symlinks every file in this repo into `~/.config/opencode/`. Existing files are backed up to `<name>.backup` before being replaced. Re-run any time you add new agents or skills to the repo (existing symlinks resolve through `git pull` automatically; only new files need re-linking).

### 4. Subscribe to OpenCode Go (optional, recommended)

The reviewer subagents use models from [OpenCode Go](https://opencode.ai/go) ($10/month). Subscribe and connect:

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
/agents    # should list: architect, coder, exec, reviewer, fixer, reviewer-arch, reviewer-reasoning, reviewer-e2e, reviewer-quick
/models    # should include anthropic/claude-opus-4-8, anthropic/claude-sonnet-5, openai/gpt-5.5, opencode-go/deepseek-v4-flash, opencode-go/minimax-m3
```

## Install skills into the current repo

Use this when OpenCode is already configured globally and you only want this repo's reusable skills in the project you're currently in:

```bash
cd /path/to/target-repo
bunx skills add cgaravitoq/my-opencode --all
```

That installs `pipeline-execution` and `swarm-review` into `.agents/skills/` and writes `skills-lock.json`. It does not install global agents, plugins, or tools; run `bun run setup` from this repo once for those.

From a local checkout of this repo, the equivalent target-repo installer is:

```bash
bun run install-skills /path/to/target-repo
```

## How it works

### Layers

**Global layer** (lives in `~/.config/opencode/`, symlinked from this repo):

- 5 + 4 agents (primaries + swarm).
- 2 skills: `pipeline-execution` (the code-shipping pipeline) and `swarm-review` (used by the `coder` fast path).

**Per-repo skills layer** (lives in each repo's `.agents/skills/`):

- Installed from the public repo with `bunx skills add cgaravitoq/my-opencode --all`.
- Adds the reusable skills to that repo without touching global OpenCode config.

**Per-repo GitHub Issues layer** (lives in each repo's `.agents/skills/github-issues/`):

- One GitHub Issues bundle per repo. Defines that repo's status-label flow, sub-skills, and shaping rules.
- Installed once per repo via `bun run install-issues-bundle /path/to/repo`. After install, you customize it for your label conventions.
- The architect auto-detects the bundle and uses it for issue-mode requests in that repo. No bundle = ad-hoc only.

### Agents

The **default agent is `reviewer`** (`mode: all`): open a fresh tab and you land directly in the swarm-review/fix/loop.
Switch agents with **Tab** in the TUI:

- `reviewer` - **default**, and also the pipeline's review-fix loop owner.
  Invoked directly in a tab it runs *interactive mode* (resolves repo/branch/base itself, defaults to `audit-only`, opens a PR only when you ask).
  Invoked by `pipeline-execution` it runs *caller mode* (risk-selected reviewers + fixer loop, final verify gate, PR label decision).
- `architect` - orchestrator.
  Auto-detects the per-repo GitHub Issues bundle if present, falls back to ad-hoc otherwise.
  All code work goes through the global `pipeline-execution` skill.
- `coder` - fast path for trivial changes (one-line fixes, renames, doc tweaks).
  Optionally delegates to the `reviewer-*` swarm via the `swarm-review` skill.

The other pipeline subagents are invoked by `pipeline-execution` (not the architect directly):

- `exec` - implementer.
  Commits one task per call to the parent branch.
- `fixer` - applies blocker deltas.
  Surgical only.

| Agent | Mode | Model | Lab | Specialty |
|---|---|---|---|---|
| `architect` | primary | Claude Opus 4.8 (high) | Anthropic | Orchestrator. Per-repo GitHub Issues bundle aware. |
| `coder` | primary | Claude Sonnet 5 (medium) | Anthropic | Fast-path coder for trivial changes. |
| `exec` | subagent | GPT-5.5 (low) | OpenAI | Implementer (invoked via `pipeline-execution`). |
| `reviewer` | **all (default)** | Claude Sonnet 5 (medium) | Anthropic | Default agent; review-fix loop owner + PR opener. |
| `fixer` | subagent | GPT-5.5 (medium) | OpenAI | Applies blocker deltas from reviewer. |
| `reviewer-quick` | subagent | DeepSeek V4 Flash | DeepSeek | Fast first-pass: typos, copy-paste errors. |
| `reviewer-arch` | subagent | MiniMax M3 | MiniMax | Architecture, design patterns, abstractions. |
| `reviewer-reasoning` | subagent | MiniMax M3 | MiniMax | Logic correctness, edge cases, error paths. |
| `reviewer-e2e` | subagent | MiniMax M3 | MiniMax | Bounded cross-file impact, integration, breaking changes. |

### Pipeline (`skills/pipeline-execution/`)

The single shared implementation pipeline. Tracker-agnostic. Used by the architect (ad-hoc) and by per-repo GitHub Issues bundles (when their `*-to-execution` step needs to ship code).

```text
pipeline-execution (skill)
  ├─ task → exec (GPT-5.5)               implement task on parent branch
  └─ task → reviewer (Sonnet 5 medium)
            ├─ task → reviewer-* (risk-selected, parallel)   audit
            ├─ task → fixer (GPT-5.5) ← loop ≤3
            └─ push parent branch
            └─ open PR with `approved` | `hitl` label
```

Diversity by design: planner (Anthropic Opus 4.8), executor (OpenAI GPT-5.5), reviewer orchestrator (Anthropic Sonnet 5) + selected OpenCode Go reviewers (DeepSeek V4 Flash for fast smoke checks, MiniMax M3 for architecture, deep reasoning, and bounded cross-file review).
Four labs (Anthropic, OpenAI, DeepSeek, MiniMax) avoid shared blind spots while keeping costs low.

PR labels are the merge contract:

- `approved` means the automated review loop found no remaining blockers, the final verify gate passed, and the PR is ready to merge once repository checks are green.
- `hitl` means human review is required because blockers, uncertainty, disagreement, or missing verification remain.

### Publish gate (`.opencode/plugins/` + `.opencode/tools/`)

The loop above is enforced by two global files symlinked into `~/.config/opencode/` by the installer.
`.opencode/plugins/review-guardrails.ts` intercepts `git push` and `gh pr create` and blocks them until the branch has been authorized - that's why pushes can error with `publish gated by review-state for branch <name>`.
Authorization lives in `.opencode/tools/review-state.ts`, the custom tool the `reviewer` agent uses to track the review-fix loop and mark a branch ready to publish (see `agents/reviewer.md` "Loop State (hard gate)").
The loop budget (3 fixer passes + swarm cap) is per review cycle; re-reviewing the same branch after a published cycle starts a fresh budget automatically and archives the prior cycle in `cycles[]`, so manually deleting state is rarely needed for a normal re-review.
Add your own plugins or tools by dropping `.ts`/`.js` files into these directories and re-running `bun run setup`.

### Context window tuning

OpenCode does not expose an agent-level knob that shrinks or expands a model's usable context window. For built-in providers, OpenCode loads model limits from Models.dev automatically. For custom providers or custom model entries, configure `provider.<id>.models.<model>.limit.context` and `limit.output` so OpenCode knows the model's real capacity.

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

`reserved` leaves a token buffer before compaction. It does not increase the model's actual context window.

### GitHub Issues bundle (per repo)

Each repo that wants GitHub Issues integration installs its own bundle in `.agents/skills/github-issues/`:

```bash
# from this template repo
bun run install-issues-bundle /path/to/your/repo

# or from anywhere, pointing at the target
bun --cwd /path/to/template run install-issues-bundle /path/to/your/repo
```

Default template (under `templates/github-issues-skill/`) ships with an opinionated flow, encoded as `status:*` labels:

```
status:idea → status:draft → status:prd → status:running → status:hitl → status:ready
```

Exactly one `status:*` label is active per issue at any time. Transitions are always atomic: `gh issue edit <N> --remove-label status:A --add-label status:B`.

Sub-skills:

- `idea-to-issue/` - capture a raw idea (single issue or parent issue + initial drafts via tasklist).
- `project-to-draft/` - split an existing parent issue into `status:draft` child slices.
- `draft-to-prd/` - three-phase guided interview to promote a draft to PRD.
- `prd-to-execution/` - GitHub Issues bookkeeping for executing a PRD. Code work is delegated to `pipeline-execution`.

After install, edit:

1. `<repo>/.agents/skills/github-issues/SKILL.md` - change `status:*` label names if you prefer different conventions (e.g. `status:prd` → `status:spec-ready`, `status:hitl` → `status:in-review`).
2. Sub-skill bodies - adjust shaping rules (e.g. always-parent-issue vs single-issue intake, more or fewer interview phases, etc.).
3. Seed the labels in the repo (see `references/status-mapping.md` "Seeding labels" - short bash loop using `gh label create`).

Different repos can have completely different label flows. The architect doesn't care - it reads each repo's bundle and adapts.

Trigger phrases for issue mode (Spanish or English):

- "tengo una idea" / "I have an idea"
- "captura esto" / "capture this"
- "trabajemos en #42" / "let's work on #42"
- "abordemos esta issue" / "execute owner/repo#42"
- "promote to PRD"

The architect routes by **current `status:*` label** as defined in the active repo's bundle, not by the verb you used.

### Swarm review skill (`skills/swarm-review/`)

Fallback path for the `coder` fast path. The full pipeline does not use this skill - `pipeline-execution`'s `reviewer` agent owns swarm orchestration directly.

Trigger phrases when invoked from `coder`:

- "audita el código" / "audit my code"
- "revisa mi implementación" / "review this"
- "second opinion"
- "qué se me escapó"
- "lanza el swarm"

Picks a subset of reviewers based on change size, runs them in parallel, consolidates findings into a prioritized summary.

Background subagents must be enabled for real wall-clock parallelism:

```bash
export OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true
export OPENCODE_REVIEW_SWARM_CAP=8
```

The swarm cap is a guardrail against runaway reviewer loops.
`8` supports one explicit full swarm plus follow-up quick checks, while failing fast when the reviewer starts looping.

### Emergency bypass

If the `review-guardrails` plugin blocks a `git push` / `gh pr create` due to corrupted or stale loop state (e.g. an interrupted process that left `review-state` mid-write), set `OPENCODE_REVIEW_BYPASS=1` for the current process to skip the publish gate entirely:

```bash
OPENCODE_REVIEW_BYPASS=1 git push
```

Use it only as an escape hatch - bypassing the gate also disables the swarm-budget cap, so a runaway reviewer loop can keep spawning subagents past `OPENCODE_REVIEW_SWARM_CAP`.
Prefer inspecting or deleting the offending state file first: `$XDG_STATE_HOME/opencode/review-state/<repo-hash>/<branch>.json` (defaults to `~/.local/state/opencode/review-state/...`); manual reset is now mostly for corrupted or stale state because normal new cycles reset themselves on `start` after publish.

## MCPs

The canonical `opencode.json` ships with only the MCP server used by the agents and skills in this template: `sequential-thinking`.
GitHub Issues integration goes through the `gh` CLI directly - no MCP required.

### Optional MCPs you can plug in

Drop any of these into `opencode.json` under `"mcp"` if you want them. None are required by the template.

- **cloudflare** - Cloudflare Workers / DNS / KV management. Remote server, no install: `{ "type": "remote", "url": "https://mcp.cloudflare.com/mcp" }`.
- **tavily** - web search and content extraction. Remote server, requires a Tavily API key in the auth flow: `{ "type": "remote", "url": "https://mcp.tavily.com/mcp/" }`.
- **vercel** - Vercel projects, deployments, env vars. Remote server, no install: `{ "type": "remote", "url": "https://mcp.vercel.com" }`.
- **btca** - local MCP for users who have the `btca` CLI installed: `{ "type": "local", "command": ["bun", "x", "btca", "mcp"] }`.

## Working across repos

The architect adapts to whatever repo you're in:

- **Repo with `.agents/skills/github-issues/`** - architect loads that bundle and routes issue-mode requests through it. Each repo can have its own label names and flow (e.g. `status:prd` vs `status:spec-ready`, 6-state vs 11-state flow).
- **Repo without a bundle** - only ad-hoc mode is available. Architect asks if you want to install one (`bun run install-issues-bundle <repo>`) or proceed without issue tracking.
- **Trivial change** - invoke `coder` directly. Skips the pipeline.

Code work always goes through the global `pipeline-execution` skill - same `exec → reviewer → fixer → PR` everywhere. The per-repo bundle only handles GitHub Issues bookkeeping.

To install the GitHub Issues bundle in a new repo:

```bash
# from the template repo, pointing at the target
bun --cwd ~/code/my-opencode run install-issues-bundle /path/to/repo

# from inside the template repo, defaults to $(pwd)
bun run install-issues-bundle /path/to/repo

# overwrite an existing bundle (auto-backed-up)
bun run install-issues-bundle /path/to/repo --force
```

After install, edit `<repo>/.agents/skills/github-issues/SKILL.md` and the sub-skills to match your label conventions. Seed the labels with `gh label create` (see `references/status-mapping.md` in the bundle). Commit the bundle to the repo so the rest of the team (and your other machines) get the same setup.

## Updating the config

Edit files **in this repo** (not in `~/.config/opencode/` - those are symlinks). Commit and push. On other machines, `git pull` and changes apply immediately (symlinks resolve to the repo).

If you ever pull a version of this repo that removed a globally-symlinked file, the old symlink becomes a dangling pointer. Re-run `bun run cleanup && bun run setup` once to refresh.

## Uninstalling

```bash
bun run cleanup
```

Removes only the symlinks pointing into this repo; restores `.backup` files if they exist.

## Security

- **Never commit secrets.** `gh` CLI uses its own keyring-backed token (`gh auth login`) - no `.env` file or `{env:VAR_NAME}` references are required for anything shipped here. Remote MCPs added later (e.g. `vercel`, `cloudflare`) authenticate through OpenCode's `/connect` OAuth flow.
- The `.gitignore` excludes `.env` and `*.backup` so future env-var-backed integrations stay out of git.
- Rotate any token that ever ended up in a commit, even after deleting it - git history keeps everything.

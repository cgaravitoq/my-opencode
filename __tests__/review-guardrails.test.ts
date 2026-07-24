import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { ReviewGuardrails } from "../.opencode/plugins/review-guardrails.ts"

function fakeShell(branch: string) {
  return () => ({
    cwd: () => ({
      text: async () => `${branch}\n`,
    }),
  })
}

describe("review-guardrails plugin", () => {
  let tmpRoot: string
  let worktree: string
  let originalXdg: string | undefined

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), "review-guardrails-test-"))
    worktree = path.join(tmpRoot, "worktree")
    originalXdg = process.env.XDG_STATE_HOME
    process.env.XDG_STATE_HOME = tmpRoot
  })

  afterEach(async () => {
    if (originalXdg === undefined) {
      delete process.env.XDG_STATE_HOME
    } else {
      process.env.XDG_STATE_HOME = originalXdg
    }

    await rm(tmpRoot, { recursive: true, force: true })
  })

  const readSwarmInvocations = async () => {
    const repoDirs = await readdir(path.join(tmpRoot, "opencode", "review-state"))
    expect(repoDirs).toHaveLength(1)

    const statePath = path.join(tmpRoot, "opencode", "review-state", repoDirs[0]!, "feature__review.json")
    const state = JSON.parse(await readFile(statePath, "utf8")) as { swarmInvocations?: number }
    return state.swarmInvocations
  }

  test("creates state directory before recording reviewer task budget", async () => {
    const plugin = await ReviewGuardrails({ $: fakeShell("feature/review") as never, worktree } as never)

    await plugin["tool.execute.before"]?.(
      { tool: "task" } as never,
      { args: { subagent_type: "reviewer-quick" } } as never,
    )

    expect(await readSwarmInvocations()).toBe(1)
  })

  test("counts every reviewer subagent, including the costly security lenses", async () => {
    const plugin = await ReviewGuardrails({ $: fakeShell("feature/review") as never, worktree } as never)
    const subagents = ["reviewer-triage", "reviewer-quick", "reviewer-reasoning", "reviewer-arch", "reviewer-e2e", "reviewer-security", "reviewer-security-deep"]

    for (const subagent of subagents) {
      await plugin["tool.execute.before"]?.({ tool: "task" } as never, { args: { subagent_type: subagent } } as never)
    }

    expect(await readSwarmInvocations()).toBe(subagents.length)
  })

  test("ignores subagents outside the reviewer swarm", async () => {
    const plugin = await ReviewGuardrails({ $: fakeShell("feature/review") as never, worktree } as never)

    await plugin["tool.execute.before"]?.({ tool: "task" } as never, { args: { subagent_type: "general" } } as never)

    await expect(readdir(path.join(tmpRoot, "opencode", "review-state"))).rejects.toThrow()
  })

  const stateFileFor = (branch: string) => {
    const repoHash = createHash("sha256").update(path.resolve(worktree)).digest("hex").slice(0, 16)
    return path.join(tmpRoot, "opencode", "review-state", repoHash, `${branch.replaceAll("/", "__")}.json`)
  }

  const writeState = async (branch: string, publishAuthorized: boolean) => {
    const stateFile = stateFileFor(branch)
    await mkdir(path.dirname(stateFile), { recursive: true })
    await writeFile(stateFile, `${JSON.stringify({ branch, passes: [], publishAuthorized })}\n`, "utf8")
  }

  test("blocks git push when publish is not authorized", async () => {
    const plugin = await ReviewGuardrails({ $: fakeShell("feature/review") as never, worktree } as never)

    await expect(
      plugin["tool.execute.before"]?.(
        { tool: "bash" } as never,
        { args: { command: "git push -u origin feature/review" } } as never,
      ),
    ).rejects.toThrow(/publish gated by review-state/)
  })

  test("blocks gh pr edit via current-branch fallback when publish is not authorized", async () => {
    await writeState("feature/review", false)
    const plugin = await ReviewGuardrails({ $: fakeShell("feature/review") as never, worktree } as never)

    await expect(
      plugin["tool.execute.before"]?.(
        { tool: "bash" } as never,
        { args: { command: "gh pr edit 5 --add-label approved --remove-label hitl" } } as never,
      ),
    ).rejects.toThrow(/publish gated by review-state/)
  })

  test("allows publish commands once request_publish authorized the branch", async () => {
    await writeState("feature/review", true)
    const plugin = await ReviewGuardrails({ $: fakeShell("feature/review") as never, worktree } as never)

    await expect(
      plugin["tool.execute.before"]?.(
        { tool: "bash" } as never,
        { args: { command: "git push -u origin feature/review" } } as never,
      ),
    ).resolves.toBeUndefined()
  })

  test("ignores non-publish bash commands", async () => {
    const plugin = await ReviewGuardrails({ $: fakeShell("feature/review") as never, worktree } as never)

    await expect(
      plugin["tool.execute.before"]?.(
        { tool: "bash" } as never,
        { args: { command: "git status && git log --oneline" } } as never,
      ),
    ).resolves.toBeUndefined()
  })

  test("OPENCODE_REVIEW_BYPASS=1 skips the publish gate", async () => {
    const originalBypass = process.env.OPENCODE_REVIEW_BYPASS
    process.env.OPENCODE_REVIEW_BYPASS = "1"

    try {
      const plugin = await ReviewGuardrails({ $: fakeShell("feature/review") as never, worktree } as never)

      await expect(
        plugin["tool.execute.before"]?.(
          { tool: "bash" } as never,
          { args: { command: "git push -u origin feature/review" } } as never,
        ),
      ).resolves.toBeUndefined()
    } finally {
      if (originalBypass === undefined) {
        delete process.env.OPENCODE_REVIEW_BYPASS
      } else {
        process.env.OPENCODE_REVIEW_BYPASS = originalBypass
      }
    }
  })
})

describe("reviewer configuration", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..")

  test("keeps authentication plugins and MCP configuration while denying mutations", async () => {
    const config = JSON.parse(await readFile(path.join(repoRoot, "opencode.json"), "utf8")) as {
      plugin?: string[]
      mcp?: Record<string, unknown>
      permission?: Record<string, unknown>
    }

    expect(config.plugin).toContain("opencode-claude-auth@latest")
    expect(Object.keys(config.mcp ?? {})).toEqual(
      expect.arrayContaining(["sequential-thinking", "figma-bridge", "memory-cloud"]),
    )
    expect(config.permission?.["*"]).toBe("deny")
    expect(config.permission?.edit).toBe("deny")
    expect(config.permission?.bash).toMatchObject({ "*": "deny" })
  })

  test("makes every installed agent structurally read-only", async () => {
    const agentsDir = path.join(repoRoot, "agents")
    const agentFiles = (await readdir(agentsDir)).filter((entry) => entry.endsWith(".md"))

    expect(agentFiles).not.toContain("fixer.md")

    for (const agentFile of agentFiles) {
      const source = await readFile(path.join(agentsDir, agentFile), "utf8")
      const frontmatter = source.split("---", 3)[1] ?? ""

      expect(frontmatter).toContain("edit: deny")
      expect(frontmatter).not.toMatch(/\b(?:write|edit|patch): true\b/)
      expect(frontmatter).not.toContain('"*": allow')
      expect(source).not.toContain("git push")
      expect(source).not.toContain("gh pr")
      expect(source).not.toContain("request_publish")
      expect(source).not.toContain("review-state")
    }
  })
})

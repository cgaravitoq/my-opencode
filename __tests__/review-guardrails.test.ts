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

  test("creates state directory before recording reviewer task budget", async () => {
    const plugin = await ReviewGuardrails({ $: fakeShell("feature/review") as never, worktree } as never)

    await plugin["tool.execute.before"]?.(
      { tool: "task" } as never,
      { args: { subagent_type: "reviewer-quick" } } as never,
    )

    const repoDirs = await readdir(path.join(tmpRoot, "opencode", "review-state"))
    expect(repoDirs).toHaveLength(1)

    const statePath = path.join(tmpRoot, "opencode", "review-state", repoDirs[0]!, "feature__review.json")
    const state = JSON.parse(await readFile(statePath, "utf8")) as { swarmInvocations?: number }
    expect(state.swarmInvocations).toBe(1)
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

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
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
})

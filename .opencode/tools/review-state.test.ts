import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { ToolContext } from "@opencode-ai/plugin"
import reviewState from "./review-state.ts"

type ExecuteResult = { ok: true; nextAction?: string; state?: unknown; authorized?: boolean; verdict?: string }

function parse(result: Awaited<ReturnType<typeof reviewState.execute>>): ExecuteResult {
  const raw = typeof result === "string" ? result : result.output
  return JSON.parse(raw) as ExecuteResult
}

function makeContext(worktree: string): ToolContext {
  return {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    directory: worktree,
    worktree,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: (() => {}) as unknown as ToolContext["ask"],
  }
}

describe("review-state tool", () => {
  let tmpRoot: string
  let worktree: string
  let context: ToolContext
  let originalXdg: string | undefined

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), "review-state-test-"))
    worktree = path.join(tmpRoot, "worktree")
    originalXdg = process.env.XDG_STATE_HOME
    process.env.XDG_STATE_HOME = tmpRoot
    context = makeContext(worktree)
  })

  afterEach(async () => {
    if (originalXdg === undefined) {
      delete process.env.XDG_STATE_HOME
    } else {
      process.env.XDG_STATE_HOME = originalXdg
    }
    await rm(tmpRoot, { recursive: true, force: true })
  })

  test("happy path: start → pass 1 → pass 2 → pass 3 returns publish_blocked", async () => {
    parse(await reviewState.execute({ branch: "feature/a", action: "start" }, context))

    const p1 = parse(
      await reviewState.execute(
        { branch: "feature/a", action: "record_pass", pass: 1, blockersHash: "hashA" },
        context,
      ),
    )
    expect(p1.nextAction).toBe("fix")

    const p2 = parse(
      await reviewState.execute(
        { branch: "feature/a", action: "record_pass", pass: 2, blockersHash: "hashB" },
        context,
      ),
    )
    expect(p2.nextAction).toBe("fix")

    const p3 = parse(
      await reviewState.execute(
        { branch: "feature/a", action: "record_pass", pass: 3, blockersHash: "hashC" },
        context,
      ),
    )
    expect(p3.nextAction).toBe("publish_blocked")
  })

  test("abort_duplicate: same blockersHash across passes triggers abort", async () => {
    await reviewState.execute({ branch: "feature/b", action: "start" }, context)
    await reviewState.execute(
      { branch: "feature/b", action: "record_pass", pass: 1, blockersHash: "hashA" },
      context,
    )

    const p2 = parse(
      await reviewState.execute(
        { branch: "feature/b", action: "record_pass", pass: 2, blockersHash: "hashA" },
        context,
      ),
    )
    expect(p2.nextAction).toBe("abort_duplicate")
  })

  test("request_publish rejects clean verdict when no fix pass recorded", async () => {
    await reviewState.execute({ branch: "feature/c", action: "start" }, context)

    expect(
      reviewState.execute({ branch: "feature/c", action: "request_publish", verdict: "clean" }, context),
    ).rejects.toThrow(/at least one resolved pass/)
  })

  test("branch sanitization rejects '..'", async () => {
    expect(reviewState.execute({ branch: "../escape", action: "start" }, context)).rejects.toThrow(/\.\./)
  })

  test("branch sanitization rejects null bytes", async () => {
    expect(reviewState.execute({ branch: "evil\0name", action: "start" }, context)).rejects.toThrow(
      /null bytes/,
    )
  })

  test("record_swarm increments invocation counter", async () => {
    await reviewState.execute({ branch: "feature/d", action: "start" }, context)
    const r1 = parse(await reviewState.execute({ branch: "feature/d", action: "record_swarm" }, context))
    expect(r1).toMatchObject({ ok: true })
    const r2 = parse(await reviewState.execute({ branch: "feature/d", action: "record_swarm" }, context))
    expect((r2 as { swarmInvocations?: number }).swarmInvocations).toBe(2)
  })
})

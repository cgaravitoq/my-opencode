import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { ToolContext } from "@opencode-ai/plugin"
import reviewState from "../.opencode/tools/review-state.ts"

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
  let originalSwarmCap: string | undefined

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), "review-state-test-"))
    worktree = path.join(tmpRoot, "worktree")
    originalXdg = process.env.XDG_STATE_HOME
    originalSwarmCap = process.env.OPENCODE_REVIEW_SWARM_CAP
    process.env.XDG_STATE_HOME = tmpRoot
    delete process.env.OPENCODE_REVIEW_SWARM_CAP
    context = makeContext(worktree)
  })

  afterEach(async () => {
    if (originalXdg === undefined) {
      delete process.env.XDG_STATE_HOME
    } else {
      process.env.XDG_STATE_HOME = originalXdg
    }
    if (originalSwarmCap === undefined) {
      delete process.env.OPENCODE_REVIEW_SWARM_CAP
    } else {
      process.env.OPENCODE_REVIEW_SWARM_CAP = originalSwarmCap
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

  test("record_swarm enforces configured cap", async () => {
    process.env.OPENCODE_REVIEW_SWARM_CAP = "2"
    await reviewState.execute({ branch: "feature/swarm-cap", action: "start" }, context)
    await reviewState.execute({ branch: "feature/swarm-cap", action: "record_swarm" }, context)
    await reviewState.execute({ branch: "feature/swarm-cap", action: "record_swarm" }, context)

    await expect(reviewState.execute({ branch: "feature/swarm-cap", action: "record_swarm" }, context)).rejects.toThrow(
      /swarm budget exhausted/,
    )
  })

  test("new cycle after publish resets budget and archives prior passes", async () => {
    await reviewState.execute({ branch: "feature/cycle", action: "start" }, context)
    await reviewState.execute({ branch: "feature/cycle", action: "record_swarm" }, context)

    const p1 = parse(
      await reviewState.execute(
        { branch: "feature/cycle", action: "record_pass", pass: 1, blockersHash: "hashA" },
        context,
      ),
    )
    expect(p1.nextAction).toBe("fix")

    const publish = parse(
      await reviewState.execute({ branch: "feature/cycle", action: "request_publish", verdict: "clean" }, context),
    )
    expect(publish.authorized).toBe(true)

    const restarted = parse(await reviewState.execute({ branch: "feature/cycle", action: "start" }, context))
    const state = restarted.state as {
      passes?: { blockersHash?: string }[]
      publishAuthorized?: boolean
      swarmInvocations?: number
      publishVerdict?: string
      cycles?: { passes?: { blockersHash?: string }[]; publishVerdict?: string }[]
    }
    expect(state.passes).toHaveLength(0)
    expect(state.publishAuthorized).toBe(false)
    expect(state.swarmInvocations).toBe(0)
    expect(state.publishVerdict).toBeUndefined()
    expect(state.cycles).toHaveLength(1)
    expect(state.cycles?.[0]?.passes).toHaveLength(1)
    expect(state.cycles?.[0]?.passes?.[0]?.blockersHash).toBe("hashA")
    expect(state.cycles?.[0]?.publishVerdict).toBe("clean")

    const nextP1 = parse(
      await reviewState.execute(
        { branch: "feature/cycle", action: "record_pass", pass: 1, blockersHash: "hashA" },
        context,
      ),
    )
    expect(nextP1.nextAction).toBe("fix")
  })

  test("start resumes an un-published interrupted loop without resetting", async () => {
    await reviewState.execute({ branch: "feature/resume", action: "start" }, context)

    const p1 = parse(
      await reviewState.execute(
        { branch: "feature/resume", action: "record_pass", pass: 1, blockersHash: "hashA" },
        context,
      ),
    )
    expect(p1.nextAction).toBe("fix")

    const restarted = parse(await reviewState.execute({ branch: "feature/resume", action: "start" }, context))
    const state = restarted.state as {
      passes?: { blockersHash?: string }[]
      publishAuthorized?: boolean
      cycles?: unknown[]
    }
    expect(state.passes).toHaveLength(1)
    expect(state.publishAuthorized).toBe(false)
    expect(state.cycles === undefined || state.cycles.length === 0).toBe(true)
  })

  test("cycles accumulate across multiple publish→restart rounds", async () => {
    await reviewState.execute({ branch: "feature/multicycle", action: "start" }, context)
    await reviewState.execute({ branch: "feature/multicycle", action: "record_swarm" }, context)
    await reviewState.execute({ branch: "feature/multicycle", action: "record_swarm" }, context)

    const p1 = parse(
      await reviewState.execute(
        { branch: "feature/multicycle", action: "record_pass", pass: 1, blockersHash: "hashA1" },
        context,
      ),
    )
    expect(p1.nextAction).toBe("fix")

    const publish = parse(
      await reviewState.execute(
        { branch: "feature/multicycle", action: "request_publish", verdict: "clean" },
        context,
      ),
    )
    expect(publish.authorized).toBe(true)

    const restarted = parse(await reviewState.execute({ branch: "feature/multicycle", action: "start" }, context))
    const state = restarted.state as {
      passes?: { blockersHash?: string }[]
      swarmInvocations?: number
      cycles?: { passes?: { blockersHash?: string }[]; swarmInvocations?: number; publishVerdict?: string }[]
    }
    expect(state.cycles).toHaveLength(1)
    expect(state.cycles?.[0]?.passes).toHaveLength(1)
    expect(state.cycles?.[0]?.passes?.[0]?.blockersHash).toBe("hashA1")
    expect(state.cycles?.[0]?.swarmInvocations).toBe(2)
    expect(state.cycles?.[0]?.publishVerdict).toBe("clean")
    expect(state.swarmInvocations).toBe(0)
    expect(state.passes).toHaveLength(0)

    await reviewState.execute({ branch: "feature/multicycle", action: "record_swarm" }, context)

    const nextP1 = parse(
      await reviewState.execute(
        { branch: "feature/multicycle", action: "record_pass", pass: 1, blockersHash: "hashB1" },
        context,
      ),
    )
    expect(nextP1.nextAction).toBe("fix")

    const nextPublish = parse(
      await reviewState.execute(
        { branch: "feature/multicycle", action: "request_publish", verdict: "clean" },
        context,
      ),
    )
    expect(nextPublish.authorized).toBe(true)

    const nextRestarted = parse(await reviewState.execute({ branch: "feature/multicycle", action: "start" }, context))
    const nextState = nextRestarted.state as {
      cycles?: { passes?: { blockersHash?: string }[]; swarmInvocations?: number }[]
    }
    expect(nextState.cycles).toHaveLength(2)
    expect(nextState.cycles?.[0]?.passes?.[0]?.blockersHash).toBe("hashA1")
    expect(nextState.cycles?.[0]?.swarmInvocations).toBe(2)
    expect(nextState.cycles?.[1]?.passes?.[0]?.blockersHash).toBe("hashB1")
    expect(nextState.cycles?.[1]?.swarmInvocations).toBe(1)
  })
})

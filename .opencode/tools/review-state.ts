import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { tool } from "@opencode-ai/plugin"

type NextAction = "fix" | "publish_blocked" | "abort_duplicate"
type Verdict = "clean" | "blocked"

type PassEntry = {
  pass: number
  blockersHash: string
  recordedAt: string
  nextAction: NextAction
}

type ArchivedCycle = {
  startedAt: string
  archivedAt: string
  passes: PassEntry[]
  swarmInvocations: number
  publishVerdict?: Verdict
}

type State = {
  branch: string
  startedAt: string
  passes: PassEntry[]
  publishAuthorized: boolean
  swarmInvocations: number
  publishVerdict?: Verdict
  cycles?: ArchivedCycle[]
}

type Action = "start" | "record_pass" | "request_publish" | "record_swarm" | "read"

function sanitizeBranch(branch: string) {
  if (branch.includes("..")) {
    throw new Error("branch must not contain '..'")
  }

  if (branch.includes("\0")) {
    throw new Error("branch must not contain null bytes")
  }

  return branch.replaceAll("/", "__")
}

function stateRoot() {
  return process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state")
}

function repoKey(worktree: string) {
  return createHash("sha256").update(path.resolve(worktree)).digest("hex").slice(0, 16)
}

function statePath(worktree: string, branch: string) {
  return path.join(stateRoot(), "opencode", "review-state", repoKey(worktree), `${sanitizeBranch(branch)}.json`)
}

async function readState(filePath: string): Promise<State | null> {
  let content = ""

  try {
    content = await readFile(filePath, "utf8")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null
    }

    throw error
  }

  try {
    const parsed = JSON.parse(content) as Partial<State>

    if (
      typeof parsed.branch !== "string" ||
      typeof parsed.startedAt !== "string" ||
      !Array.isArray(parsed.passes) ||
      typeof parsed.publishAuthorized !== "boolean"
    ) {
      throw new Error(`corrupted state file at ${filePath} - delete it to reset the loop`)
    }

    return {
      branch: parsed.branch,
      startedAt: parsed.startedAt,
      passes: parsed.passes,
      publishAuthorized: parsed.publishAuthorized,
      swarmInvocations: typeof parsed.swarmInvocations === "number" ? parsed.swarmInvocations : 0,
      publishVerdict: parsed.publishVerdict,
      cycles: Array.isArray(parsed.cycles) ? (parsed.cycles as ArchivedCycle[]) : undefined,
    }
  } catch (error) {
    throw new Error(`corrupted state file at ${filePath} - delete it to reset the loop`)
  }
}

async function writeState(filePath: string, state: State) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

function requirePass(pass: number | undefined) {
  if (pass === undefined) {
    throw new Error("pass is required for record_pass")
  }

  return pass
}

function requireBlockersHash(blockersHash: string | undefined) {
  if (blockersHash === undefined) {
    throw new Error("blockersHash is required for record_pass")
  }

  return blockersHash
}

function requireVerdict(verdict: Verdict | undefined) {
  if (verdict === undefined) {
    throw new Error("verdict is required for request_publish")
  }

  return verdict
}

function nextActionFor(pass: number, blockersHash: string, state: State): NextAction {
  if (pass === 3) {
    return "publish_blocked"
  }

  if (state.passes.some((entry) => entry.blockersHash === blockersHash)) {
    return "abort_duplicate"
  }

  return "fix"
}

function swarmCap() {
  const configured = Number.parseInt(process.env.OPENCODE_REVIEW_SWARM_CAP ?? "", 10)
  return Number.isInteger(configured) && configured > 0 ? configured : 8
}

export default tool({
  description: "Persist and enforce review/fix loop state per branch.",
  args: {
    branch: tool.schema.string().describe("Parent branch name used as the state key."),
    action: tool.schema
      .enum(["start", "record_pass", "request_publish", "record_swarm", "read"])
      .describe("State-machine action to execute."),
    pass: tool.schema.number().int().optional().describe("Review pass number for record_pass."),
    blockersHash: tool.schema
      .string()
      .optional()
      .describe("Caller-computed sha256 hex of the normalized blocker list."),
    verdict: tool.schema.enum(["clean", "blocked"]).optional().describe("Publish verdict for request_publish."),
  },
  async execute(args, context) {
    const filePath = statePath(context.worktree, args.branch)
    const action = args.action as Action

    if (action === "read") {
      return JSON.stringify({ ok: true, state: await readState(filePath) })
    }

    if (action === "start") {
      const existing = await readState(filePath)
      if (existing !== null) {
        if (existing.publishAuthorized !== true) {
          return JSON.stringify({ ok: true, state: existing })
        }

        const now = new Date().toISOString()
        const state: State = {
          branch: args.branch,
          startedAt: now,
          passes: [],
          publishAuthorized: false,
          swarmInvocations: 0,
          cycles: [
            ...(existing.cycles ?? []),
            {
              startedAt: existing.startedAt,
              archivedAt: now,
              passes: existing.passes,
              swarmInvocations: existing.swarmInvocations,
              publishVerdict: existing.publishVerdict,
            },
          ],
        }
        await writeState(filePath, state)
        return JSON.stringify({ ok: true, state })
      }

      const state: State = {
        branch: args.branch,
        startedAt: new Date().toISOString(),
        passes: [],
        publishAuthorized: false,
        swarmInvocations: 0,
        cycles: [],
      }
      await writeState(filePath, state)
      return JSON.stringify({ ok: true, state })
    }

    const state = await readState(filePath)

    if (action === "record_pass") {
      if (state === null) {
        throw new Error("call start first")
      }

      const pass = requirePass(args.pass)
      const blockersHash = requireBlockersHash(args.blockersHash)
      const lastPass = state.passes.at(-1)?.pass ?? 0

      if (pass <= lastPass) {
        throw new Error("non-monotonic pass")
      }

      if (pass > 3) {
        throw new Error("loop cap exceeded")
      }

      const nextAction = nextActionFor(pass, blockersHash, state)
      state.passes.push({
        pass,
        blockersHash,
        recordedAt: new Date().toISOString(),
        nextAction,
      })
      await writeState(filePath, state)
      return JSON.stringify({ ok: true, nextAction, state })
    }

    if (action === "request_publish") {
      if (state === null) {
        throw new Error("no state - call start first")
      }

      const verdict = requireVerdict(args.verdict as Verdict | undefined)

      if (state.publishAuthorized === true) {
        return JSON.stringify({ ok: true, authorized: true, verdict: state.publishVerdict, state })
      }

      if (verdict === "clean") {
        const lastPass = state.passes.at(-1)
        if (lastPass?.nextAction === "publish_blocked" || lastPass?.nextAction === "abort_duplicate") {
          throw new Error("cannot authorize clean publish after unresolved review loop")
        }
      }

      state.publishAuthorized = true
      state.publishVerdict = verdict
      await writeState(filePath, state)
      return JSON.stringify({ ok: true, authorized: true, verdict, state })
    }

    if (action === "record_swarm") {
      if (state === null) {
        throw new Error("call start first")
      }

      state.swarmInvocations += 1
      if (state.swarmInvocations > swarmCap()) {
        throw new Error(`swarm budget exhausted: ${state.swarmInvocations} reviewer-* calls > cap ${swarmCap()}`)
      }
      await writeState(filePath, state)
      return JSON.stringify({ ok: true, swarmInvocations: state.swarmInvocations, state })
    }

    throw new Error(`unsupported action: ${action}`)
  },
})

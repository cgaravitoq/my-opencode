import type { Plugin } from "@opencode-ai/plugin"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"

type ReviewState = {
  branch?: string
  startedAt?: string
  passes?: unknown[]
  publishAuthorized?: boolean
  swarmInvocations?: number
}

const publishCommandPattern = /(^|\s)(git\s+push|gh\s+pr\s+create|gh\s+pr\s+edit)\b/
const reviewerSubagentPattern = /^reviewer-(quick|arch|reasoning|e2e)$/
const configuredSwarmCap = Number.parseInt(process.env.OPENCODE_REVIEW_SWARM_CAP ?? "", 10)
const swarmCap = Number.isInteger(configuredSwarmCap) && configuredSwarmCap > 0 ? configuredSwarmCap : 8
const bypassEnabled = process.env.OPENCODE_REVIEW_BYPASS === "1"

function parseBranchFromCommand(cmd: string): string | null {
  const gitPushMatch = cmd.match(/git\s+push\s+(?:(?:--?[\w-]+(?:[= ][^\s]*)?\s+)*)(\S+)\s+(\S+)/)
  const gitPushBranch = gitPushMatch?.[2]
  if (gitPushBranch) return gitPushBranch.replace(/^HEAD:/, "")

  const ghHeadMatch = cmd.match(/gh\s+pr\s+create\b.*?--head[= ]([^\s]+)/)
  const ghHeadBranch = ghHeadMatch?.[1]
  if (ghHeadBranch) return ghHeadBranch

  return null
}

function extractWorkdir(args: Record<string, unknown>): string | null {
  const wd = args.workdir
  return typeof wd === "string" && wd.length > 0 ? wd : null
}

const stateRoot = () => process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state")

const repoKey = (worktree: string) => createHash("sha256").update(path.resolve(worktree)).digest("hex").slice(0, 16)

const stateFileForBranch = (worktree: string, branch: string) => {
  const sanitizedBranch = branch.replaceAll("/", "__")
  return path.join(stateRoot(), "opencode", "review-state", repoKey(worktree), `${sanitizedBranch}.json`)
}

async function readReviewState(filePath: string): Promise<ReviewState | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as ReviewState

    if (parsed.swarmInvocations !== undefined && typeof parsed.swarmInvocations !== "number") {
      throw new Error("corrupted state: swarmInvocations is not a number")
    }

    if (parsed.publishAuthorized !== undefined && typeof parsed.publishAuthorized !== "boolean") {
      throw new Error("corrupted state: publishAuthorized is not a boolean")
    }

    return parsed
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null
    }

    throw error
  }
}

function initialReviewState(branch: string): ReviewState {
  return {
    branch,
    startedAt: new Date().toISOString(),
    passes: [],
    publishAuthorized: false,
    swarmInvocations: 0,
  }
}

let lock: Promise<void> = Promise.resolve()

export const ReviewGuardrails: Plugin = async ({ $, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        const cmd = String(output.args.command ?? "")

        if (publishCommandPattern.test(cmd)) {
          if (bypassEnabled) return

          const explicitBranch = parseBranchFromCommand(cmd)
          const cwd = extractWorkdir(output.args as Record<string, unknown>) ?? worktree
          let branch = explicitBranch ?? ""

          if (!branch) {
            try {
              branch = (await $`git rev-parse --abbrev-ref HEAD`.cwd(cwd).text()).trim()
            } catch {
              throw new Error("review-guardrails: cannot determine current branch; refusing publish")
            }
          }

          if (!branch || branch === "HEAD") {
            throw new Error("review-guardrails: cannot determine current branch; refusing publish")
          }

          const stateFile = stateFileForBranch(worktree, branch)
          const state = await readReviewState(stateFile)

          if (state?.publishAuthorized !== true) {
            throw new Error(
              `publish gated by review-state for branch '${branch}' - call review-state with action='request_publish' and verdict before git push, gh pr create, or gh pr edit (or set OPENCODE_REVIEW_BYPASS=1 for emergencies)`,
            )
          }
        }
      }

      if (input.tool === "task") {
        const sub = String(output.args.subagent_type ?? "")

        if (reviewerSubagentPattern.test(sub)) {
          const branch = (await $`git rev-parse --abbrev-ref HEAD`.cwd(worktree).text()).trim()
          const stateFile = stateFileForBranch(worktree, branch)

          const next = lock.then(async () => {
            const state = (await readReviewState(stateFile)) ?? initialReviewState(branch)

            state.swarmInvocations = (state.swarmInvocations ?? 0) + 1

            if (state.swarmInvocations > swarmCap) {
              throw new Error(`swarm budget exhausted: ${state.swarmInvocations} reviewer-* calls > cap ${swarmCap}`)
            }

            await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8")
          })

          lock = next.catch(() => undefined)
          await next
        }
      }
    },
  }
}

import type { Plugin } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
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

const reviewerSubagentPattern = /^reviewer-(quick|arch|reasoning|e2e)$/

const stateRoot = () => process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state")

const repoKey = (worktree: string) => createHash("sha256").update(path.resolve(worktree)).digest("hex").slice(0, 16)

const stateFileForBranch = (worktree: string, branch: string) => {
  const sanitizedBranch = branch.replaceAll("/", "__")
  return path.join(stateRoot(), "opencode", "review-state", repoKey(worktree), `${sanitizedBranch}.json`)
}

async function readReviewState(filePath: string): Promise<ReviewState | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as ReviewState

    return parsed
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null
    }

    return null
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
      if (input.tool === "task") {
        const sub = String(output.args.subagent_type ?? "")

        if (reviewerSubagentPattern.test(sub)) {
          const branch = (await $`git rev-parse --abbrev-ref HEAD`.cwd(worktree).text()).trim()
          const stateFile = stateFileForBranch(worktree, branch)

          const next = lock.then(async () => {
            const state = (await readReviewState(stateFile)) ?? initialReviewState(branch)

            state.swarmInvocations = (state.swarmInvocations ?? 0) + 1

            await mkdir(path.dirname(stateFile), { recursive: true })
            await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8")
          })

          lock = next.catch(() => undefined)
          await next
        }
      }
    },
  }
}

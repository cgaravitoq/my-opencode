#!/usr/bin/env bun
// Unified installer for opencode-template.
//
// Commands:
//   bun scripts/cli.ts setup                          Symlink this repo into ~/.config/opencode/
//   bun scripts/cli.ts cleanup                        Remove symlinks created by setup
//   bun scripts/cli.ts install-issues-bundle [REPO]   Copy templates/github-issues-skill/ into <repo>/.agents/skills/github-issues/
//
// Flags for install-issues-bundle: --force (overwrites with timestamped backup).

import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { mkdir, readdir, rename, rm, symlink, cp } from "node:fs/promises";
import { dirname, basename, join, resolve } from "node:path";
import { homedir } from "node:os";

const REPO_DIR = resolve(import.meta.dirname, "..");
const TARGET_DIR = join(homedir(), ".config", "opencode");
const TEMPLATE_DIR = join(REPO_DIR, "templates", "github-issues-skill");

async function link(src: string, dst: string) {
  if (existsSync(dst) || isSymlink(dst)) {
    if (isSymlink(dst)) {
      await rm(dst);
    } else {
      console.log(`Backing up ${dst} -> ${dst}.backup`);
      await rename(dst, `${dst}.backup`);
    }
  }
  await symlink(src, dst);
  console.log(`Linked ${dst} -> ${src}`);
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

async function linkFilesInDir(srcDir: string, dstDir: string, extensions: string[]) {
  if (!existsSync(srcDir)) return;
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!extensions.some((ext) => name.endsWith(ext))) continue;
    if (/\.(test|spec)\.(ts|js)$/.test(name)) continue;
    await link(join(srcDir, name), join(dstDir, name));
  }
}

async function linkDirsInDir(srcParent: string, dstParent: string) {
  if (!existsSync(srcParent)) return;
  const entries = await readdir(srcParent, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await link(join(srcParent, entry.name), join(dstParent, entry.name));
  }
}

async function setup() {
  await mkdir(join(TARGET_DIR, "agents"), { recursive: true });
  await mkdir(join(TARGET_DIR, "skills"), { recursive: true });
  await mkdir(join(TARGET_DIR, "plugins"), { recursive: true });
  await mkdir(join(TARGET_DIR, "tools"), { recursive: true });

  await link(join(REPO_DIR, "opencode.json"), join(TARGET_DIR, "opencode.json"));
  await link(join(REPO_DIR, "AGENTS.md"), join(TARGET_DIR, "AGENTS.md"));
  await link(join(REPO_DIR, "package.json"), join(TARGET_DIR, "package.json"));

  await linkFilesInDir(join(REPO_DIR, "agents"), join(TARGET_DIR, "agents"), [".md"]);
  await linkDirsInDir(join(REPO_DIR, "skills"), join(TARGET_DIR, "skills"));
  await linkFilesInDir(join(REPO_DIR, ".opencode", "plugins"), join(TARGET_DIR, "plugins"), [".ts", ".js"]);
  await linkFilesInDir(join(REPO_DIR, ".opencode", "tools"), join(TARGET_DIR, "tools"), [".ts", ".js"]);

  console.log(`
Install complete.

Next steps:
  1. Run \`opencode\` to verify the config, plugins, and tools load.
  2. In the TUI, run \`/agents\` and \`/models\` to confirm everything is wired.
  3. For optional remote MCPs that need OAuth (e.g. \`vercel\`, \`cloudflare\`), run \`/connect\` inside OpenCode.
  4. For GitHub Issues integration, ensure \`gh\` CLI is authenticated: \`gh auth login\`.
     Install the per-repo bundle in any target repo with: \`bun run install-issues-bundle /path/to/repo\`.

Re-run this script anytime you pull updates from the repo.
`);
}

async function unlinkIfOurs(dst: string) {
  if (!isSymlink(dst)) return;
  const resolved = readlinkSync(dst);
  if (!resolved.startsWith(`${REPO_DIR}/`)) return;
  await rm(dst);
  console.log(`Removed link ${dst}`);
  const backup = `${dst}.backup`;
  if (existsSync(backup)) {
    await rename(backup, dst);
    console.log(`Restored backup -> ${dst}`);
  }
}

async function unlinkAllSymlinksIn(dir: string) {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (isSymlink(path)) await unlinkIfOurs(path);
  }
}

async function cleanup() {
  await unlinkIfOurs(join(TARGET_DIR, "opencode.json"));
  await unlinkIfOurs(join(TARGET_DIR, "AGENTS.md"));
  await unlinkIfOurs(join(TARGET_DIR, "package.json"));
  await unlinkAllSymlinksIn(join(TARGET_DIR, "agents"));
  await unlinkAllSymlinksIn(join(TARGET_DIR, "skills"));
  await unlinkAllSymlinksIn(join(TARGET_DIR, "plugins"));
  await unlinkAllSymlinksIn(join(TARGET_DIR, "tools"));
  console.log("Uninstall complete.");
}

async function installIssuesBundle(args: string[]) {
  let force = false;
  let targetRepo: string | undefined;

  for (const arg of args) {
    if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: bun run install-issues-bundle [TARGET_REPO] [--force]

Copies templates/github-issues-skill/ into TARGET_REPO/.agents/skills/github-issues/.
TARGET_REPO defaults to the current working directory.

Options:
  --force, -f    Overwrite an existing bundle (timestamped backup).
  -h, --help     Show this help.`);
      return;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(2);
    } else {
      if (targetRepo) {
        console.error("Multiple target repos given. Pass at most one.");
        process.exit(2);
      }
      targetRepo = arg;
    }
  }

  targetRepo = resolve(targetRepo ?? process.cwd());
  const dst = join(targetRepo, ".agents", "skills", "github-issues");

  if (!existsSync(TEMPLATE_DIR)) {
    console.error(`Template not found at: ${TEMPLATE_DIR}`);
    process.exit(1);
  }
  if (!existsSync(join(targetRepo, ".git"))) {
    console.error(`Target is not a git repo: ${targetRepo}`);
    process.exit(1);
  }

  if (existsSync(dst)) {
    if (!force) {
      console.error(`GitHub Issues skill bundle already exists at: ${dst}`);
      console.error("Re-run with --force to overwrite (existing folder will be backed up).");
      process.exit(1);
    }
    const backup = `${dst}.backup.${Math.floor(Date.now() / 1000)}`;
    console.log(`Existing bundle moved to: ${backup}`);
    await rename(dst, backup);
  }

  await mkdir(dirname(dst), { recursive: true });
  await cp(TEMPLATE_DIR, dst, { recursive: true });

  console.log(`
Installed GitHub Issues skill bundle:
  ${dst}

Next steps:
  1. (Optional) Edit ${dst}/SKILL.md if you want different 'status:*' label names.
     Default: status:idea / status:draft / status:prd / status:running / status:hitl / status:ready.
  2. Tweak sub-skill bodies (idea-to-issue, project-to-draft, draft-to-prd, prd-to-execution)
     so they match your shaping conventions.
  3. Seed the canonical labels in this repo:
       for s in idea:d4c5f9 draft:fbca04 prd:0e8a16 running:1d76db hitl:5319e7 ready:0e8a16; do
         name="\${s%%:*}"; color="\${s##*:}"
         gh label create "status:$name" --color "$color" --force
       done
       for t in feature bug refactor chore docs infra perf test; do
         gh label create "type:$t" --color "cccccc" --force
       done
       gh label create "hitl"         --color "5319e7" --force
       gh label create "hitl-blocked" --color "b60205" --force
  4. The architect agent will auto-detect this bundle and use it for GitHub-Issues-mode requests
     made inside this repo. Code work always delegates to the global 'pipeline-execution' skill.
`);
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "setup":
    await setup();
    break;
  case "cleanup":
    await cleanup();
    break;
  case "install-issues-bundle":
    await installIssuesBundle(rest);
    break;
  default:
    console.error(`Usage: bun scripts/cli.ts <setup|cleanup|install-issues-bundle> [args]`);
    process.exit(2);
}

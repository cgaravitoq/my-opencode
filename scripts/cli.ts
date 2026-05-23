#!/usr/bin/env bun
import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { mkdir, readdir, rename, rm, symlink, cp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const REPO_DIR = resolve(import.meta.dirname, "..");
const TARGET_DIR = join(homedir(), ".config", "opencode");
const TEMPLATE_DIR = join(REPO_DIR, "templates", "github-issues-skill");

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

async function link(src: string, dst: string) {
  if (isSymlink(dst)) {
    await rm(dst);
  } else if (existsSync(dst)) {
    await rename(dst, `${dst}.backup`);
    console.log(`Backed up ${dst} -> ${dst}.backup`);
  }
  await symlink(src, dst);
  console.log(`Linked ${dst} -> ${src}`);
}

async function linkFilesInDir(srcDir: string, dstDir: string, extensions: string[]) {
  if (!existsSync(srcDir)) return;
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
    if (/\.(test|spec)\.(ts|js)$/.test(entry.name)) continue;
    await link(join(srcDir, entry.name), join(dstDir, entry.name));
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
  for (const sub of ["agents", "skills", "plugins", "tools"]) {
    await mkdir(join(TARGET_DIR, sub), { recursive: true });
  }
  await link(join(REPO_DIR, "opencode.json"), join(TARGET_DIR, "opencode.json"));
  await link(join(REPO_DIR, "AGENTS.md"), join(TARGET_DIR, "AGENTS.md"));
  await link(join(REPO_DIR, "package.json"), join(TARGET_DIR, "package.json"));
  await linkFilesInDir(join(REPO_DIR, "agents"), join(TARGET_DIR, "agents"), [".md"]);
  await linkDirsInDir(join(REPO_DIR, "skills"), join(TARGET_DIR, "skills"));
  await linkFilesInDir(join(REPO_DIR, ".opencode", "plugins"), join(TARGET_DIR, "plugins"), [".ts", ".js"]);
  await linkFilesInDir(join(REPO_DIR, ".opencode", "tools"), join(TARGET_DIR, "tools"), [".ts", ".js"]);
  console.log("\nSetup complete.");
}

async function unlinkIfOurs(dst: string) {
  if (!isSymlink(dst)) return;
  if (!readlinkSync(dst).startsWith(`${REPO_DIR}/`)) return;
  await rm(dst);
  console.log(`Removed ${dst}`);
  const backup = `${dst}.backup`;
  if (existsSync(backup)) {
    await rename(backup, dst);
    console.log(`Restored ${dst}`);
  }
}

async function unlinkAllSymlinksIn(dir: string) {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    await unlinkIfOurs(join(dir, entry.name));
  }
}

async function cleanup() {
  await unlinkIfOurs(join(TARGET_DIR, "opencode.json"));
  await unlinkIfOurs(join(TARGET_DIR, "AGENTS.md"));
  await unlinkIfOurs(join(TARGET_DIR, "package.json"));
  for (const sub of ["agents", "skills", "plugins", "tools"]) {
    await unlinkAllSymlinksIn(join(TARGET_DIR, sub));
  }
  console.log("Cleanup complete.");
}

async function installIssuesBundle(args: string[]) {
  let force = false;
  let targetRepo: string | undefined;

  for (const arg of args) {
    if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log("Usage: bun run install-issues-bundle [TARGET_REPO] [--force]");
      return;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(2);
    } else if (targetRepo) {
      console.error("Multiple target repos given. Pass at most one.");
      process.exit(2);
    } else {
      targetRepo = arg;
    }
  }

  targetRepo = resolve(targetRepo ?? process.cwd());
  const dst = join(targetRepo, ".agents", "skills", "github-issues");

  if (!existsSync(TEMPLATE_DIR)) {
    console.error(`Template not found: ${TEMPLATE_DIR}`);
    process.exit(1);
  }
  if (!existsSync(join(targetRepo, ".git"))) {
    console.error(`Not a git repo: ${targetRepo}`);
    process.exit(1);
  }

  if (existsSync(dst)) {
    if (!force) {
      console.error(`Bundle already exists at ${dst}. Re-run with --force.`);
      process.exit(1);
    }
    const backup = `${dst}.backup.${Math.floor(Date.now() / 1000)}`;
    await rename(dst, backup);
    console.log(`Backed up existing bundle -> ${backup}`);
  }

  await mkdir(dirname(dst), { recursive: true });
  await cp(TEMPLATE_DIR, dst, { recursive: true });
  console.log(`Installed bundle: ${dst}`);
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
    console.error("Usage: bun scripts/cli.ts <setup|cleanup|install-issues-bundle> [args]");
    process.exit(2);
}

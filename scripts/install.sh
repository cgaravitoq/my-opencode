#!/usr/bin/env bash
# Symlinks the contents of this repo into ~/.config/opencode/.
# Existing files are backed up to <name>.backup before being replaced.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${HOME}/.config/opencode"

mkdir -p "${TARGET_DIR}/agents" "${TARGET_DIR}/skills" "${TARGET_DIR}/plugins" "${TARGET_DIR}/tools"

link() {
  local src="$1"
  local dst="$2"

  if [[ -L "$dst" ]]; then
    rm "$dst"
  elif [[ -e "$dst" ]]; then
    echo "Backing up $dst -> $dst.backup"
    mv "$dst" "$dst.backup"
  fi

  ln -s "$src" "$dst"
  echo "Linked $dst -> $src"
}

# Top-level files
link "${REPO_DIR}/opencode.json" "${TARGET_DIR}/opencode.json"
link "${REPO_DIR}/AGENTS.md"     "${TARGET_DIR}/AGENTS.md"
link "${REPO_DIR}/package.json"  "${TARGET_DIR}/package.json"

# Agents (file by file so new ones in the target dir aren't disturbed)
for agent_file in "${REPO_DIR}/agents/"*.md; do
  [[ -f "$agent_file" ]] || continue
  link "$agent_file" "${TARGET_DIR}/agents/$(basename "$agent_file")"
done

# Skills (whole directories)
for skill_dir in "${REPO_DIR}/skills/"*/; do
  [[ -d "$skill_dir" ]] || continue
  skill_name="$(basename "$skill_dir")"
  link "${skill_dir%/}" "${TARGET_DIR}/skills/${skill_name}"
done

# Plugins (file by file so new ones in the target dir aren't disturbed)
for plugin_file in "${REPO_DIR}/.opencode/plugins/"*.{ts,js}; do
  [[ -f "$plugin_file" ]] || continue
  link "$plugin_file" "${TARGET_DIR}/plugins/$(basename "$plugin_file")"
done

# Tools (file by file so new ones in the target dir aren't disturbed)
for tool_file in "${REPO_DIR}/.opencode/tools/"*.{ts,js}; do
  [[ -f "$tool_file" ]] || continue
  case "$(basename "$tool_file")" in
    *.test.ts|*.test.js|*.spec.ts|*.spec.js) continue ;;
  esac
  link "$tool_file" "${TARGET_DIR}/tools/$(basename "$tool_file")"
done

cat <<'MSG'

Install complete.

Next steps:
  1. Run `opencode` to verify the config, plugins, and tools load.
  2. In the TUI, run `/agents` and `/models` to confirm everything is wired.
  3. For optional remote MCPs that need OAuth (e.g. `vercel`, `cloudflare`), run `/connect` inside OpenCode.
  4. For GitHub Issues integration, ensure `gh` CLI is authenticated: `gh auth login`.
     Install the per-repo bundle in any target repo with: `./scripts/install-github-issues-skill.sh /path/to/repo`.

Re-run this script anytime you pull updates from the repo.
MSG

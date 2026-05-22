#!/usr/bin/env bash
# Removes symlinks created by install.sh and restores any .backup files.
# Does NOT touch ~/.config/opencode/ contents that were not linked from this repo.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${HOME}/.config/opencode"

unlink_if_ours() {
  local dst="$1"
  if [[ -L "$dst" ]]; then
    local resolved
    resolved="$(readlink "$dst")"
    if [[ "$resolved" == "${REPO_DIR}/"* ]]; then
      rm "$dst"
      echo "Removed link $dst"
      if [[ -e "${dst}.backup" ]]; then
        mv "${dst}.backup" "$dst"
        echo "Restored backup -> $dst"
      fi
    fi
  fi
}

unlink_if_ours "${TARGET_DIR}/opencode.json"
unlink_if_ours "${TARGET_DIR}/AGENTS.md"
unlink_if_ours "${TARGET_DIR}/package.json"

for f in "${TARGET_DIR}/agents/"*.md; do
  [[ -L "$f" ]] || continue
  unlink_if_ours "$f"
done

for d in "${TARGET_DIR}/skills/"*; do
  [[ -L "$d" ]] || continue
  unlink_if_ours "$d"
done

for f in "${TARGET_DIR}/plugins/"*.{ts,js}; do
  [[ -L "$f" ]] || continue
  unlink_if_ours "$f"
done

for f in "${TARGET_DIR}/tools/"*.{ts,js}; do
  [[ -L "$f" ]] || continue
  unlink_if_ours "$f"
done

echo "Uninstall complete."

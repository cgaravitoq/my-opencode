#!/usr/bin/env bash
# Installs the GitHub Issues skill bundle template into a target repo's .agents/skills/github-issues/.
# Usage:
#   ./scripts/install-github-issues-skill.sh                  # installs in $(pwd)
#   ./scripts/install-github-issues-skill.sh /path/to/repo    # installs in given repo
#   ./scripts/install-github-issues-skill.sh --force          # overwrites if already installed

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="${REPO_DIR}/templates/github-issues-skill"

FORCE=0
TARGET_REPO=""

for arg in "$@"; do
  case "$arg" in
    --force|-f)
      FORCE=1
      ;;
    -h|--help)
      cat <<USAGE
Usage: install-github-issues-skill.sh [TARGET_REPO] [--force]

Installs the GitHub Issues skill bundle template into TARGET_REPO/.agents/skills/github-issues/.
TARGET_REPO defaults to the current working directory.

Options:
  --force, -f    Overwrite an existing .agents/skills/github-issues/ directory.
  -h, --help     Show this help.

After installing:
  1. Edit .agents/skills/github-issues/SKILL.md if you want different status:* label names.
  2. Customize sub-skills (idea-to-issue, project-to-draft, draft-to-prd, prd-to-execution) for your flow.
  3. Seed the canonical labels in this repo (see references/status-mapping.md "Seeding labels").
  4. The architect agent auto-detects the bundle and uses it for GitHub-Issues-mode requests in this repo.
USAGE
      exit 0
      ;;
    -*)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
    *)
      if [[ -n "$TARGET_REPO" ]]; then
        echo "Multiple target repos given. Pass at most one." >&2
        exit 2
      fi
      TARGET_REPO="$arg"
      ;;
  esac
done

TARGET_REPO="${TARGET_REPO:-$(pwd)}"
TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"
TARGET_DIR="${TARGET_REPO}/.agents/skills/github-issues"

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "Template not found at: $TEMPLATE_DIR" >&2
  echo "Make sure this script lives inside the opencode-template repo." >&2
  exit 1
fi

if [[ ! -d "$TARGET_REPO/.git" ]]; then
  echo "Target is not a git repo: $TARGET_REPO" >&2
  exit 1
fi

if [[ -e "$TARGET_DIR" ]]; then
  if [[ "$FORCE" -eq 1 ]]; then
    BACKUP="${TARGET_DIR}.backup.$(date +%s)"
    echo "Existing bundle moved to: $BACKUP"
    mv "$TARGET_DIR" "$BACKUP"
  else
    echo "GitHub Issues skill bundle already exists at: $TARGET_DIR" >&2
    echo "Re-run with --force to overwrite (existing folder will be backed up)." >&2
    exit 1
  fi
fi

mkdir -p "$(dirname "$TARGET_DIR")"
cp -R "$TEMPLATE_DIR" "$TARGET_DIR"

cat <<DONE

Installed GitHub Issues skill bundle:
  $TARGET_DIR

Next steps:
  1. (Optional) Edit $TARGET_DIR/SKILL.md if you want different 'status:*' label names.
     Default: status:idea / status:draft / status:prd / status:running / status:hitl / status:ready.
  2. Tweak sub-skill bodies (idea-to-issue, project-to-draft, draft-to-prd, prd-to-execution)
     so they match your shaping conventions.
  3. Seed the canonical labels in this repo:
       for s in idea:d4c5f9 draft:fbca04 prd:0e8a16 running:1d76db hitl:5319e7 ready:0e8a16; do
         name="\${s%%:*}"; color="\${s##*:}"
         gh label create "status:\$name" --color "\$color" --force
       done
       for t in feature bug refactor chore docs infra perf test; do
         gh label create "type:\$t" --color "cccccc" --force
       done
       gh label create "hitl"         --color "5319e7" --force  # PR label (clean review)
       gh label create "hitl-blocked" --color "b60205" --force  # PR label (loop exhausted)
  4. The architect agent will auto-detect this bundle and use it for GitHub-Issues-mode requests
     made inside this repo. Code work always delegates to the global 'pipeline-execution' skill.

DONE

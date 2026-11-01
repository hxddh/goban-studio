#!/usr/bin/env bash
# Create the GitHub repository (first run) and push the current main branch.
# Requires `gh auth login` with permission to create repositories in the
# target account. `--private` is the default; pass PUBLIC as the second
# argument to create a public repository instead.
set -euo pipefail

REPO="${1:-hxddh/goban-studio}"
VISIBILITY="${2:-private}"
cd "$(dirname "$0")/.."

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "not a git checkout" >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$REPO" >/dev/null 2>&1; then
    # The user created an empty repository in the web UI. Link it rather
    # than asking gh to create it a second time.
    git remote add origin "https://github.com/${REPO}.git"
  else
    gh repo create "$REPO" "--${VISIBILITY}" \
      --description "Goban Studio — a beginner-first Go (围棋 · 바둑 · 囲碁) app for macOS and Windows." \
      --source=. --remote=origin
  fi
fi

git push -u origin main

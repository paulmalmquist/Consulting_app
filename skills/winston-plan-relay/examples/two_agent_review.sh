#!/usr/bin/env bash
# Mode: two-agent-loop. Ticket 1 stub: emits the bundle with a Ticket-2 deferral note.
# Ticket 2 will actually invoke Claude CLI and Codex CLI as reviewers.
# Run from repo root.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
INPUT="${1:?usage: $0 <plan-or-idea.md> [out-path]}"
OUT="${2:-tmp/relay-two-agent.md}"

mkdir -p "$(dirname "$OUT")"

python skills/winston-plan-relay/scripts/relay.py \
  --repo-root "$REPO_ROOT" \
  --input "$INPUT" \
  --mode two-agent-loop \
  --reviewers claude,codex \
  --target-agent claude-code \
  --out "$OUT" \
  --dry-run \
  --print-next-command

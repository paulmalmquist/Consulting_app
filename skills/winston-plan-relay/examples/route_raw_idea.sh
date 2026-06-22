#!/usr/bin/env bash
# Mode: route-and-plan. Turns a rough idea file into a Winston-shaped drafted plan + Ticket 1 handoff.
# Run from repo root. Pass the path to your raw-idea markdown as $1.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
IDEA="${1:?usage: $0 <path-to-raw-idea.md> [out-path]}"
OUT="${2:-tmp/relay-plan.md}"

mkdir -p "$(dirname "$OUT")"

python skills/winston-plan-relay/scripts/relay.py \
  --repo-root "$REPO_ROOT" \
  --input "$IDEA" \
  --mode route-and-plan \
  --target-agent codex \
  --out "$OUT" \
  --dry-run \
  --print-next-command

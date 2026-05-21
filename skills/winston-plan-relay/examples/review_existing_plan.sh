#!/usr/bin/env bash
# Mode: plan-review. Critiques an existing active plan and emits a refined handoff prompt.
# Run from repo root.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
PLAN="${1:-docs/plans/03-implementation-plans/active/0001-meridian-repe-ui-data-integrity-roadmap.md}"
OUT="${2:-tmp/relay-review.md}"

mkdir -p "$(dirname "$OUT")"

python skills/winston-plan-relay/scripts/relay.py \
  --repo-root "$REPO_ROOT" \
  --input "$PLAN" \
  --mode plan-review \
  --target-agent claude-code \
  --out "$OUT" \
  --dry-run \
  --print-next-command

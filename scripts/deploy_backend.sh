#!/usr/bin/env bash
# Deploy backend to Railway, capturing the current git SHA so the running
# container exposes it via /version.
#
# Usage:
#   ./scripts/deploy_backend.sh                  # deploys current local tree
#   ./scripts/deploy_backend.sh --service NAME   # override Railway service
#
# Requires:
#   - `railway` CLI logged in (`railway login`)
#   - The Railway service is linked from `backend/` (`cd backend && railway link`)
#
# What it does:
#   1. Captures the working-tree git SHA into backend/.git_sha (gitignored).
#      Marks the SHA dirty (-dirty suffix) if the tree has uncommitted edits,
#      so `/version` can flag a CLI deploy that doesn't match origin/main.
#   2. Runs `railway up --service <name>` from the backend/ directory.
#      Railway packages the local tree (including .git_sha) and builds.
#   3. The backend reads .git_sha at startup and exposes it on GET /version.

set -euo pipefail

SERVICE="authentic-sparkle"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      SERVICE="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SHA="$(git rev-parse HEAD)"
if ! git diff-index --quiet HEAD --; then
  SHA="${SHA}-dirty"
fi

echo "$SHA" > backend/.git_sha
echo "captured git SHA: $SHA"

cd backend
exec railway up --service "$SERVICE"

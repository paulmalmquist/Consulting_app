#!/usr/bin/env bash
set -euo pipefail

# ── Load lock guard ──────────────────────────────────────────────
# Clear stale .git lock files before any git operation so that
# autonomous sessions don't cascade-fail from a prior session's
# interrupted git call.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/git_lock_guard.sh" ]]; then
  # shellcheck source=scripts/git_lock_guard.sh
  source "$SCRIPT_DIR/git_lock_guard.sh"
  git_clear_stale_locks
fi

EXPECTED_ROOT="${OPENCLAW_SYNC_EXPECTED_ROOT:-/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app}"
EXPECTED_BRANCH="${OPENCLAW_SYNC_BRANCH:-${2:-main}}"
MODE="${1:-status}"

usage() {
  cat <<'EOF'
Usage: scripts/openclaw_safe_sync.sh [status|fetch|pull] [branch]

Modes:
  status  Verify repo root, branch, and working tree state.
  fetch   Perform the status checks, then fetch origin and summarize incoming commits.
  pull    Perform the status checks, fetch origin, summarize incoming commits, and run
          git pull --rebase origin <branch> only when the working tree is clean.
EOF
}

if [[ "$MODE" != "status" && "$MODE" != "fetch" && "$MODE" != "pull" ]]; then
  usage >&2
  exit 64
fi

repo_root="$(git rev-parse --show-toplevel)"
branch="$(git rev-parse --abbrev-ref HEAD)"
status_short="$(git status --short)"

echo "Repo root: $repo_root"
echo "Current branch: $branch"

if [[ "$repo_root" != "$EXPECTED_ROOT" ]]; then
  echo "ERROR: refusing to sync because the current repo root is not the Winston repo." >&2
  echo "Expected: $EXPECTED_ROOT" >&2
  exit 65
fi

if [[ "$branch" != "$EXPECTED_BRANCH" ]]; then
  echo "ERROR: refusing to sync because the current branch is '$branch', not '$EXPECTED_BRANCH'." >&2
  exit 66
fi

if [[ -n "$status_short" ]]; then
  echo "Working tree is dirty:" >&2
  printf '%s\n' "$status_short" >&2
  echo "ERROR: stop before fetch/pull. Commit, stash, or discard local changes first." >&2
  exit 67
fi

echo "Working tree: clean"

if [[ "$MODE" == "status" ]]; then
  echo "Status check complete. Winston repo is clean on $EXPECTED_BRANCH."
  exit 0
fi

before_head="$(git rev-parse HEAD)"

echo "Fetching origin..."
git fetch origin

incoming="$(git log --oneline --decorate "${before_head}..origin/${EXPECTED_BRANCH}" || true)"
incoming_count="$(git rev-list --count "${before_head}..origin/${EXPECTED_BRANCH}")"

if [[ "$incoming_count" == "0" ]]; then
  echo "Incoming commits: none. Local branch is up to date with origin/${EXPECTED_BRANCH}."
else
  echo "Incoming commits: $incoming_count"
  printf '%s\n' "$incoming"
fi

if [[ "$MODE" == "fetch" ]]; then
  echo "Fetch-only check complete."
  exit 0
fi

echo "Pulling latest changes with rebase..."
set +e
pull_output="$(git pull --rebase origin "$EXPECTED_BRANCH" 2>&1)"
pull_exit=$?
set -e
printf '%s\n' "$pull_output"

if [[ $pull_exit -ne 0 ]]; then
  echo "ERROR: git pull --rebase failed." >&2
  conflict_status="$(git status --short || true)"
  if printf '%s\n' "$conflict_status" | rg -q '^(UU|AA|DD|DU|UD|AU|UA) '; then
    echo "Rebase conflict detected. Resolve conflicts manually before retrying." >&2
  fi
  exit 68
fi

after_head="$(git rev-parse HEAD)"

if [[ "$before_head" == "$after_head" ]]; then
  echo "Pull result: already up to date."
  exit 0
fi

echo "Updated from $before_head to $after_head"
echo "Changed files:"
git diff --name-only "$before_head" "$after_head"

restart_notes=()
if git diff --name-only "$before_head" "$after_head" | rg -q '^backend/'; then
  restart_notes+=("backend on port 8000")
fi
if git diff --name-only "$before_head" "$after_head" | rg -q '^repo-c/'; then
  restart_notes+=("repo-c on port 8001")
fi
if git diff --name-only "$before_head" "$after_head" | rg -q '^repo-b/'; then
  restart_notes+=("frontend on port 3001")
fi
if git diff --name-only "$before_head" "$after_head" | rg -q '^(orchestration/|scripts/)'; then
  restart_notes+=("orchestration or sidecar processes")
fi
if git diff --name-only "$before_head" "$after_head" | rg -q '^(supabase/|repo-b/db/schema/)'; then
  restart_notes+=("database migration or schema-dependent services")
fi
if git diff --name-only "$before_head" "$after_head" | rg -q '^excel-addin/'; then
  restart_notes+=("Excel add-in build or reload")
fi

if [[ ${#restart_notes[@]} -eq 0 ]]; then
  echo "Service restart hints: none inferred from changed paths."
else
  echo "Service restart hints:"
  printf -- '- %s\n' "${restart_notes[@]}"
fi

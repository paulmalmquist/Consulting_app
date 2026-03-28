#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# git_lock_guard.sh — Prevent and clean stale git lock files
#
# The autonomous scheduled tasks (sync, deploy, commit, gc) sometimes
# get killed mid-operation (OOM, timeout, session teardown) and leave
# behind .git/*.lock files. The next git invocation then fails with
# "Unable to create ... .lock: File exists" and every subsequent
# session inherits the problem.
#
# Usage:
#   source scripts/git_lock_guard.sh   # import functions
#   git_clear_stale_locks              # clear locks older than 30s
#   git_safe <git-args...>             # run git with auto-retry on lock
#
# Environment:
#   GIT_LOCK_MAX_AGE_SECS  — age threshold for stale locks (default 30)
#   GIT_LOCK_RETRY_WAIT    — seconds to wait before retry  (default 2)
#   GIT_LOCK_MAX_RETRIES   — retry attempts                (default 3)
# ──────────────────────────────────────────────────────────────────
set -uo pipefail

# Locate repo root (works from any subdirectory)
_GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$_GIT_ROOT" ]]; then
  echo "[git_lock_guard] WARNING: not inside a git repo" >&2
fi

GIT_LOCK_MAX_AGE_SECS="${GIT_LOCK_MAX_AGE_SECS:-30}"
GIT_LOCK_RETRY_WAIT="${GIT_LOCK_RETRY_WAIT:-2}"
GIT_LOCK_MAX_RETRIES="${GIT_LOCK_MAX_RETRIES:-3}"

# ── git_clear_stale_locks ────────────────────────────────────────
# Removes .lock files inside .git/ that are older than the threshold.
# Only removes zero-byte locks immediately; non-zero locks must age out.
git_clear_stale_locks() {
  local git_dir="${_GIT_ROOT:-.}/.git"
  [[ -d "$git_dir" ]] || return 0

  local now
  now=$(date +%s)
  local removed=0

  # Known lock file locations
  local lock_paths=(
    "$git_dir/index.lock"
    "$git_dir/HEAD.lock"
    "$git_dir/REBASE_HEAD.lock"
    "$git_dir/MERGE_HEAD.lock"
    "$git_dir/COMMIT_EDITMSG.lock"
    "$git_dir/packed-refs.lock"
    "$git_dir/objects/maintenance.lock"
    "$git_dir/config.lock"
  )

  # Also check refs/heads/*.lock
  if [[ -d "$git_dir/refs/heads" ]]; then
    while IFS= read -r -d '' lf; do
      lock_paths+=("$lf")
    done < <(find "$git_dir/refs" -name "*.lock" -print0 2>/dev/null)
  fi

  for lf in "${lock_paths[@]}"; do
    [[ -f "$lf" ]] || continue

    local file_size file_age_secs file_mtime
    file_size=$(stat -c%s "$lf" 2>/dev/null || stat -f%z "$lf" 2>/dev/null || echo 999)
    file_mtime=$(stat -c%Y "$lf" 2>/dev/null || stat -f%m "$lf" 2>/dev/null || echo "$now")
    file_age_secs=$(( now - file_mtime ))

    # Zero-byte locks are always stale (the process that created them died)
    # Non-zero locks need to be older than the threshold
    if [[ "$file_size" -eq 0 ]] || [[ "$file_age_secs" -ge "$GIT_LOCK_MAX_AGE_SECS" ]]; then
      rm -f "$lf"
      echo "[git_lock_guard] Removed stale lock: ${lf##*/} (age=${file_age_secs}s, size=${file_size}B)" >&2
      removed=$((removed + 1))
    fi
  done

  if [[ "$removed" -gt 0 ]]; then
    echo "[git_lock_guard] Cleared $removed stale lock file(s)" >&2
  fi
  return 0
}

# ── git_safe ─────────────────────────────────────────────────────
# Wrapper: clears stale locks, runs git, and retries on lock errors.
git_safe() {
  git_clear_stale_locks

  local attempt=0
  while true; do
    local output exit_code
    output=$(git "$@" 2>&1)
    exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
      [[ -n "$output" ]] && printf '%s\n' "$output"
      return 0
    fi

    # Check if the failure is a lock error
    if printf '%s\n' "$output" | grep -qi "unable to create.*\.lock\|\.lock.*file exists\|cannot lock ref"; then
      attempt=$((attempt + 1))
      if [[ $attempt -gt $GIT_LOCK_MAX_RETRIES ]]; then
        echo "[git_lock_guard] FAILED after $GIT_LOCK_MAX_RETRIES retries: git $*" >&2
        printf '%s\n' "$output" >&2
        return $exit_code
      fi
      echo "[git_lock_guard] Lock conflict on attempt $attempt, clearing and retrying in ${GIT_LOCK_RETRY_WAIT}s..." >&2
      sleep "$GIT_LOCK_RETRY_WAIT"
      git_clear_stale_locks
      continue
    fi

    # Non-lock error — fail immediately
    printf '%s\n' "$output" >&2
    return $exit_code
  done
}

#!/usr/bin/env bash
# setup-gh-auth.sh — Install gh CLI (if missing) and authenticate using repo-local PAT.
# Idempotent: safe to run multiple times. Runs in ~2s if already set up.
#
# Usage:  source scripts/setup-gh-auth.sh
#    or:  bash scripts/setup-gh-auth.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAT_FILE="$REPO_ROOT/githubpat.txt"
GH_BIN="$HOME/.local/bin/gh"

# ── 1. Check for PAT file ──────────────────────────────────────────
if [[ ! -f "$PAT_FILE" ]]; then
  echo "[setup-gh-auth] ERROR: $PAT_FILE not found. Cannot authenticate."
  exit 1
fi

PAT="$(cat "$PAT_FILE" | tr -d '[:space:]')"
if [[ -z "$PAT" ]]; then
  echo "[setup-gh-auth] ERROR: $PAT_FILE is empty."
  exit 1
fi

# ── 2. Install gh CLI if not present ────────────────────────────────
if [[ -x "$GH_BIN" ]]; then
  echo "[setup-gh-auth] gh already installed: $($GH_BIN --version | head -1)"
else
  echo "[setup-gh-auth] Installing gh CLI..."
  mkdir -p "$HOME/.local/bin"
  ARCH="$(uname -m)"
  [[ "$ARCH" == "aarch64" ]] && ARCH="arm64"
  [[ "$ARCH" == "x86_64" ]] && ARCH="amd64"

  # Get latest version
  GH_VERSION="$(curl -sI https://github.com/cli/cli/releases/latest | grep -i '^location:' | sed 's|.*/v||' | tr -d '[:space:]')"
  if [[ -z "$GH_VERSION" ]]; then
    echo "[setup-gh-auth] ERROR: Could not determine latest gh version."
    exit 1
  fi

  TARBALL="gh_${GH_VERSION}_linux_${ARCH}.tar.gz"
  URL="https://github.com/cli/cli/releases/download/v${GH_VERSION}/${TARBALL}"

  curl -fsSL "$URL" -o "/tmp/gh.tar.gz"
  tar -xzf /tmp/gh.tar.gz -C /tmp
  cp "/tmp/gh_${GH_VERSION}_linux_${ARCH}/bin/gh" "$GH_BIN"
  chmod +x "$GH_BIN"
  rm -rf /tmp/gh.tar.gz "/tmp/gh_${GH_VERSION}_linux_${ARCH}"

  echo "[setup-gh-auth] Installed: $($GH_BIN --version | head -1)"
fi

# ── 3. Authenticate ────────────────────────────────────────────────
echo "$PAT" | "$GH_BIN" auth login --with-token 2>/dev/null
"$GH_BIN" auth setup-git 2>/dev/null

# ── 4. Verify ──────────────────────────────────────────────────────
if "$GH_BIN" auth status &>/dev/null; then
  ACCOUNT="$("$GH_BIN" auth status 2>&1 | grep 'account' | head -1 | sed 's/.*account //' | sed 's/ .*//')"
  echo "[setup-gh-auth] Authenticated as $ACCOUNT. git push ready."
else
  echo "[setup-gh-auth] ERROR: Authentication failed. Check your PAT."
  exit 1
fi

# Export PATH so gh is available for the rest of the session
export PATH="$HOME/.local/bin:$PATH"

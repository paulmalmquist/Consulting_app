#!/usr/bin/env bash
set -euo pipefail

# Local dev entrypoint: starts backend(s) and frontend.
# Set BACKEND_PORT=0 to skip Business OS backend.
# Set DEMO_LAB_PORT=0 to skip Demo Lab backend.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FRONTEND_PORT="${FRONTEND_PORT:-3001}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
DEMO_LAB_PORT="${DEMO_LAB_PORT:-8001}"

# Local AI sidecar integration is optional; backend behavior depends on AI_MODE.
AI_MODE="${AI_MODE:-local}" # off | local
AI_SIDECAR_URL="${AI_SIDECAR_URL:-http://127.0.0.1:7337}"

_have() { command -v "$1" >/dev/null 2>&1; }

_port_in_use() {
  local port="$1"
  if _have lsof; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

PIDS=()

cleanup() {
  for pid in "${PIDS[@]}"; do
    if kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT

if ! _have python3; then
  echo "ERROR: python3 not found on PATH." >&2
  exit 1
fi
if ! _have npm; then
  echo "ERROR: npm not found on PATH." >&2
  exit 1
fi

# ── Business OS Backend ───────────────────────────────────────────
if [[ "${BACKEND_PORT}" != "0" ]]; then
  if _port_in_use "${BACKEND_PORT}"; then
    echo "ERROR: BACKEND_PORT ${BACKEND_PORT} is already in use." >&2
    exit 1
  fi
  echo "Business OS Backend: http://${BACKEND_HOST}:${BACKEND_PORT}"
  (
    cd "${ROOT_DIR}/backend"
    if [[ ! -x ".venv/bin/python" ]]; then
      echo "backend/.venv not found. Creating venv and installing deps..."
      python3 -m venv .venv
      # shellcheck disable=SC1091
      source .venv/bin/activate
      python -m pip install --upgrade pip >/dev/null
      pip install -r requirements.txt
    else
      # shellcheck disable=SC1091
      source .venv/bin/activate
    fi

    export AI_MODE="${AI_MODE}"
    export AI_SIDECAR_URL="${AI_SIDECAR_URL}"
    uvicorn app.main:app --reload --host "${BACKEND_HOST}" --port "${BACKEND_PORT}"
  ) &
  PIDS+=($!)
fi

# ── Demo Lab Backend ─────────────────────────────────────────────
if [[ "${DEMO_LAB_PORT}" != "0" ]]; then
  if _port_in_use "${DEMO_LAB_PORT}"; then
    echo "ERROR: DEMO_LAB_PORT ${DEMO_LAB_PORT} is already in use." >&2
    exit 1
  fi
  echo "Demo Lab Backend:    http://${BACKEND_HOST}:${DEMO_LAB_PORT}"
  (
    cd "${ROOT_DIR}/repo-c"
    if [[ ! -x ".venv/bin/python" ]]; then
      echo "repo-c/.venv not found. Creating venv and installing deps..."
      python3 -m venv .venv
      # shellcheck disable=SC1091
      source .venv/bin/activate
      python -m pip install --upgrade pip >/dev/null
      pip install -r requirements.txt
    else
      # shellcheck disable=SC1091
      source .venv/bin/activate
    fi

    uvicorn app.main:app --reload --host "${BACKEND_HOST}" --port "${DEMO_LAB_PORT}"
  ) &
  PIDS+=($!)
fi

# ── Frontend ─────────────────────────────────────────────────────
if _port_in_use "${FRONTEND_PORT}"; then
  echo "ERROR: FRONTEND_PORT ${FRONTEND_PORT} is already in use." >&2
  exit 1
fi
echo "Frontend:            http://127.0.0.1:${FRONTEND_PORT}"
echo "AI_MODE=${AI_MODE}"

(
  cd "${ROOT_DIR}/repo-b"
  if [[ ! -d "node_modules" ]]; then
    if [[ -f "package-lock.json" ]]; then
      npm ci
    else
      npm install
    fi
  fi

  export NEXT_PUBLIC_AI_MODE="${NEXT_PUBLIC_AI_MODE:-local}"
  export NEXT_PUBLIC_BOS_API_BASE_URL="${NEXT_PUBLIC_BOS_API_BASE_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}}"
  export NEXT_PUBLIC_DEMO_API_BASE_URL="${NEXT_PUBLIC_DEMO_API_BASE_URL:-http://${BACKEND_HOST}:${DEMO_LAB_PORT}}"
  # Keep legacy var for backwards compat
  export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}}"
  PORT="${FRONTEND_PORT}" npm run dev
) &
PIDS+=($!)

wait "${PIDS[@]}"

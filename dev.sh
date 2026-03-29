#!/usr/bin/env bash
set -euo pipefail

# Local dev entrypoint: starts the canonical backend and frontend.
# Set BACKEND_PORT=0 to skip the backend.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FRONTEND_PORT="${FRONTEND_PORT:-3001}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

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

if [[ "${BACKEND_PORT}" != "0" ]]; then
  if _port_in_use "${BACKEND_PORT}"; then
    echo "ERROR: BACKEND_PORT ${BACKEND_PORT} is already in use." >&2
    exit 1
  fi
  echo "Canonical Backend:   http://${BACKEND_HOST}:${BACKEND_PORT}"
  (
    cd "${ROOT_DIR}/backend"
    if [[ ! -x ".venv/bin/python" ]]; then
      echo "backend/.venv not found. Creating venv and installing deps..."
      python3 -m venv .venv
      source .venv/bin/activate
      python -m pip install --upgrade pip >/dev/null
      pip install -r requirements.txt
    else
      source .venv/bin/activate
    fi

    uvicorn app.main:app --reload --host "${BACKEND_HOST}" --port "${BACKEND_PORT}"
  ) &
  PIDS+=($!)
fi

if _port_in_use "${FRONTEND_PORT}"; then
  echo "ERROR: FRONTEND_PORT ${FRONTEND_PORT} is already in use." >&2
  exit 1
fi
echo "Frontend:            http://127.0.0.1:${FRONTEND_PORT}"

(
  cd "${ROOT_DIR}/repo-b"
  if [[ ! -d "node_modules" ]]; then
    if [[ -f "package-lock.json" ]]; then
      npm ci
    else
      npm install
    fi
  fi

  local_backend="http://${BACKEND_HOST}:${BACKEND_PORT}"
  export BOS_API_ORIGIN="${BOS_API_ORIGIN:-${local_backend}}"
  export DEMO_API_ORIGIN="${DEMO_API_ORIGIN:-${BOS_API_ORIGIN}}"
  export NEXT_PUBLIC_BOS_API_BASE_URL="${NEXT_PUBLIC_BOS_API_BASE_URL:-${local_backend}}"
  export NEXT_PUBLIC_DEMO_API_BASE_URL="${NEXT_PUBLIC_DEMO_API_BASE_URL:-${NEXT_PUBLIC_BOS_API_BASE_URL}}"
  export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-${NEXT_PUBLIC_BOS_API_BASE_URL}}"
  PORT="${FRONTEND_PORT}" npm run dev
) &
PIDS+=($!)

wait "${PIDS[@]}"

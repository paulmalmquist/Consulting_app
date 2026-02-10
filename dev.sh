#!/usr/bin/env bash
set -euo pipefail

# Local dev entrypoint: starts backend (FastAPI) and frontend (Next.js).
# Defaults avoid port 3000 (often in use).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FRONTEND_PORT="${FRONTEND_PORT:-3001}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

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

if _port_in_use "${BACKEND_PORT}"; then
  echo "ERROR: BACKEND_PORT ${BACKEND_PORT} is already in use." >&2
  exit 1
fi

if _port_in_use "${FRONTEND_PORT}"; then
  echo "ERROR: FRONTEND_PORT ${FRONTEND_PORT} is already in use." >&2
  exit 1
fi

echo "Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo "Backend:   http://${BACKEND_HOST}:${BACKEND_PORT}"
echo "AI_MODE=${AI_MODE}"
echo "AI_SIDECAR_URL=${AI_SIDECAR_URL}"

cleanup() {
  if [[ -n "${BACK_PID:-}" ]] && kill -0 "${BACK_PID}" 2>/dev/null; then
    kill "${BACK_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONT_PID:-}" ]] && kill -0 "${FRONT_PID}" 2>/dev/null; then
    kill "${FRONT_PID}" >/dev/null 2>&1 || true
  fi
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

# Backend
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
BACK_PID=$!

# Frontend
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
  export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}}"
  PORT="${FRONTEND_PORT}" npm run dev
) &
FRONT_PID=$!

wait "${BACK_PID}" "${FRONT_PID}"


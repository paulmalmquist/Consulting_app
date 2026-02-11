#!/usr/bin/env bash
set -euo pipefail

# Starts codex app-server, local AI sidecar, backend, and frontend for local dev.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FRONTEND_PORT="${FRONTEND_PORT:-3001}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

export AI_MODE="${AI_MODE:-local}"
export AI_SIDECAR_URL="${AI_SIDECAR_URL:-http://127.0.0.1:7337}"

CODEX_HOST="${CODEX_HOST:-127.0.0.1}"
CODEX_PORT="${CODEX_PORT:-7331}"
CODEX_URL="http://${CODEX_HOST}:${CODEX_PORT}"

echo "Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo "Backend:   http://${BACKEND_HOST}:${BACKEND_PORT}"
echo "AI_MODE=${AI_MODE}"
echo "AI_SIDECAR_URL=${AI_SIDECAR_URL}"
echo "CODEX app-server: ${CODEX_URL}"

cleanup() {
  trap - EXIT INT TERM
  local pids=("${FRONT_PID:-}" "${BACK_PID:-}" "${SIDECAR_PID:-}" "${CODEX_PID:-}")
  for pid in "${pids[@]}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" >/dev/null 2>&1 || true
    fi
  done
  for pid in "${pids[@]}"; do
    if [[ -n "${pid}" ]]; then
      wait "${pid}" 2>/dev/null || true
    fi
  done
}

wait_for_http() {
  local url="$1"
  local timeout_sec="${2:-15}"
  local start
  start="$(date +%s)"
  until curl -fsS "${url}" >/dev/null 2>&1; do
    if (( "$(date +%s)" - start > timeout_sec )); then
      return 1
    fi
    sleep 0.4
  done
}

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for health checks." >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI is required on PATH." >&2
  exit 1
fi

trap cleanup EXIT INT TERM

# Codex app-server
(
  cd "${ROOT_DIR}"
  codex app-server --host "${CODEX_HOST}" --port "${CODEX_PORT}"
) &
CODEX_PID=$!

if ! wait_for_http "${CODEX_URL}/health" 20; then
  echo "codex app-server failed health check at ${CODEX_URL}/health" >&2
  exit 1
fi
echo "codex app-server is healthy."

# AI sidecar
(
  cd "${ROOT_DIR}"
  scripts/ai_start_sidecar.sh
) &
SIDECAR_PID=$!

if ! wait_for_http "${AI_SIDECAR_URL}/health" 20; then
  echo "AI sidecar failed health check at ${AI_SIDECAR_URL}/health" >&2
  exit 1
fi
echo "AI sidecar is healthy."

# Backend
(
  cd "${ROOT_DIR}/backend"
  if [[ ! -x ".venv/bin/python" ]]; then
    echo "backend/.venv not found. Create it first (see backend/README.md)." >&2
    exit 1
  fi
  source ".venv/bin/activate"
  export AI_MODE="${AI_MODE}"
  export AI_SIDECAR_URL="${AI_SIDECAR_URL}"
  uvicorn app.main:app --reload --host "${BACKEND_HOST}" --port "${BACKEND_PORT}"
) &
BACK_PID=$!

if ! wait_for_http "http://${BACKEND_HOST}:${BACKEND_PORT}/health" 20; then
  echo "Backend failed health check at http://${BACKEND_HOST}:${BACKEND_PORT}/health" >&2
  exit 1
fi
echo "Backend is healthy."

# Frontend
(
  cd "${ROOT_DIR}/repo-b"
  if [[ ! -d "node_modules" ]]; then
    npm install
  fi
  export NEXT_PUBLIC_AI_MODE="${NEXT_PUBLIC_AI_MODE:-local}"
  export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}}"
  export NEXT_PUBLIC_BOS_API_BASE_URL="${NEXT_PUBLIC_BOS_API_BASE_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}}"
  export AI_MODE="${AI_MODE}"
  export AI_SIDECAR_URL="${AI_SIDECAR_URL}"
  PORT="${FRONTEND_PORT}" npm run dev
) &
FRONT_PID=$!

wait -n "${CODEX_PID}" "${SIDECAR_PID}" "${BACK_PID}" "${FRONT_PID}"
echo "One service exited; shutting down remaining processes..."
cleanup

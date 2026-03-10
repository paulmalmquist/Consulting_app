#!/usr/bin/env bash
set -euo pipefail

# Starts backend and frontend for local dev.
# Defaults avoid port 3000 (often in use).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FRONTEND_PORT="${FRONTEND_PORT:-3001}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

echo "Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo "Backend:   http://${BACKEND_HOST}:${BACKEND_PORT}"

cleanup() {
  if [[ -n "${BACK_PID:-}" ]] && kill -0 "${BACK_PID}" 2>/dev/null; then
    kill "${BACK_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONT_PID:-}" ]] && kill -0 "${FRONT_PID}" 2>/dev/null; then
    kill "${FRONT_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Backend
(
  cd "${ROOT_DIR}/backend"
  if [[ ! -x ".venv/bin/python" ]]; then
    echo "backend/.venv not found. Create it first (see backend/README.md)." >&2
    exit 1
  fi
  source ".venv/bin/activate"
  uvicorn app.main:app --reload --host "${BACKEND_HOST}" --port "${BACKEND_PORT}"
) &
BACK_PID=$!

# Frontend
(
  cd "${ROOT_DIR}/repo-b"
  if [[ ! -d "node_modules" ]]; then
    npm install
  fi
  export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}}"
  PORT="${FRONTEND_PORT}" npm run dev
) &
FRONT_PID=$!

wait "${BACK_PID}" "${FRONT_PID}"

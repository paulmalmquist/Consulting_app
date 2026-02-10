#!/usr/bin/env bash
set -euo pipefail

HOST="${AI_SIDECAR_HOST:-127.0.0.1}"
PORT="${AI_SIDECAR_PORT:-7337}"

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found on PATH."
  echo "Tip: ensure the VS Code Codex extension installed its CLI, or install Codex CLI."
  exit 1
fi

PYTHON=""
for c in python3.11 python3.10 python3; do
  if command -v "${c}" >/dev/null 2>&1; then
    PYTHON="${c}"
    break
  fi
done

if [[ -z "${PYTHON}" ]]; then
  echo "ERROR: no usable python found (need python3.10+)."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export AI_SIDECAR_HOST="${HOST}"
export AI_SIDECAR_PORT="${PORT}"

echo "Starting local Codex sidecar on ${HOST}:${PORT} ..."

VENV_DIR="${AI_SIDECAR_VENV_DIR:-${REPO_ROOT}/.venv_ai_sidecar}"

if [[ -x "${VENV_DIR}/bin/python" ]]; then
  # Ensure venv python is modern enough for this codebase.
  VENV_OK="$("${VENV_DIR}/bin/python" -c 'import sys; print(int(sys.version_info >= (3,10)))' 2>/dev/null || echo 0)"
  if [[ "${VENV_OK}" != "1" ]]; then
    echo "Existing sidecar venv uses an older Python; recreating ${VENV_DIR} ..."
    rm -rf "${VENV_DIR}"
  fi
fi

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  echo "Creating sidecar venv at ${VENV_DIR} ..."
  "${PYTHON}" -m venv "${VENV_DIR}"
  "${VENV_DIR}/bin/python" -m pip install --upgrade pip >/dev/null
  "${VENV_DIR}/bin/python" -m pip install fastapi uvicorn pydantic >/dev/null
fi

exec "${VENV_DIR}/bin/python" "${REPO_ROOT}/scripts/ai_sidecar.py"

#!/usr/bin/env bash
# MCP Server Runner — activates backend venv and starts the stdio server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

# ── Check venv ──────────────────────────────────────────────────────
if [[ -d "${BACKEND_DIR}/.venv" ]]; then
  source "${BACKEND_DIR}/.venv/bin/activate"
elif [[ -d "${BACKEND_DIR}/venv" ]]; then
  source "${BACKEND_DIR}/venv/bin/activate"
else
  echo "ERROR: No Python venv found in ${BACKEND_DIR}/.venv or ${BACKEND_DIR}/venv" >&2
  echo "Run: python3 -m venv ${BACKEND_DIR}/.venv && ${BACKEND_DIR}/.venv/bin/pip install -r ${BACKEND_DIR}/requirements.txt" >&2
  exit 1
fi

# ── Verify key deps ────────────────────────────────────────────────
python -c "import fastapi, psycopg, pydantic" 2>/dev/null || {
  echo "ERROR: Missing Python dependencies. Run: pip install -r ${BACKEND_DIR}/requirements.txt" >&2
  exit 1
}

# ── MCP token bootstrap (local CLI convenience) ─────────────────────
if [[ -z "${MCP_API_TOKEN:-}" ]]; then
  export MCP_API_TOKEN="local-dev-token"
  echo "WARN: MCP_API_TOKEN not set; using local default token." >&2
fi

# ── Start MCP server in stdio mode ──────────────────────────────────
cd "${BACKEND_DIR}"
exec python -m app.mcp.server

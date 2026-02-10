#!/usr/bin/env bash
set -euo pipefail

URL="${AI_SIDECAR_URL:-http://127.0.0.1:7337}"

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl not found."
  exit 1
fi

echo "Checking sidecar health at ${URL}/health"
curl -fsS "${URL}/health" | sed -n '1,120p'


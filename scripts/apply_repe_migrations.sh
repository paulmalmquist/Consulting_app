#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f backend/.env ]]; then
    set -a
    source backend/.env
    set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "Applying REPE core schema and context bindings..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f repo-b/db/schema/265_repe_object_model.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f repo-b/db/schema/266_repe_env_business_binding.sql

echo "Done. Verify with:"
echo "  curl -s http://127.0.0.1:8000/api/repe/health"

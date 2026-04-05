#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${DB_SCHEMA_GATE_IMAGE:-postgis/postgis:16-3.5}"
PLATFORM="${DB_SCHEMA_GATE_PLATFORM:-linux/amd64}"
CONTAINER_NAME="${DB_SCHEMA_GATE_CONTAINER_NAME:-winston-db-schema-gate}"
PORT="${DB_SCHEMA_GATE_PORT:-5432}"
DB_NAME="${DB_SCHEMA_GATE_DB:-app}"
DB_USER="${DB_SCHEMA_GATE_USER:-postgres}"
DB_PASSWORD="${DB_SCHEMA_GATE_PASSWORD:-postgres}"
DATABASE_URL="${DATABASE_URL:-postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}}"
export DATABASE_URL

cleanup() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not on PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: docker daemon is not available."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is required for local schema gate checks."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is required for local schema gate checks."
  exit 1
fi

if [ ! -d "${ROOT_DIR}/repo-b/node_modules" ]; then
  echo "ERROR: repo-b/node_modules is missing. Run 'cd repo-b && npm ci' first."
  exit 1
fi

trap cleanup EXIT
cleanup

echo "Starting local DB Schema Gate container '${CONTAINER_NAME}'..."
docker run -d \
  --platform "${PLATFORM}" \
  --name "${CONTAINER_NAME}" \
  -e POSTGRES_DB="${DB_NAME}" \
  -e POSTGRES_USER="${DB_USER}" \
  -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
  -p "${PORT}:5432" \
  --health-cmd "pg_isready -U ${DB_USER} -d ${DB_NAME}" \
  --health-interval 10s \
  --health-timeout 5s \
  --health-retries 5 \
  "${IMAGE}" >/dev/null

echo "Waiting for Postgres healthcheck..."
for _ in {1..20}; do
  health_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "${CONTAINER_NAME}")"
  if [ "${health_status}" = "healthy" ]; then
    break
  fi
  sleep 2
done

health_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "${CONTAINER_NAME}")"
if [ "${health_status}" != "healthy" ]; then
  echo "ERROR: Postgres container did not become healthy."
  docker logs "${CONTAINER_NAME}" || true
  exit 1
fi

echo "Installing pgvector extension in container..."
docker exec "${CONTAINER_NAME}" bash -lc \
  "apt-get update -qq && apt-get install -y -qq postgresql-16-pgvector > /dev/null 2>&1 || true"
PGPASSWORD="${DB_PASSWORD}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" \
  -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null || true

echo "Applying schema bundle..."
(
  cd "${ROOT_DIR}"
  make db:migrate
)

echo "Re-applying schema bundle for idempotency..."
(
  cd "${ROOT_DIR}"
  make db:migrate
)

echo "Verifying schema + seed baseline..."
(
  cd "${ROOT_DIR}"
  make db:verify
)

echo "Running backend schema contract check..."
if [ -x "${ROOT_DIR}/backend/.venv/bin/python" ]; then
  (
    cd "${ROOT_DIR}/backend"
    .venv/bin/python scripts/check_winston_schema.py
  )
else
  (
    cd "${ROOT_DIR}/backend"
    python3 scripts/check_winston_schema.py
  )
fi

echo "Local DB Schema Gate passed."

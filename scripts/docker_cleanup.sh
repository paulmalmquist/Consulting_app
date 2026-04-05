#!/usr/bin/env bash
# docker_cleanup.sh — Prevent disk bloat from Docker artifacts on persistent machines.
#
# Usage:
#   ./scripts/docker_cleanup.sh              # Standard pre-deploy cleanup
#   ./scripts/docker_cleanup.sh --post       # Post-deploy deep cleanup (after health check passes)
#   ./scripts/docker_cleanup.sh --deep       # Periodic deep cleanup (removes unused volumes too)
#   ./scripts/docker_cleanup.sh --report     # Report disk usage only, no cleanup
#
# Guardrails:
#   - Never removes the currently running container/image
#   - Never removes named volumes unless --deep is passed
#   - Captures before/after disk usage receipt

set -euo pipefail

MODE="${1:-pre}"
RECEIPT_DIR="${RECEIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/artifacts/docker-cleanup}"
mkdir -p "${RECEIPT_DIR}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RECEIPT_FILE="${RECEIPT_DIR}/${TIMESTAMP}.json"

# ── Helpers ─────────────────────────────────────────────────────────

capture_usage() {
  local label="$1"
  echo "--- Docker disk usage (${label}) ---"
  docker system df 2>/dev/null || echo "(docker not available)"
  echo ""
  # Machine-readable totals
  IMAGE_COUNT=$(docker images -q 2>/dev/null | wc -l | tr -d ' ')
  DANGLING_COUNT=$(docker images -f "dangling=true" -q 2>/dev/null | wc -l | tr -d ' ')
  CONTAINER_COUNT=$(docker ps -a -q 2>/dev/null | wc -l | tr -d ' ')
  VOLUME_COUNT=$(docker volume ls -q 2>/dev/null | wc -l | tr -d ' ')
  TOTAL_SIZE=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "unknown")
  echo "${label}_images=${IMAGE_COUNT} dangling=${DANGLING_COUNT} containers=${CONTAINER_COUNT} volumes=${VOLUME_COUNT} total=${TOTAL_SIZE}"
}

write_receipt() {
  local before_images="$1" before_dangling="$2" after_images="$3" after_dangling="$4" mode="$5"
  cat > "${RECEIPT_FILE}" <<RECEIPT_EOF
{
  "timestamp": "${TIMESTAMP}",
  "mode": "${mode}",
  "before": {
    "images": ${before_images},
    "dangling": ${before_dangling}
  },
  "after": {
    "images": ${after_images},
    "dangling": ${after_dangling}
  },
  "reclaimed_images": $((before_images - after_images)),
  "reclaimed_dangling": $((before_dangling - after_dangling))
}
RECEIPT_EOF
  echo "Receipt saved: ${RECEIPT_FILE}"
}

# ── Preflight ───────────────────────────────────────────────────────

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: docker not installed. No cleanup needed."
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "SKIP: docker daemon not running. No cleanup needed."
  exit 0
fi

# ── Report mode ─────────────────────────────────────────────────────

if [ "${MODE}" = "--report" ]; then
  capture_usage "current"
  exit 0
fi

# ── Capture before state ────────────────────────────────────────────

BEFORE_IMAGES=$(docker images -q 2>/dev/null | wc -l | tr -d ' ')
BEFORE_DANGLING=$(docker images -f "dangling=true" -q 2>/dev/null | wc -l | tr -d ' ')

echo "=== Docker Cleanup (mode: ${MODE}) ==="
capture_usage "before"

# ── Pre-deploy cleanup ──────────────────────────────────────────────

if [ "${MODE}" = "pre" ] || [ "${MODE}" = "--pre" ]; then
  echo ""
  echo "Running pre-deploy cleanup (safe)..."
  echo "  Pruning dangling images..."
  docker image prune -f 2>/dev/null || true
  echo "  Pruning stopped containers..."
  docker container prune -f 2>/dev/null || true
  echo "  Pruning build cache..."
  docker builder prune -f 2>/dev/null || true
fi

# ── Post-deploy cleanup ────────────────────────────────────────────

if [ "${MODE}" = "--post" ]; then
  echo ""
  echo "Running post-deploy cleanup (deeper — unused images removed)..."
  echo "  Pruning ALL unused images (not just dangling)..."
  docker image prune -a -f 2>/dev/null || true
  echo "  Pruning ALL build cache..."
  docker builder prune -a -f 2>/dev/null || true
fi

# ── Deep periodic cleanup ──────────────────────────────────────────

if [ "${MODE}" = "--deep" ]; then
  echo ""
  echo "Running deep periodic cleanup (includes volumes)..."
  echo "  WARNING: This removes unused named volumes."
  docker system prune -a -f --volumes 2>/dev/null || true
fi

# ── Capture after state ─────────────────────────────────────────────

echo ""
capture_usage "after"

AFTER_IMAGES=$(docker images -q 2>/dev/null | wc -l | tr -d ' ')
AFTER_DANGLING=$(docker images -f "dangling=true" -q 2>/dev/null | wc -l | tr -d ' ')

RECLAIMED_IMAGES=$((BEFORE_IMAGES - AFTER_IMAGES))
RECLAIMED_DANGLING=$((BEFORE_DANGLING - AFTER_DANGLING))

echo ""
echo "=== Cleanup Summary ==="
echo "  Images removed: ${RECLAIMED_IMAGES}"
echo "  Dangling layers removed: ${RECLAIMED_DANGLING}"

write_receipt "${BEFORE_IMAGES}" "${BEFORE_DANGLING}" "${AFTER_IMAGES}" "${AFTER_DANGLING}" "${MODE}"

echo "=== Docker Cleanup Complete ==="

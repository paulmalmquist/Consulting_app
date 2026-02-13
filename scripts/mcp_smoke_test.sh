#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3001}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1" >&2
    exit 1
  }
}

need curl
need jq

json_post() {
  local path="$1"
  local body="$2"
  curl -sS -X POST "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    -d "${body}"
}

echo "[1/5] Plan parsing for 'name all environments'"
PLAN_PAYLOAD="$(json_post '/api/commands/plan' '{"message":"name all environments","context":{"route":"/lab/environments"}}')"

echo "$PLAN_PAYLOAD" | jq -e '.plan.intent.domain == "lab" and .plan.intent.resource == "environments" and .plan.intent.action == "list"' >/dev/null
PLAN_ID="$(echo "$PLAN_PAYLOAD" | jq -r '.plan_id')"
echo "ok: plan_id=${PLAN_ID}"

echo "[2/5] Execute blocked without confirmation token"
HTTP_STATUS="$(curl -sS -o /tmp/bm_mcp_execute_err.json -w '%{http_code}' -X POST "${BASE_URL}/api/commands/execute" -H 'Content-Type: application/json' -d "{\"plan_id\":\"${PLAN_ID}\"}")"
if [[ "$HTTP_STATUS" != "400" && "$HTTP_STATUS" != "403" ]]; then
  echo "expected 400/403, got ${HTTP_STATUS}" >&2
  cat /tmp/bm_mcp_execute_err.json >&2
  exit 1
fi
echo "ok: server-side gate enforced (${HTTP_STATUS})"

echo "[3/5] Confirm + execute read-only plan"
CONFIRM_PAYLOAD="$(json_post '/api/commands/confirm' "{\"plan_id\":\"${PLAN_ID}\"}")"
TOKEN="$(echo "$CONFIRM_PAYLOAD" | jq -r '.confirm_token')"
RUN_PAYLOAD="$(json_post '/api/commands/execute' "{\"plan_id\":\"${PLAN_ID}\",\"confirm_token\":\"${TOKEN}\"}")"
RUN_ID="$(echo "$RUN_PAYLOAD" | jq -r '.run_id')"

for _ in {1..30}; do
  RUN_STATUS_PAYLOAD="$(curl -sS "${BASE_URL}/api/commands/runs/${RUN_ID}")"
  STATUS="$(echo "$RUN_STATUS_PAYLOAD" | jq -r '.run.status')"
  if [[ "$STATUS" == "completed" ]]; then
    echo "ok: run completed"
    break
  fi
  if [[ "$STATUS" == "failed" || "$STATUS" == "cancelled" ]]; then
    echo "run ended unexpectedly: $STATUS" >&2
    echo "$RUN_STATUS_PAYLOAD" | jq . >&2
    exit 1
  fi
  sleep 0.4
done

echo "[4/5] High-risk plan classification"
DELETE_PLAN="$(json_post '/api/commands/plan' '{"message":"delete environment 00000000-0000-4000-8000-000000000001","context":{"route":"/lab/environments"}}')"
DELETE_PLAN_ID="$(echo "$DELETE_PLAN" | jq -r '.plan_id')"
echo "$DELETE_PLAN" | jq -e '.risk == "high" and .requires_double_confirmation == true' >/dev/null
echo "ok: high risk recognized"

echo "[5/5] High-risk double-confirm enforcement"
HTTP_STATUS="$(curl -sS -o /tmp/bm_mcp_confirm_err.json -w '%{http_code}' -X POST "${BASE_URL}/api/commands/confirm" -H 'Content-Type: application/json' -d "{\"plan_id\":\"${DELETE_PLAN_ID}\"}")"
if [[ "$HTTP_STATUS" != "400" ]]; then
  echo "expected 400, got ${HTTP_STATUS}" >&2
  cat /tmp/bm_mcp_confirm_err.json >&2
  exit 1
fi
echo "ok: double-confirm phrase required"

echo "smoke test passed"

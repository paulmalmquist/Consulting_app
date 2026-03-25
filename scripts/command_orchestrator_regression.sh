#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3001}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing $1" >&2; exit 1; }; }
need curl
need jq

post_json() {
  local path="$1"
  local body="$2"
  curl -sS -X POST "${BASE_URL}${path}" -H 'Content-Type: application/json' -d "$body"
}

get_envs() {
  curl -sS "${BASE_URL}/api/v1/environments"
}

delete_env_by_id() {
  local env_id="$1"
  curl -sS -X DELETE "${BASE_URL}/api/v1/environments/${env_id}" >/dev/null
}

wait_run_done() {
  local run_id="$1"
  for _ in {1..40}; do
    local status
    status="$(curl -sS "${BASE_URL}/api/commands/runs/${run_id}" | jq -r '.run.status')"
    case "$status" in
      completed|failed|cancelled|needs_clarification|blocked)
        echo "$status"
        return 0
        ;;
    esac
    sleep 0.25
  done
  echo "timeout"
}

cleanup_by_exact_name() {
  local name="$1"
  get_envs | jq -r --arg n "$name" '.environments[] | select(.client_name == $n) | .env_id' | while read -r env_id; do
    [[ -n "$env_id" ]] && delete_env_by_id "$env_id"
  done
}

echo "[T1] Unit intent mapping: delete the acme health environment"
PLAN1="$(post_json '/api/commands/plan' '{"message":"delete the acme health environment","context":{"route":"/lab/environments"}}')"
echo "$PLAN1" | jq -e '.plan.intent.domain == "lab" and .plan.intent.action == "delete" and .plan.risk == "high"' >/dev/null
echo "ok"

echo "[T2] Unit name resolution: Acme Health -> envId"
cleanup_by_exact_name "Acme Health"
cleanup_by_exact_name "Acme Health - Copy"
ACME_CREATE="$(post_json '/api/v1/environments' '{"client_name":"Acme Health","industry":"healthcare","industry_type":"healthcare"}')"
ACME_ID="$(echo "$ACME_CREATE" | jq -r '.env_id')"
PLAN2="$(post_json '/api/commands/plan' '{"message":"delete the acme health environment","context":{"route":"/lab/environments"}}')"
echo "$PLAN2" | jq -e --arg id "$ACME_ID" '.plan.target.envId == $id and .plan.clarification.needed == false' >/dev/null || {
  echo "$PLAN2" | jq . >&2
  exit 1
}
echo "ok"

echo "[T3] Integration delete flow: create -> plan -> confirm -> execute -> verify gone"
TMP_NAME="tmp-delete-test-$(date +%s)"
TMP_CREATE="$(post_json '/api/v1/environments' "{\"client_name\":\"${TMP_NAME}\",\"industry\":\"website\",\"industry_type\":\"website\"}")"
TMP_ID="$(echo "$TMP_CREATE" | jq -r '.env_id')"
PLAN3="$(post_json '/api/commands/plan' "{\"message\":\"delete the ${TMP_NAME} environment\",\"context\":{\"route\":\"/lab/environments\"}}")"
PLAN3_ID="$(echo "$PLAN3" | jq -r '.plan_id')"
CONFIRM3="$(post_json '/api/commands/confirm' "{\"plan_id\":\"${PLAN3_ID}\",\"confirmation_text\":\"DELETE\"}")"
TOKEN3="$(echo "$CONFIRM3" | jq -r '.confirm_token')"
RUN3="$(post_json '/api/commands/execute' "{\"plan_id\":\"${PLAN3_ID}\",\"confirm_token\":\"${TOKEN3}\"}")"
RUN3_ID="$(echo "$RUN3" | jq -r '.run_id')"
STATUS3="$(wait_run_done "$RUN3_ID")"
[[ "$STATUS3" == "completed" ]]
GET3_CODE="$(curl -sS -o /tmp/env_get3.json -w '%{http_code}' "${BASE_URL}/api/v1/environments/${TMP_ID}")"
[[ "$GET3_CODE" == "404" ]]
get_envs | jq -e --arg id "$TMP_ID" '([.environments[] | .env_id] | index($id)) == null' >/dev/null
echo "ok"

echo "[T4] Negative ambiguous resolution"
cleanup_by_exact_name "Acme Health"
cleanup_by_exact_name "Acme Health - Copy"
A1="$(post_json '/api/v1/environments' '{"client_name":"Acme Health","industry":"healthcare","industry_type":"healthcare"}')"
A2="$(post_json '/api/v1/environments' '{"client_name":"Acme Health - Copy","industry":"healthcare","industry_type":"healthcare"}')"
PLAN4="$(post_json '/api/commands/plan' '{"message":"delete the acme health environment","context":{"route":"/lab/environments"}}')"
echo "$PLAN4" | jq -e '.plan.clarification.needed == true and (.plan.clarification.options | length) >= 2' >/dev/null
echo "ok"

# cleanup
cleanup_by_exact_name "Acme Health"
cleanup_by_exact_name "Acme Health - Copy"
cleanup_by_exact_name "$TMP_NAME"

echo "All regression tests passed"

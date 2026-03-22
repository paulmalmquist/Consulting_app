#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8000}"
OUT_ROOT="${OUT_ROOT:-/tmp/underwriting}"

BUSINESS_ID=""
PROPERTY_FILE=""
RESEARCH_FILE=""
SCENARIOS_FILE=""
OUT_DIR=""

usage() {
  cat <<EOF
Usage:
  scripts/underwriting_run.sh \\
    --business-id <uuid> \\
    --property-file <path.json> \\
    --research-file <path.json> \\
    [--scenarios-file <path.json>] \\
    [--api-base-url http://127.0.0.1:8000] \\
    [--out-dir /tmp/underwriting]

Notes:
  - property-file is the create-run payload (minus business_id; this script injects it).
  - research-file must follow the underwriting research contract.
  - scenarios-file shape: {"include_defaults":true,"custom_scenarios":[...]}.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//'
}

http_post() {
  local path="$1"
  local body="$2"
  local response
  response=$(curl -sS -X POST "${API_BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    -d "$body")
  echo "$response"
}

http_get() {
  local path="$1"
  curl -sS "${API_BASE_URL}${path}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --business-id)
      BUSINESS_ID="${2:-}"
      shift 2
      ;;
    --property-file)
      PROPERTY_FILE="${2:-}"
      shift 2
      ;;
    --research-file)
      RESEARCH_FILE="${2:-}"
      shift 2
      ;;
    --scenarios-file)
      SCENARIOS_FILE="${2:-}"
      shift 2
      ;;
    --api-base-url)
      API_BASE_URL="${2:-}"
      shift 2
      ;;
    --out-dir)
      OUT_ROOT="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown arg: $1"
      ;;
  esac
done

[[ -n "${BUSINESS_ID}" ]] || die "--business-id is required"
[[ -f "${PROPERTY_FILE}" ]] || die "Property file not found: ${PROPERTY_FILE}"
[[ -f "${RESEARCH_FILE}" ]] || die "Research file not found: ${RESEARCH_FILE}"

require_cmd curl
require_cmd jq

if [[ -n "${SCENARIOS_FILE}" && ! -f "${SCENARIOS_FILE}" ]]; then
  die "Scenarios file not found: ${SCENARIOS_FILE}"
fi

if [[ -n "${SCENARIOS_FILE}" ]]; then
  SCENARIO_BODY="$(cat "${SCENARIOS_FILE}")"
else
  SCENARIO_BODY='{"include_defaults":true}'
fi

CREATE_BODY="$(jq --arg business_id "${BUSINESS_ID}" '.business_id = $business_id' "${PROPERTY_FILE}")"
echo "# Step 1: Create run"
CREATE_RESP="$(http_post "/api/underwriting/runs" "${CREATE_BODY}")"
RUN_ID="$(echo "${CREATE_RESP}" | jq -r '.run_id // empty')"
[[ -n "${RUN_ID}" ]] || die "Create run failed: ${CREATE_RESP}"
echo "run_id=${RUN_ID}"

echo "# Step 2: Ingest research"
INGEST_BODY="$(cat "${RESEARCH_FILE}")"
INGEST_RESP="$(http_post "/api/underwriting/runs/${RUN_ID}/ingest-research" "${INGEST_BODY}")"
echo "${INGEST_RESP}" | jq .

echo "# Step 3: Run scenarios"
SCENARIO_RESP="$(http_post "/api/underwriting/runs/${RUN_ID}/scenarios/run" "${SCENARIO_BODY}")"
echo "${SCENARIO_RESP}" | jq .

echo "# Step 4: Fetch reports"
REPORTS_RESP="$(http_get "/api/underwriting/runs/${RUN_ID}/reports")"
echo "${REPORTS_RESP}" | jq '.scenarios | map({name, scenario_type, recommendation})'

OUT_DIR="${OUT_ROOT}/${RUN_ID}"
mkdir -p "${OUT_DIR}"

echo "${CREATE_RESP}" > "${OUT_DIR}/create_run.json"
echo "${INGEST_RESP}" > "${OUT_DIR}/ingest_research.json"
echo "${SCENARIO_RESP}" > "${OUT_DIR}/run_scenarios.json"
echo "${REPORTS_RESP}" > "${OUT_DIR}/reports.json"

SCENARIO_COUNT="$(echo "${REPORTS_RESP}" | jq '.scenarios | length')"
for ((i=0; i<SCENARIO_COUNT; i++)); do
  NAME="$(echo "${REPORTS_RESP}" | jq -r ".scenarios[$i].name")"
  DIR_NAME="$(slugify "${NAME}")"
  DEST="${OUT_DIR}/${DIR_NAME}"
  mkdir -p "${DEST}"

  echo "${REPORTS_RESP}" | jq ".scenarios[$i]" > "${DEST}/scenario.json"

  for ARTIFACT in ic_memo_md appraisal_md outputs_md sources_ledger_md; do
    CONTENT="$(echo "${REPORTS_RESP}" | jq -r ".scenarios[$i].artifacts.${ARTIFACT}.content_md // empty")"
    if [[ -n "${CONTENT}" ]]; then
      echo "${CONTENT}" > "${DEST}/${ARTIFACT}.md"
    fi
  done

  JSON_CONTENT="$(echo "${REPORTS_RESP}" | jq ".scenarios[$i].artifacts.outputs_json.content_json // empty")"
  if [[ -n "${JSON_CONTENT}" && "${JSON_CONTENT}" != "null" ]]; then
    echo "${JSON_CONTENT}" | jq . > "${DEST}/outputs.json"
  fi
done

echo ""
echo "Artifacts written to: ${OUT_DIR}"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
DATASET_VERSION="${DATASET_VERSION:-perf_v1}"
RUN_LABEL="${RUN_LABEL:-local}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-artifacts/perf/${TIMESTAMP}/${RUN_LABEL}}"
mkdir -p "$ARTIFACT_ROOT"

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is required. Install k6 first: https://grafana.com/docs/k6/latest/set-up/install-k6/" >&2
  exit 2
fi

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  python3 backend/scripts/seed_perf_metrics.py --tier S --dataset-version "$DATASET_VERSION"
fi

run_ai() {
  local tier="$1"
  local profile="$2"
  local subject="$3"
  local action="$4"
  local p95 p99 err vus duration scenario outdir summary report

  case "$tier" in
    S) p95=2500; p99=12000; err=0.02 ;;
    M) p95=5000; p99=12000; err=0.02 ;;
    L) p95=8000; p99=12000; err=0.02 ;;
    *) echo "Unknown tier: $tier" >&2; return 1 ;;
  esac

  case "$profile" in
    smoke_5) vus=5; duration=30s ;;
    steady_5) vus=5; duration=2m ;;
    steady_20) vus=20; duration=3m ;;
    steady_50) vus=50; duration=5m ;;
    burst_100) vus=100; duration=60s ;;
    soak_20) vus=20; duration=30m ;;
    *) echo "Unknown profile: $profile" >&2; return 1 ;;
  esac

  scenario="ai_${tier}_${profile}_${subject}_${action}"
  outdir="$ARTIFACT_ROOT/$scenario"
  mkdir -p "$outdir"
  summary="$outdir/k6-summary.json"
  report="$outdir/report.json"

  k6 run backend/perf/scenarios/ai_ask.js \
    -e BASE_URL="$BASE_URL" \
    -e DATA_TIER="$tier" \
    -e SUBJECT="$subject" \
    -e ACTION="$action" \
    -e RUN_ID="$scenario" \
    -e VUS="$vus" \
    -e DURATION="$duration" \
    -e P95_MS="$p95" \
    -e P99_MS="$p99" \
    -e ERROR_RATE="$err" \
    --summary-export "$summary"

  python3 backend/perf/scripts/summarize.py summarize \
    --input "$summary" \
    --output "$report" \
    --scenario "$scenario" \
    --kind ai \
    --tier "$tier" \
    --profile "$profile" \
    --run-id "$scenario" \
    --p95-ms "$p95" \
    --p99-ms "$p99" \
    --error-rate "$err"
}

run_metrics() {
  local tier="$1"
  local profile="$2"
  local failure_mode="${3:-none}"
  local p95 p99 err vus duration scenario outdir summary report

  case "$tier" in
    S) p95=250; p99=500; err=0.01 ;;
    M) p95=600; p99=1200; err=0.01 ;;
    L) p95=1200; p99=2400; err=0.01 ;;
    *) echo "Unknown tier: $tier" >&2; return 1 ;;
  esac

  case "$profile" in
    smoke_5) vus=5; duration=30s ;;
    steady_5) vus=5; duration=2m ;;
    steady_20) vus=20; duration=3m ;;
    steady_50) vus=50; duration=5m ;;
    burst_100) vus=100; duration=60s ;;
    soak_20) vus=20; duration=30m ;;
    *) echo "Unknown profile: $profile" >&2; return 1 ;;
  esac

  scenario="metrics_${tier}_${profile}_${failure_mode}"
  outdir="$ARTIFACT_ROOT/$scenario"
  mkdir -p "$outdir"
  summary="$outdir/k6-summary.json"
  report="$outdir/report.json"

  k6 run backend/perf/scenarios/metrics_query.js \
    -e BASE_URL="$BASE_URL" \
    -e DATA_TIER="${tier,,}" \
    -e RUN_ID="$scenario" \
    -e VUS="$vus" \
    -e DURATION="$duration" \
    -e FAILURE_MODE="$failure_mode" \
    -e P95_MS="$p95" \
    -e P99_MS="$p99" \
    -e ERROR_RATE="$err" \
    --summary-export "$summary"

  python3 backend/perf/scripts/summarize.py summarize \
    --input "$summary" \
    --output "$report" \
    --scenario "$scenario" \
    --kind metrics \
    --tier "$tier" \
    --profile "$profile" \
    --run-id "$scenario" \
    --p95-ms "$p95" \
    --p99-ms "$p99" \
    --error-rate "$err"
}

echo "[perf] artifacts: $ARTIFACT_ROOT"
echo "[perf] running smoke scenarios"

run_ai S smoke_5 mixed lookup
run_ai S smoke_5 mixed decision_support
run_metrics S smoke_5 none

if [[ "${RUN_FAILURE_MODES:-1}" == "1" ]]; then
  echo "[perf] running failure mode scenarios"
  run_metrics S smoke_5 invalid_business_id
  run_metrics S smoke_5 empty_metric_keys
  k6 run backend/perf/scenarios/ai_ask.js \
    -e BASE_URL="$BASE_URL" \
    -e DATA_TIER="S" \
    -e SUBJECT="mixed" \
    -e ACTION="lookup" \
    -e FAILURE_MODE="oversized_prompt" \
    -e RUN_ID="ai_failure_oversized_prompt" \
    -e VUS="1" \
    -e DURATION="10s" \
    -e P95_MS="3000" \
    -e P99_MS="12000" \
    -e ERROR_RATE="0.5" \
    --summary-export "$ARTIFACT_ROOT/ai_failure_oversized_prompt-summary.json"
fi

echo "[perf] local smoke complete"

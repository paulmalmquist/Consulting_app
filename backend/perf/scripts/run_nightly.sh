#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
DATASET_VERSION="${DATASET_VERSION:-perf_v1}"
RUN_LABEL="${RUN_LABEL:-nightly}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-artifacts/perf/${TIMESTAMP}/${RUN_LABEL}}"
mkdir -p "$ARTIFACT_ROOT"

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is required. Install k6 first: https://grafana.com/docs/k6/latest/set-up/install-k6/" >&2
  exit 2
fi

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  python3 backend/scripts/seed_perf_metrics.py --tier S --dataset-version "$DATASET_VERSION"
  python3 backend/scripts/seed_perf_metrics.py --tier M --dataset-version "$DATASET_VERSION"
  python3 backend/scripts/seed_perf_metrics.py --tier L --dataset-version "$DATASET_VERSION"
fi

thresholds_ai() {
  case "$1" in
    S) echo "2500 12000 0.02" ;;
    M) echo "5000 12000 0.02" ;;
    L) echo "8000 12000 0.02" ;;
  esac
}

thresholds_metrics() {
  case "$1" in
    S) echo "250 500 0.01" ;;
    M) echo "600 1200 0.01" ;;
    L) echo "1200 2400 0.01" ;;
  esac
}

profile_shape() {
  case "$1" in
    steady_5) echo "5 2m" ;;
    steady_20) echo "20 3m" ;;
    steady_50) echo "50 5m" ;;
    burst_100) echo "100 60s" ;;
    soak_20) echo "20 30m" ;;
    smoke_5) echo "5 30s" ;;
  esac
}

run_one_ai() {
  local tier="$1" profile="$2" subject="$3" action="$4" failure_mode="${5:-none}"
  read -r p95 p99 err <<<"$(thresholds_ai "$tier")"
  read -r vus duration <<<"$(profile_shape "$profile")"

  local scenario="ai_${tier}_${profile}_${subject}_${action}_${failure_mode}"
  local outdir="$ARTIFACT_ROOT/$scenario"
  local summary="$outdir/k6-summary.json"
  local report="$outdir/report.json"
  mkdir -p "$outdir"

  k6 run backend/perf/scenarios/ai_ask.js \
    -e BASE_URL="$BASE_URL" -e DATA_TIER="$tier" -e SUBJECT="$subject" -e ACTION="$action" \
    -e FAILURE_MODE="$failure_mode" -e RUN_ID="$scenario" -e VUS="$vus" -e DURATION="$duration" \
    -e P95_MS="$p95" -e P99_MS="$p99" -e ERROR_RATE="$err" --summary-export "$summary"

  python3 backend/perf/scripts/summarize.py summarize \
    --input "$summary" --output "$report" --scenario "$scenario" --kind ai --tier "$tier" \
    --profile "$profile" --run-id "$scenario" --p95-ms "$p95" --p99-ms "$p99" --error-rate "$err"
}

run_one_metrics() {
  local tier="$1" profile="$2" failure_mode="${3:-none}"
  read -r p95 p99 err <<<"$(thresholds_metrics "$tier")"
  read -r vus duration <<<"$(profile_shape "$profile")"

  local scenario="metrics_${tier}_${profile}_${failure_mode}"
  local outdir="$ARTIFACT_ROOT/$scenario"
  local summary="$outdir/k6-summary.json"
  local report="$outdir/report.json"
  mkdir -p "$outdir"

  k6 run backend/perf/scenarios/metrics_query.js \
    -e BASE_URL="$BASE_URL" -e DATA_TIER="${tier,,}" -e FAILURE_MODE="$failure_mode" \
    -e RUN_ID="$scenario" -e VUS="$vus" -e DURATION="$duration" \
    -e P95_MS="$p95" -e P99_MS="$p99" -e ERROR_RATE="$err" --summary-export "$summary"

  python3 backend/perf/scripts/summarize.py summarize \
    --input "$summary" --output "$report" --scenario "$scenario" --kind metrics --tier "$tier" \
    --profile "$profile" --run-id "$scenario" --p95-ms "$p95" --p99-ms "$p99" --error-rate "$err"
}

echo "[perf] artifacts: $ARTIFACT_ROOT"

subjects=(repe underwriting legalops mixed)
actions=(lookup aggregation comparison decision_support)
tiers=(S M L)
steady_profiles=(steady_5 steady_20 steady_50)

for tier in "${tiers[@]}"; do
  for profile in "${steady_profiles[@]}"; do
    run_one_metrics "$tier" "$profile"
    for subject in "${subjects[@]}"; do
      for action in "${actions[@]}"; do
        run_one_ai "$tier" "$profile" "$subject" "$action"
      done
    done
  done

  run_one_metrics "$tier" burst_100
  run_one_ai "$tier" burst_100 mixed decision_support

done

run_one_ai L soak_20 mixed decision_support
run_one_ai L soak_20 repe comparison
run_one_metrics L soak_20

run_one_metrics S steady_5 invalid_business_id
run_one_metrics S steady_5 empty_metric_keys
run_one_ai S steady_5 mixed lookup oversized_prompt
if [[ -n "${BASE_URL_SIDECAR_DOWN:-}" ]]; then
  BASE_URL="$BASE_URL_SIDECAR_DOWN" run_one_ai S steady_5 mixed lookup sidecar_unavailable
fi

# Optional baseline comparison for matching scenario names.
if [[ -d backend/perf/baselines ]]; then
  find "$ARTIFACT_ROOT" -name report.json | while read -r report; do
    scenario="$(basename "$(dirname "$report")")"
    baseline="backend/perf/baselines/${scenario}.json"
    if [[ -f "$baseline" ]]; then
      python3 backend/perf/scripts/summarize.py compare \
        --current "$report" \
        --baseline "$baseline" \
        --output "$(dirname "$report")/comparison.json" \
        --max-p95-regression-pct 20.0
    fi
  done
fi

echo "[perf] nightly suite complete"

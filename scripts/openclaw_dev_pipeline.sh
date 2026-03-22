#!/bin/bash
set -euo pipefail

request="${OPENCLAW_REQUEST:-${1:-}}"
max_iterations="${OPENCLAW_MAX_ITERATIONS:-3}"

if [[ -z "$request" ]]; then
  echo "OPENCLAW_REQUEST or a positional request is required" >&2
  exit 64
fi

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

json_reply() {
  local json_input="$1"
  printf '%s' "$json_input" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(typeof data.reply === "string" ? data.reply : "");
'
}

OPENCLAW_MESSAGE=$'Analyze this Winston build request and return a concise implementation plan with scope, ordered tasks, risks, and verification.\n\nRequest:\n'"$request" \
  ./scripts/openclaw_agent_turn.sh architect-winston >"$tmpdir/architect.json"

plan="$(json_reply "$(cat "$tmpdir/architect.json")")"

qa_status="FAIL"
qa_reply=""
build_reply=""
iteration=1

while [[ "$iteration" -le "$max_iterations" ]]; do
  build_prompt=$'Implement this Winston request with minimal, reversible repo changes.\n\nRequest:\n'"$request"$'\n\nPlan:\n'"$plan"
  if [[ -n "$qa_reply" ]]; then
    build_prompt=$build_prompt$'\n\nQA feedback from the prior pass:\n'"$qa_reply"
  fi

  OPENCLAW_MESSAGE="$build_prompt" ./scripts/openclaw_agent_turn.sh builder-winston >"$tmpdir/build-${iteration}.json"
  build_reply="$(json_reply "$(cat "$tmpdir/build-${iteration}.json")")"

  qa_prompt=$'Review the latest Winston implementation attempt.\nReturn PASS or FAIL as the first token on the first line, then a concise summary and flat findings.\n\nRequest:\n'"$request"$'\n\nPlan:\n'"$plan"$'\n\nBuilder summary:\n'"$build_reply"
  OPENCLAW_MESSAGE="$qa_prompt" ./scripts/openclaw_agent_turn.sh qa-winston >"$tmpdir/qa-${iteration}.json"
  qa_reply="$(json_reply "$(cat "$tmpdir/qa-${iteration}.json")")"

  first_token="$(printf '%s\n' "$qa_reply" | awk 'NR==1 { print toupper($1); exit }')"
  if [[ "$first_token" == "PASS" ]]; then
    qa_status="PASS"
    break
  fi

  iteration=$((iteration + 1))
done

PIPELINE_REQUEST="$request" \
PIPELINE_PLAN="$plan" \
PIPELINE_BUILD="$build_reply" \
PIPELINE_QA="$qa_reply" \
PIPELINE_STATUS="$qa_status" \
PIPELINE_ITERATIONS="$iteration" \
node - <<'NODE'
const output = {
  workflow: "novendor-dev-pipeline",
  request: process.env.PIPELINE_REQUEST || "",
  status: (process.env.PIPELINE_STATUS || "FAIL").toLowerCase(),
  iterations: Number.parseInt(process.env.PIPELINE_ITERATIONS || "1", 10),
  plan: process.env.PIPELINE_PLAN || "",
  buildSummary: process.env.PIPELINE_BUILD || "",
  qaSummary: process.env.PIPELINE_QA || "",
};

process.stdout.write(JSON.stringify(output));
NODE

#!/bin/bash
set -euo pipefail

request="${OPENCLAW_REQUEST:-${1:-Review the latest Winston build state.}}"

json_reply() {
  local json_input="$1"
  printf '%s' "$json_input" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(typeof data.reply === "string" ? data.reply : "");
'
}

architect_prompt=$'Review this Winston build request and summarize the intended architecture, main surfaces, and top risks in 5 bullets.\n\nRequest:\n'"$request"
qa_prompt=$'Review the current Winston build or diff for this request.\nReturn PASS or FAIL as the first token on the first line, then a concise summary and findings.\n\nRequest:\n'"$request"

architect_json="$(OPENCLAW_MESSAGE="$architect_prompt" ./scripts/openclaw_agent_turn.sh architect-winston)"
qa_json="$(OPENCLAW_MESSAGE="$qa_prompt" ./scripts/openclaw_agent_turn.sh qa-winston)"

architect_reply="$(json_reply "$architect_json")"
qa_reply="$(json_reply "$qa_json")"
first_token="$(printf '%s\n' "$qa_reply" | awk 'NR==1 { print toupper($1); exit }')"

REVIEW_REQUEST="$request" \
REVIEW_ARCHITECT="$architect_reply" \
REVIEW_QA="$qa_reply" \
REVIEW_STATUS="${first_token:-FAIL}" \
node - <<'NODE'
process.stdout.write(
  JSON.stringify({
    workflow: "build-review",
    request: process.env.REVIEW_REQUEST || "",
    status: (process.env.REVIEW_STATUS || "FAIL").toLowerCase(),
    architecture: process.env.REVIEW_ARCHITECT || "",
    qa: process.env.REVIEW_QA || "",
  }),
);
NODE

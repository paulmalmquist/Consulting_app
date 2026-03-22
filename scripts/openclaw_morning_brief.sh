#!/bin/bash
set -euo pipefail

json_reply() {
  local json_input="$1"
  printf '%s' "$json_input" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(typeof data.reply === "string" ? data.reply : "");
'
}

delivery_prompt=$'Summarize Winston delivery status in 4 concise bullets. Cover repo/deploy state, major open work, and anything that needs operator attention.'
ops_prompt=$'Summarize Novendor operator status in 4 concise bullets. Cover outreach, proposals, content, and pending approvals or follow-ups.'

delivery_json="$(OPENCLAW_MESSAGE="$delivery_prompt" ./scripts/openclaw_agent_turn.sh commander-winston)"
ops_json="$(OPENCLAW_MESSAGE="$ops_prompt" ./scripts/openclaw_agent_turn.sh operations)"

delivery_reply="$(json_reply "$delivery_json")"
ops_reply="$(json_reply "$ops_json")"
brief=$'# Morning Brief\n\n## Winston Delivery\n'"$delivery_reply"$'\n\n## Novendor Operations\n'"$ops_reply"

MORNING_BRIEF="$brief" node - <<'NODE'
process.stdout.write(
  JSON.stringify({
    workflow: "morning-brief",
    brief: process.env.MORNING_BRIEF || "",
  }),
);
NODE

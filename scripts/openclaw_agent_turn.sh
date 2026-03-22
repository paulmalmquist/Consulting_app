#!/bin/bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <agent-id> [message]" >&2
  exit 64
fi

agent_id="$1"
shift || true

message="${OPENCLAW_MESSAGE:-}"
if [[ -z "$message" && $# -gt 0 ]]; then
  message="$*"
fi
if [[ -z "$message" ]]; then
  echo "OPENCLAW_MESSAGE or a positional message is required" >&2
  exit 64
fi

args=(openclaw agent --agent "$agent_id" --message "$message" --json)
if [[ -n "${OPENCLAW_THINKING:-}" ]]; then
  args+=(--thinking "$OPENCLAW_THINKING")
fi
if [[ -n "${OPENCLAW_TIMEOUT_SECONDS:-}" ]]; then
  args+=(--timeout "$OPENCLAW_TIMEOUT_SECONDS")
fi
if [[ -n "${OPENCLAW_SESSION_ID:-}" ]]; then
  args+=(--session-id "$OPENCLAW_SESSION_ID")
fi

json_output="$("${args[@]}")"

printf '%s' "$json_output" | OPENCLAW_AGENT_ID="$agent_id" node -e '
const fs = require("fs");
const raw = fs.readFileSync(0, "utf8");
let data = null;
for (let idx = raw.indexOf("{"); idx >= 0; idx = raw.indexOf("{", idx + 1)) {
  try {
    data = JSON.parse(raw.slice(idx));
    break;
  } catch {}
}
if (!data) {
  throw new Error("Could not find a JSON payload in openclaw agent output");
}
const result = data.result && typeof data.result === "object" ? data.result : data;
const payloads = Array.isArray(result.payloads) ? result.payloads : [];
const reply = payloads
  .map((payload) => (typeof payload?.text === "string" ? payload.text : ""))
  .filter(Boolean)
  .join("\n\n");
const meta = result.meta || {};
const agentMeta = meta.agentMeta || {};

process.stdout.write(
  JSON.stringify({
    status: data.status || (payloads.length > 0 ? "ok" : "unknown"),
    summary: data.summary || null,
    agentId: process.env.OPENCLAW_AGENT_ID || null,
    reply,
    runId: data.runId || null,
    sessionId: agentMeta.sessionId || null,
    provider: agentMeta.provider || null,
    model: agentMeta.model || null,
    durationMs: meta.durationMs || null,
  }),
);
'

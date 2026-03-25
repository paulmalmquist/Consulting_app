#!/bin/bash
set -euo pipefail

mode="${1:-draft}"

json_reply() {
  local json_input="$1"
  printf '%s' "$json_input" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(typeof data.reply === "string" ? data.reply : "");
'
}

if [[ "$mode" == "draft" ]]; then
  request="${OPENCLAW_REQUEST:-${2:-}}"
  if [[ -z "$request" ]]; then
    echo "OPENCLAW_REQUEST or a positional request is required for draft mode" >&2
    exit 64
  fi

  research_prompt=$'Research this Novendor opportunity and return a concise prospect brief with pains, likely wedge, suggested offer, and risks.\n\nRequest:\n'"$request"
  proposal_prompt_prefix=$'Draft a concise client-facing proposal with these sections: Problem, Proposed Engagement, Deliverables, Timeline, Pricing Notes, Next Step.\n\nResearch brief:\n'

  research_json="$(OPENCLAW_MESSAGE="$research_prompt" ./scripts/openclaw_agent_turn.sh outreach)"
  research_reply="$(json_reply "$research_json")"
  proposal_json="$(OPENCLAW_MESSAGE="$proposal_prompt_prefix$research_reply" ./scripts/openclaw_agent_turn.sh proposals)"
  proposal_reply="$(json_reply "$proposal_json")"

  PROPOSAL_REQUEST="$request" \
  PROPOSAL_RESEARCH="$research_reply" \
  PROPOSAL_DRAFT="$proposal_reply" \
  node - <<'NODE'
process.stdout.write(
  JSON.stringify({
    workflow: "novendor-proposal-pipeline",
    mode: "draft",
    request: process.env.PROPOSAL_REQUEST || "",
    research: process.env.PROPOSAL_RESEARCH || "",
    proposal: process.env.PROPOSAL_DRAFT || "",
    approvalPrompt: "Approve this proposal draft for operator handoff?",
  }),
);
NODE
  exit 0
fi

if [[ "$mode" != "finalize" ]]; then
  echo "unsupported mode: $mode" >&2
  exit 64
fi

draft_json="${OPENCLAW_DRAFT_JSON:-}"
if [[ -z "$draft_json" ]]; then
  draft_json="$(cat)"
fi
if [[ -z "$draft_json" ]]; then
  echo "OPENCLAW_DRAFT_JSON or stdin JSON is required for finalize mode" >&2
  exit 64
fi

proposals_root="/Users/paulmalmquist/.openclaw/workspaces/novendor-proposals/approved"
operations_root="/Users/paulmalmquist/.openclaw/workspaces/novendor-operations/outbox"
mkdir -p "$proposals_root" "$operations_root"

timestamp="$(date '+%Y%m%d-%H%M%S')"
proposal_path="$proposals_root/$timestamp-proposal.md"
handoff_path="$operations_root/$timestamp-operator-handoff.md"

PROPOSAL_DRAFT_JSON="$draft_json" \
PROPOSAL_PATH="$proposal_path" \
HANDOFF_PATH="$handoff_path" \
node - <<'NODE'
const fs = require("fs");

const draft = JSON.parse(process.env.PROPOSAL_DRAFT_JSON || "{}");
const proposalPath = process.env.PROPOSAL_PATH;
const handoffPath = process.env.HANDOFF_PATH;

const request = draft.request || "Unspecified request";
const research = draft.research || "";
const proposal = draft.proposal || "";

const proposalDoc = [
  "# Approved Novendor Proposal",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Request",
  request,
  "",
  "## Research Brief",
  research,
  "",
  "## Proposal Draft",
  proposal,
  "",
].join("\n");

const handoffDoc = [
  "# Operator Handoff",
  "",
  `Approved: ${new Date().toISOString()}`,
  "",
  "The proposal draft is approved and staged for operator delivery.",
  "",
  `Proposal file: ${proposalPath}`,
  "",
  "Next action: review and send through the preferred external channel.",
  "",
].join("\n");

fs.writeFileSync(proposalPath, proposalDoc);
fs.writeFileSync(handoffPath, handoffDoc);

process.stdout.write(
  JSON.stringify({
    workflow: "novendor-proposal-pipeline",
    mode: "finalize",
    status: "approved",
    proposalPath,
    handoffPath,
    summary: "Proposal approved and staged for operator delivery.",
  }),
);
NODE

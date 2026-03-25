#!/bin/bash
set -euo pipefail

prompt="${OPENCLAW_APPROVAL_PROMPT:-Approve this workflow step?}"
preview="$(cat)"

OPENCLAW_APPROVAL_PROMPT="$prompt" OPENCLAW_APPROVAL_PREVIEW="$preview" node - <<'NODE'
const prompt = process.env.OPENCLAW_APPROVAL_PROMPT || "Approve this workflow step?";
const rawPreview = process.env.OPENCLAW_APPROVAL_PREVIEW || "";

let preview = rawPreview.trim();
try {
  preview = JSON.stringify(JSON.parse(rawPreview), null, 2);
} catch {}

process.stdout.write(
  JSON.stringify({
    requiresApproval: {
      prompt,
      items: [],
      preview: preview.slice(0, 4000),
    },
  }),
);
NODE

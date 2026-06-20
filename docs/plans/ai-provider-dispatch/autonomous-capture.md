# Autonomous capture — how this is recorded without human interruption or oversight

Added scope (PR 2 review question): *how is all of this captured without human interruption or oversight?*

Short answer: **capture is automatic, oversight is optional, and the risky levers stay human-gated.**
The dispatch layer records itself on every call; the admin panel only *observes* what was already
captured; and the few actions that could cause harm are deliberately left for a human.

## What is captured automatically (no human in the loop)

- **Every dispatch self-records a receipt.** `supervisor.run_dispatch` calls
  `governance.record_decision(decision_type="provider_dispatch", …)` on **every** outcome — success,
  blocked, unavailable, degraded — writing to `ai_decision_audit_log` with provider, model, mode/risk
  tags, prompt/completion tokens, latency, confidence, redacted input summary, and a routing trace.
  No human action triggers this; it happens inline.
- **Redaction is automatic.** `audit.redact_dict` strips secret-bearing keys before the row is written.
  The stored `output_summary` carries the routing trace and usage only — never the raw model answer.
- **Failures are captured, not lost.** If the receipt write fails, the result self-reports
  `receipt_status="failed"` + `null_reason="receipt_write_failed"` and a SUCCESS degrades to DEGRADED —
  the gap is visible in the data, never silently dropped, and never a phantom receipt id.
- **Routing reasons are captured.** `policy.select_provider` records the chosen provider **and the
  reason every other provider was rejected** (`rejected` map). Why a request routed where it did is in
  the receipt/result, not in someone's head.
- **The eval suite runs itself.** `GET /api/ai/dispatch/evals` (and the CLI `eval` command) run the
  routing-policy suite in-process through the pure `select_provider` — deterministic pass/fail, no human
  grading, no model calls, no DB writes.
- **Fail-closed is automatic.** Unavailable provider, forbidden risk/privacy, missing config, unknown
  input → an automatic `null_reason`, with no human decision required to stay safe.

## Why the admin panel does not need a human watching it

The `/lab/system/ai-provider-dispatch` panel is **read-only**. It renders data that was already captured
(registry, receipts, eval results). It creates nothing, approves nothing, and triggers no provider call
(the proxy is GET-only). Capture happens whether or not anyone opens the page; the panel is for review
and audit, not for the system to function.

## What is deliberately NOT autonomous (kept human-gated)

These are the governance gates that must stay human — automating them would remove the oversight that
makes the rest safe:

- **Enabling execution** — `AI_DISPATCH_ENABLED` (POST /run) is off by default; a human turns it on.
- **Promoting a provider** — flipping Gemma to a mode default is eval-gated **and** requires human
  sign-off (see `eval-plan.md`); evals inform the decision, they do not make it.
- **Real provider wiring and deploys** — adapters and production deploys are human-initiated.

## Capturing eval/health over time without a human watching (future, PR 2+ scheduler)

The read-only data is already exposed, so unattended capture-over-time needs only a scheduler, not new
surface: a Railway/Vercel cron can `GET /api/ai/dispatch/evals` and `/providers` on an interval and
persist the result (or alert on drift). That closes the loop on "captured without human interruption"
for trend/health, while the human-gated levers above stay human. This scheduler is intentionally a
later ticket, not part of PR 2 (PR 2 is read-only visibility only).

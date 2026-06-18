# Roadmap — ADE Ops Orchestrator

Read-only first, recommendations second, dry-run third, approval-gated execution last.

## PR 1 — Skeleton + 5 commands — SHIPPED
Risk tiers 0–5; supervisor-of-skills; read-only `/api/ade/ops`; receipts to
`ai_decision_audit_log`; console; tier ≥2 visible but non-executable; fail-closed
honesty. Commands: `scan pipelines` (real, cloud not configured), `can I trust
this number` (real degraded), `assess freshness` / `show cost hotspots` /
`recommend rightsize` (fail closed until adapters land).

## PR 2 — Freshness adapter
Read `authoritative_data_as_of` / last-refresh; business-impact scoring →
`assess freshness` returns real evidence + a recommended cadence.

## PR 3 — Cloud read-only inventory adapters
Snowflake / Databricks / GCP / AWS read-only telemetry (query history, metering,
billing), **fail-closed on missing credentials** → `show cost hotspots` and
`recommend rightsize` inputs.

## PR 4 — Recommendation engine
Right-size + cadence heuristics, confidence/risk scoring, ADO ticket + dry-run
patch generation. Tier 2 becomes executable as **dry-run only**.

## PR 5 — Approval-gated execution
Allowlisted CLI/SQL write commands behind approval tokens, mandatory rollback,
observation windows, immutable receipts. Tiers 3–4.

## PR 6 — Incidents + post-change watcher
Data-incident state machine, blast-radius mapping, watch the next N runs after a
change, auto-rollback recommendation, closeout report. Tier 5.

## Later
Centralized scheduling (Railway/Vercel cron → a trigger endpoint); remaining
skill families (quality, contracts, metrics governance, AI-answer safety).

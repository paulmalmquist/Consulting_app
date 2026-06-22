# Telemetry Platform — environment notes

Planning folder for the Telemetry Anomaly Platform: a portfolio proof-of-work that turns raw
engine-test sensor streams into automated go/no-go decisions, built on public NASA aerospace analog
datasets (C-MAPSS turbofan RUL, SMAP/MSL telemanom anomaly detection, IMS bearing run-to-failure).

The runnable code lives outside this folder (the build is a hybrid split). See the root
`telemetry-platform/README.md` for the repository layout and the dispatch record
`docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md` for the full plan.

## The bar

A skeptical senior engineer with no context, given ~4 minutes, should independently conclude "this
person could own our test-telemetry platform." They verify three things without taking our word:

- **Real, not a slide deck** — data visibly moves, an anomaly fires on its own, real MLflow run IDs /
  row counts / non-round metrics, API calls return live values.
- **Speaks the domain** — go/no-go, redline thresholds, off-nominal, sensor attribution, point vs
  contextual anomaly, false-abort vs missed-anomaly cost.
- **Reads as a platform** — ingestion → lakehouse → training → registry → promotion gate → serving →
  live app → monitoring → proof. The operated loop is the differentiator, not the model.

## Files

| File | What it holds |
|---|---|
| `architecture.md` | the spine: pipeline diagram, frontend/backend/data maps, `tel_` tables, domain glossary |
| `roadmap.md` | Phases 1–5 tickets + the phase-gating rule |
| `ai-behavior.md` | fail-closed contract for the optional test-report copilot |
| `eval-plan.md` | golden paths, negative tests, visual checks, smoke checks |
| `next-session.md` | copy-paste-ready Phase 1 prompt (starts with the PAT gate) |
| `backlog.md` | open items (populated as tickets are cut) |
| `qa-checklist.md` | stub — filled in Phase 4 |
| `design-adaptation.md` | stub — filled in Phase 4 |
| `release-readiness.md` | stub — filled in Phase 5 |

## Status

COMPLETE — Phases 0–5. The full operated loop is live: Databricks medallion → MLflow registry gates →
FastAPI serving (Railway) → Supabase prediction log → dashboard (novendor.ai) → drift monitoring.
Demo env_id `dc82d39d-9be2-49b0-a01d-c7181b13a8b6`. One open item: an authenticated production
screenshot (see `release-readiness.md`). Evidence: `PROOF.md`. Screenshots:
`telemetry-platform/docs/screenshots/`.

## Hard gate

Every Databricks session starts with the read-only auth gate (`telemetry-platform/databricks/auth_gate.py`):
`DATABRICKS_PAT` is sourced from `claude_token.txt` if unset and verified before any work. STOP if it fails.

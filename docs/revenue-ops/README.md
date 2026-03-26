# Revenue Operations Program

This directory contains the Novendor first-revenue operating program. Everything here is designed to be consumed by both humans and autonomous tasks.

## Structure

- `REVENUE_OPERATING_PROGRAM.html` — Master interactive dashboard (open in browser)
- `pipeline-stages.md` — Revenue-backwards pipeline definition
- `offers/` — Packaged offer definitions
- `targets/` — Target account segments and lists
- `proof-backlog.md` — Proof asset backlog ranked by revenue impact
- `scoreboard.md` — Current execution metrics
- `weekly-rhythm.md` — Weekly operating cadence
- `recurring-tasks/` — Autonomous task definitions for revenue ops
- `product-feedback/` — Sales-originated product feedback synthesis

## Key Principle

Work backwards from cash collected. Every activity, asset, and task in this program exists because it moves something closer to a signed, paid engagement.

## Autonomous Task Integration

Revenue-oriented recurring tasks are defined in `recurring-tasks/` and should be registered alongside existing development-focused scheduled tasks. They consume outputs from `docs/sales-signals/`, `docs/sales-positioning/`, `docs/demo-ideas/`, and `docs/competitor-research/` and produce actionable outputs in this directory.

## CRM Integration

This program builds on the existing Consulting Revenue OS schema (migration 280). Pipeline stages, lead profiles, outreach logs, proposals, and revenue schedules are all managed through the existing CRM infrastructure. No new tables are needed — the existing schema covers everything.

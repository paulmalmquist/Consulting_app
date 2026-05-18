# History Rhymes / Trading Research and Decision Loop

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

History Rhymes is the quantitative trading research and decision environment. It covers regime detection, feature engineering, ML model training, backtesting, paper trading, daily decision calls, market intelligence, and the trading routine surface. It runs on Databricks/MLflow for ML workloads and maintains a decision ledger for position tracking.

## Plan files

- [architecture.md](architecture.md) — Implementation map
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next session
- [release-readiness.md](release-readiness.md) — Release gate status

## Key existing docs

- `docs/plans/HISTORY_RHYMES_BUILD_PLAN.md` — full build plan
- `docs/plans/TRADING_LAB_ENHANCEMENT_PLAN.md` — trading lab enhancements
- `docs/plans/TRADING_PLATFORM_REBUILD_PLAN.md` — trading platform rebuild
- `skills/historyrhymes/SKILL.md` — ML training skill
- `skills/historyrhymes-execution-layer/SKILL.md` — daily decision execution skill
- `skills/market-rotation-engine/SKILL.md` — market rotation support

## First recommended next session

Read `next-session.md`. The highest-priority task is verifying the daily decision build runs end-to-end and the trading routine page renders the current decision.

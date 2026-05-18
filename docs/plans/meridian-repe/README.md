# Meridian / REPE Finance

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

Meridian is the Real Estate Private Equity (REPE) analytics environment. It provides fund-level and asset-level financial intelligence, waterfall analysis, scenario modeling, portfolio monitoring, period close, IRR/TVPI calculations, and authoritative state management for REPE clients. It is the most complex and financially sensitive environment in the platform.

## Plan files

- [architecture.md](architecture.md) — Implementation map
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next coding session
- [release-readiness.md](release-readiness.md) — Release gate status

## Key existing docs

- `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` — **Read before any REPE financial code**
- `docs/plans/INVESTMENT_ENGINE_PLAN.md` — Investment engine full plan
- `docs/adr/investment-engine/` — Architecture decision records for investment engine
- `docs/plans/DEBT_FUND_REPORTING_HIERARCHY.md` — Debt fund reporting structure
- `docs/plans/investment-engine/` — Per-module plans and handoffs

## Critical rule

Before writing any code that reads REPE financials (fund KPIs, returns, NOI, IRR, TVPI, carry), read `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`. The authoritative state lock is enforced by CI — violating it will fail the build.

## Known issues (from memory)

- IGF VII 2024Q4 (456%) and MCOF I 2025Q2 (366%) released gross_irr values appear implausible. Suspected: builder XIRR for sparse early-history funds, not a backfill runner bug.

## First recommended next session

Read `next-session.md`. Focus on the authoritative state layer and period close flow — these are the highest-risk areas.

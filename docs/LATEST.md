# LATEST.md — Autonomous Intelligence Manifest
## Updated by: morning-ops-digest (7:30 AM weekdays)
## Read this file first in any new coding session.

> This manifest is machine-readable. It points to the most recent output from every scheduled task. A coding agent can read this one file and know the current state of all intelligence, operations, and test results.

---

## Production Status

| System | Status | Last checked |
|---|---|---|
| paulmalmquist.com | UP — login page rendering, all authenticated pages pass | 2026-03-24 |
| novendor.ai | LIVE — full marketing site, "Put AI to Work" hero, 4 industry verticals | 2026-03-22 |
| Supabase | HEALTHY — 8 connections, 0 stuck, clean pool | 2026-03-24 |
| Vercel deploys | GREEN — consulting-app READY; Stone PDS null guard fixes deployed | 2026-03-24 |

## Environment Health

- **Stone PDS:** DEGRADED (strongly improving) — 12/16 pages PASS (up from 10/16). Resources and Timecards null guards FIXED and deployed. Client Satisfaction fix committed, pending Vercel deploy. Schedule Health redirect open P1. `pds_leader_coverage` 0 rows. Satisfaction score seed quality issue.
- **Meridian Capital:** DEGRADED — SQL generation fix (`fa9372dc`) committed but not confirmed deployed to Railway. Chat pipeline (Lane A) hallucinating fund data + exposing raw tool call JSON (new Bug 0 regression). Lane B latency spiked 164ms → 12,534ms. Distributions show $0 "Total Paid" (missing payout rows). AI test pass rate 33% (2/6) — unchanged from 2026-03-23.
- **MSA Rotation Engine:** OPERATIONAL — Miami—Wynwood/Edgewater brief completed (score 7.0/10). 14 backlog cards total (5 prompted, 9 specced, 0 built). Top card: Cap Rate Distribution Estimator (priority 44.1/100).
- **Market Intelligence Engine:** PROVISIONED — 34 segments seeded, regime classified as RISK_OFF_DEFENSIVE, frontend built. First rotation sweeps pending.
- **Resume:** UNCONFIRMED — last confirmed healthy 2026-03-21

## Latest AI Test Results

| File | Date | Pass rate |
|---|---|---|
| `docs/ai-testing/2026-03-24.md` | 2026-03-24 | 33.3% — 2/6 passed. New regression: Test 1 hallucinating fund data + raw tool call JSON visible in chat (Bug 0 re-emerging). Lane B latency regression 164ms→12,534ms. SQL generation fix committed not confirmed deployed. |

**Bug 0 status:** REGRESSED — commit `658bb74` had fixed tool call spam, but `2026-03-24` test shows raw tool call JSON visible in Lane A chat responses again. Check `backend/app/services/ai_gateway.py` SSE emit layer.

**Next P0:** (1) Confirm Railway deployed `fa9372dc` — `generate_sql()` fix for `repe_fast_path`. (2) Patch Tool Call JSON leak in Lane A chat pipeline.

## Latest Code Quality

| File | Date | Overall score |
|---|---|---|
| `docs/ops-reports/code-quality/2026-03-21.md` | 2026-03-21 | C+ (first Saturday sweep) |

**Key findings:** 76 commits, 39 feature / 37 fix (near 1:1 ratio). Hardcoded API key needs rotation. Coding agent not running ruff/tsc before commits.

## Latest Feature Radar

| File | Date | Top pick |
|---|---|---|
| `docs/feature-radar/2026-03-23-noon.md` | 2026-03-23 | Deal Room Mode — 1M token context toggle for whole-deal ingestion; GPT-5.4 forcing function; HIGH priority |

## Latest Competitor Intelligence

| File | Date | Top opportunity |
|---|---|---|
| `docs/competitor-research/daily-summary/2026-03-23.md` | 2026-03-23 | Juniper Square HIGH threat (JunieAI live + Tenor Digital acquisition for private credit); Yardi Virtuoso AI maturing; Cherre Data Observability UI gap |

## Latest Sales Signals

| File | Date | Top prospect |
|---|---|---|
| `docs/sales-signals/` | 2026-03-19 | Allegro Real Estate (UK, greenfield, debut fund) |

## Latest Efficiency Report

| File | Date | Summary |
|---|---|---|
| `docs/ops-reports/efficiency/2026-03-21.md` | 2026-03-21 | First run. 14/17 tasks KEEP, 3 REFINE. Top: code quality sweep (20/20), demo ideas (19/20). Bottom: coding followup (9/20 — make conditional). |

## Latest Watchdog Report

| File | Date | Status |
|---|---|---|
| `docs/ops-reports/watchdog/2026-03-21.md` | 2026-03-21 | HEALTHY — all 10 task categories produced output. Git index.lock stale. |

## Latest Daily Digest

| File | Date |
|---|---|
| `docs/ops-reports/digests/digest-2026-03-25.md` | 2026-03-25 |

## Active Meta Prompts (Build Directives)

| Meta Prompt | Status | Priority |
|---|---|---|
| `META_PROMPT_CHAT_WORKSPACE.md` | Active | Bug 0 re-emerging (tool call JSON leak in Lane A) → SQL generation fix → Lane B latency fix → chat workspace |
| `META_PROMPT_VISUAL_RESUME.md` | Active — needs career data | Build resume lab environment |

## Active Bugs

| Bug | Severity | Status | Location |
|---|---|---|---|
| Bug 0: Tool call spam in AI UI | CRITICAL | REGRESSED — raw tool call JSON visible in Lane A chat responses as of 2026-03-24 | `docs/ai-testing/2026-03-24.md` |
| repe_fast_path SQL generation failure | CRITICAL | FIX COMMITTED (`fa9372dc`) — not confirmed deployed to Railway | `docs/ai-testing/2026-03-24.md` |
| Lane B total latency regression | HIGH | NEW — 164ms→12,534ms elapsed for error recovery (Lane B) | `docs/ai-testing/2026-03-24.md` |
| Stone PDS: Client Satisfaction null guard | HIGH | FIX COMMITTED — pending Vercel deploy | `docs/env-tasks/stone-pds/health/health-2026-03-24.md` |
| Stone PDS: Schedule Health nav redirect | HIGH | OPEN — redirects to /pds/risk silently | `docs/env-tasks/stone-pds/health/health-2026-03-24.md` |
| Raw internal fund UUIDs exposed to users | HIGH | OPEN | `docs/ai-testing/2026-03-24.md` |
| Meridian: Distributions Total Paid $0 | MEDIUM | OPEN — payout rows not seeded for 10 Paid events | `docs/env-tasks/meridian/health/health-2026-03-24.md` |
| Meridian: Investment sub-records missing | MEDIUM | OPEN — property_type, market, valuation, operating_data absent | `docs/env-tasks/meridian/health/health-2026-03-24.md` |
| Bug 1: Waterfall amounts unformatted | HIGH | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 2: Pref return / carry $0 | HIGH | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 3: Capital snapshots need manual click | MEDIUM | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 4: Reports default to wrong fund | MEDIUM | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 5: UW vs Actual all dashes | MEDIUM | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |

## Scheduled Task Index

| Time | Task ID | Output folder |
|---|---|---|
| 1:00 AM | nightly-ops-validator (pending) | `docs/ops-reports/regression/` |
| 2:00 AM | (overnight window) | |
| 3:00 AM Sat | weekly-code-quality-sweep | `docs/ops-reports/code-quality/` |
| 6:00 AM | novendor-market-scanner | `docs/market-intel/` |
| 6:10 AM | novendor-market-scanner | |
| 7:00 AM | morning-business-intel-brief | `docs/daily-intel/` |
| 7:00 AM | novendor-competitor-deconstruction | |
| 7:30 AM | morning-ops-digest | `docs/ops-reports/digests/` + updates THIS FILE |
| 8:00 AM | competitor-reverse-engineering | `docs/competitor-research/` |
| 8:00 AM | novendor-deal-opportunity-miner | |
| 9:00 AM | linkedin-content-generator | `docs/linkedin-content/` |
| 9:00 AM | novendor-workflow-replacement-builder | |
| 10:00 AM | novendor-demo-product-improvement | |
| 10:30 AM | deploy-smoke-test | `docs/ops-reports/deploy/` |
| 11:00 AM | website-evolution-engine | `docs/site-improvements/` |
| 11:00 AM | novendor-narrative-distribution | |
| 12:00 PM | product-feature-radar | `docs/feature-radar/` |
| 12:00 PM | noon-feature-ideas | `docs/feature-ideas/` |
| 1:00 PM | midday-production-health | `docs/ops-reports/site-health/` |
| 2:00 PM | demo-idea-generator | `docs/demo-ideas/` |
| 4:00 PM | sales-signal-discovery | `docs/sales-signals/` |
| 6:00 PM | competitor-tracker | `docs/competitor-tracking/` |
| 11:00 PM | winston-ai-feature-tester | `docs/ai-testing/` |
| 11:59 PM | tour-my-site-for-health | |

## Capability Inventory

**`docs/CAPABILITY_INVENTORY.md`** — Single source of truth for what's already built. 258 pages, 208 services, 31 MCP tool categories, 32 lab environments.

All suggestion-generating tasks (feature-radar, demo-ideas, site-improvements, competitor-research) MUST read this file before recommending new builds. If a capability is already deployed, suggest an enhancement — not a duplicate.

## MSA Rotation Engine

- **Last rotation:** Miami — Wynwood/Edgewater on 2026-03-24 — Score 7.0/10 (first run, Tier 1, mixed-use)
- **Pipeline status:** OPERATIONAL — brief ran, intelligence populated, feature cards generating
- **Feature backlog:** 14 cards total — 5 prompted (ready to build), 9 specced, 0 built
- **Top card to build:** Cap Rate Distribution by Asset Class Estimator (Priority 44.1/100) — pure calculation gap on data Winston already captures
- **Latest intel:** `docs/msa-intel/miami-wynwood-2026-03-24.md`
- **Latest feature cards:** `docs/msa-features/cards-2026-03-24.md`

## Market Rotation Engine

- **Regime:** RISK_OFF_DEFENSIVE (high confidence, classified 2026-03-22)
- **Trigger:** SPX broke 200-day MA; VIX 26.78; HY spreads 320 bps; DXY ~99.5; BTC-SPX correlation rebounding
- **Segments:** 34 active (16 equities, 8 crypto, 4 derivatives, 6 macro) — all awaiting first rotation
- **Pipeline status:** PROVISIONED — schema 419 applied, segments seeded, 8 fin-* tasks scheduled, frontend built
- **First rotation targets (by overdue ratio):** BTC On-Chain Regime, ETH Ecosystem Health, Equity Options Flow, Crypto Derivatives Flow
- **Feature cards:** 0 (pipeline hasn't produced research briefs yet)
- **Cross-vertical alerts:** Rate environment feeding into REPE cap rate models; credit spread widening relevant to credit decisioning module

---

## How to Use This File

1. **Starting a coding session?** Read this file first. Check the bug list and production status.
2. **Building a new feature?** Check `docs/CAPABILITY_INVENTORY.md` and the feature radar before starting.
3. **Fixing a bug?** Check the AI test results and deploy smoke test for latest regression status.
4. **Doing cleanup?** Check the code quality sweep for the prioritized list.
5. **Preparing for a sales call?** Check sales signals, competitor positioning, and demo ideas.
6. **Writing content?** Check LinkedIn content and site improvements for the latest angles.
7. **Suggesting new features?** Read `docs/CAPABILITY_INVENTORY.md` FIRST to avoid recommending things that already exist.

---

*Last updated: 2026-03-25 08:30 AM by morning-ops-digest. Manual edits are fine but will be overwritten on next run.*

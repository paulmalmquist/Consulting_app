# LATEST.md — Autonomous Intelligence Manifest
## Updated by: morning-ops-digest (7:30 AM weekdays)
## Read this file first in any new coding session.

> This manifest is machine-readable. It points to the most recent output from every scheduled task. A coding agent can read this one file and know the current state of all intelligence, operations, and test results.

---

## Production Status

| System | Status | Last checked |
|---|---|---|
| paulmalmquist.com | UP — login page rendering, all authenticated pages pass | 2026-03-25 |
| novendor.ai | LIVE — full marketing site, "Put AI to Work" hero, 4 industry verticals | 2026-03-22 |
| Supabase | HEALTHY — 8 connections, 0 stuck, clean pool | 2026-03-24 |
| Vercel deploys | GREEN — consulting-app READY; Stone PDS null guard fixes deployed | 2026-03-25 |
| Railway | UNCONFIRMED — SQL gen fix (fa9372dc) + Bug 0 fix (6cfd6234) committed but deploy status unknown | 2026-03-26 |

## Environment Health

- **Stone PDS:** IMPROVING — 13/14 pages PASS (up from 12/16). Client Satisfaction null guard fix DEPLOYED and working. Two new NaN display bugs: Forecast "Total Deals: NaN", Client Satisfaction "NPS Score: NaN". Schedule Health redirect open P1. 11 new nav items discovered needing test coverage.
- **Meridian Capital:** DEGRADED — SQL generation fix (`fa9372dc`) committed but not confirmed deployed to Railway. Bug 0 fix (`6cfd6234`) committed — tool call spam now gone but Lane A regressed to narration-only (no data rendered). Lane B latency worsening: 164ms → 12,534ms → 22,695ms over 3 days. Distributions show $0 "Total Paid" (missing payout rows). AI test pass rate 33% (2/6) — unchanged since 2026-03-23.
- **MSA Rotation Engine:** OPERATIONAL — Tampa Water Street/Channel District brief completed (score 6.7/10). 14 backlog cards total. Top cards: MSA Research Sweep Runner (72.0) and County Assessor Connector (72.0).
- **Market Intelligence Engine:** ACTIVE — Regime RISK_OFF_DEFENSIVE (5th consecutive session). VIX improved to 22 (from 27). 4 new research segments published 2026-03-26.
- **Resume:** UNCONFIRMED — last confirmed healthy 2026-03-21

## Latest AI Test Results

| File | Date | Pass rate |
|---|---|---|
| `docs/ai-testing/2026-03-25.md` | 2026-03-25 | 33.3% — 2/6 passed. Test 1 regressed to narration-only (no data rendered). Bug 0 tool call spam FIXED (6cfd6234). Lane B latency worsening: 22.7s error recovery, 17.7s greeting. repe_fast_path still broken. |

**Bug 0 status:** FIX COMMITTED (`6cfd6234`) — tool call spam no longer visible in 2026-03-25 test. However, Lane A now returns narration-only (promises data but never renders it). The tool spam fix may have masked but not resolved the underlying data-fetch issue.

**Next P0:** (1) Merge auto branches to main and confirm Railway deploy. (2) Fix Lane A data rendering — model generates 1,439 tokens but UI shows only narration promise. (3) Investigate Lane B latency regression (context window bloat from "New Chat" not clearing state).

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
| `docs/ops-reports/digests/digest-2026-03-26.md` | 2026-03-26 |

## Active Meta Prompts (Build Directives)

| Meta Prompt | Status | Priority |
|---|---|---|
| `META_PROMPT_CHAT_WORKSPACE.md` | Active | Bug 0 re-emerging (tool call JSON leak in Lane A) → SQL generation fix → Lane B latency fix → chat workspace |
| `META_PROMPT_VISUAL_RESUME.md` | Active — needs career data | Build resume lab environment |

## Active Bugs

| Bug | Severity | Status | Location |
|---|---|---|---|
| Bug 0: Tool call spam in AI UI | CRITICAL | FIX COMMITTED (`6cfd6234`) — tool spam gone, but Lane A now narration-only (no data rendered) | `docs/ai-testing/2026-03-25.md` |
| Lane A narration-only (no data rendered) | CRITICAL | NEW — model generates 1,439 tokens but only narration promise shown | `docs/ai-testing/2026-03-25.md` |
| repe_fast_path SQL generation failure | CRITICAL | FIX COMMITTED (`fa9372dc`) — not confirmed deployed to Railway | `docs/ai-testing/2026-03-25.md` |
| Lane B total latency regression | HIGH | WORSENING — 164ms→12,534ms→22,695ms over 3 days | `docs/ai-testing/2026-03-25.md` |
| "New Chat" button doesn't clear conversation state | MEDIUM | NEW — may cause context bloat driving Lane B latency | `docs/ai-testing/2026-03-25.md` |
| Stone PDS: Client Satisfaction null guard | HIGH | ✅ FIXED and deployed | `docs/env-tasks/stone-pds/health/health-2026-03-25.md` |
| Stone PDS: Forecast "Total Deals: NaN" | MEDIUM | NEW — display bug | `docs/env-tasks/stone-pds/health/health-2026-03-25.md` |
| Stone PDS: NPS Score NaN | MEDIUM | NEW — calculation issue | `docs/env-tasks/stone-pds/health/health-2026-03-25.md` |
| Stone PDS: Schedule Health nav redirect | HIGH | OPEN — redirects to /pds/risk silently | `docs/env-tasks/stone-pds/health/health-2026-03-25.md` |
| Raw internal fund UUIDs exposed to users | LOW | OPEN | `docs/ai-testing/2026-03-25.md` |
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

- **Last rotation:** Tampa — Water Street/Channel District on 2026-03-26 — Score 6.7/10 (first rotation, Tier 1, mixed)
- **Pipeline status:** OPERATIONAL — brief ran, intelligence populated, feature cards generating
- **Feature backlog:** 14 cards total. Top cards: MSA Research Sweep Runner Phase 1 Automation (72.0) and County Assessor/Recorder Live Data Connector (72.0)
- **Latest intel:** `docs/msa-intel/tampa-water-st-2026-03-26.md`
- **Latest feature cards:** `docs/msa-features/cards-2026-03-25.md` (skipped — no new brief on 03-25)

## Market Rotation Engine

- **Regime:** RISK_OFF_DEFENSIVE (5th consecutive session, moderate confidence, classified 2026-03-22)
- **Key levels:** SPX ~6,506 (below 50-DMA 6,818 and 200-DMA 6,592); VIX 22 (improved from 27); HY spreads 3.19% (flat); DXY 99.6; BTC-SPX correlation 0.74 (highest of 2026)
- **Segments:** 34 active — 4 new research segments published 2026-03-26 (L2 Scaling, RWA Tokenization, Homebuilders, Liquidity Flows)
- **Pipeline status:** ACTIVE — regime reports + research segments producing daily output
- **Regime transition watchpoints:** VIX below 20, HY spreads narrowing, SPX reclaims 200-DMA
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

*Last updated: 2026-03-26 06:00 AM by morning-ops-digest. Manual edits are fine but will be overwritten on next run.*

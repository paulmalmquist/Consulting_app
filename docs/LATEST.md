# LATEST.md — Autonomous Intelligence Manifest
## Updated by: morning-ops-digest (6:00 AM weekdays)
## Read this file first in any new coding session.

> This manifest is machine-readable. It points to the most recent output from every scheduled task. A coding agent can read this one file and know the current state of all intelligence, operations, and test results.

---

## Production Status

| System | Status | Last checked |
|---|---|---|
| paulmalmquist.com | UP — homepage rendering, Winston branding visible, login buttons present | 2026-03-27 |
| novendor.ai | LIVE — full marketing site, "Put AI to Work" hero, 4 industry verticals, "Book strategy call" CTA | 2026-03-27 |
| Supabase | HEALTHY — 8 connections, 0 stuck, clean pool | 2026-03-24 |
| Vercel deploys | GREEN — consulting-app READY on `f56faa7` (Orlando MSA brief). 4 consecutive READY deploys on main. | 2026-03-27 |
| Railway | UP — backend health `{"ok": true}`, AI gateway healthy (gpt-5-mini, RAG available). SQL gen fix and Bug 0 fix deploy status still unconfirmed via direct Railway check. | 2026-03-27 |

## Environment Health

- **Stone PDS:** STABLE — 22/25 pages PASS (up from 13/14 after expanding coverage to 25 pages). All 11 newly tested pages pass. Null guards holding day 2-3. Three known bugs carry forward: Tech Adoption crash ("_ is not iterable" — P0), Forecast "Total Deals: NaN", Satisfaction "NPS Score: NaN". Schedule Health still redirects to /pds/risk.
- **Meridian Capital:** STALE — last health check 2026-03-24 (3 days ago). Known issues from that report (Distributions $0, investment sub-records missing) unverified. Railway deploy confirmation still needed. AI test pass rate was 33% (2/6) as of 2026-03-25 — 2026-03-26 test SKIPPED (Chrome auth failure).
- **MSA Rotation Engine:** OPERATIONAL — Orlando Creative Village/Parramore brief completed (score 5.8/10, first rotation). Previous: Tampa Water Street (6.7/10). 14 feature backlog cards, 3 new cards from gap detection. Top cards: MSA Research Sweep Runner (72.0) and County Assessor Connector (72.0).
- **Market Intelligence Engine:** ACTIVE — Regime RISK_OFF_DEFENSIVE (5th consecutive session). VIX 22 (improved from 27). 4 research segments published 2026-03-26 (L2 Scaling, RWA Tokenization, Homebuilders, Liquidity Flows).
- **Resume:** UNCONFIRMED — last confirmed healthy 2026-03-21

## Latest AI Test Results

| File | Date | Pass rate |
|---|---|---|
| `docs/ai-testing/2026-03-26.md` | 2026-03-26 | N/A — ALL 5 TESTS SKIPPED. Chrome extension authentication expired. Zero new test data. |
| `docs/ai-testing/2026-03-25.md` | 2026-03-25 | 33.3% — 2/6 passed (last actual test run). Lane A narration-only. repe_fast_path broken. Lane B latency 22.7s. |

**Bug 0 status:** FIX COMMITTED (`6cfd6234`) — tool call spam no longer visible in 2026-03-25 test. However, Lane A now returns narration-only (promises data but never renders it). 2026-03-26 test skipped — status unverified for 2 days.

**Chrome extension blocker:** Authentication expired overnight 2026-03-26. Must re-authenticate before tonight's 11 PM test run.

**Next P0:** (1) Re-authenticate Chrome extension. (2) Confirm Railway deploy of SQL gen + Bug 0 fixes. (3) Fix Lane A data rendering. (4) Investigate Lane B latency regression.

## Latest Code Quality

| File | Date | Overall score |
|---|---|---|
| `docs/ops-reports/code-quality/2026-03-21.md` | 2026-03-21 | C+ (first Saturday sweep) |

**Key findings:** 76 commits, 39 feature / 37 fix (near 1:1 ratio). Hardcoded API key needs rotation. Coding agent not running ruff/tsc before commits.

## Latest Feature Radar

| File | Date | Top pick |
|---|---|---|
| `docs/feature-radar/2026-03-24-noon.md` | 2026-03-24 | STALE — no new output in 3 days. Last top pick: Deal Room Mode (1M token context toggle). |

## Latest Competitor Intelligence

| File | Date | Top opportunity |
|---|---|---|
| `docs/competitor-research/daily-summary/2026-03-26.md` | 2026-03-26 | Dealpath Connect now has JLL+CBRE+Cushman (~65% institutional brokerage). Threat upgraded MEDIUM-HIGH. Juniper Square adding Nasdaq eVestment to AI CRM (summer 2026 GA). Yardi Virtuoso Agents + Claude Connector live. |

## Latest Sales Signals

| File | Date | Top prospect |
|---|---|---|
| `docs/revenue-ops/target-account-queue.md` | 2026-03-26 | Marcus Partners (Boston, $875M Fund V, score 4.25), Ardent Companies (Atlanta, $600M Fund VI credit, 3.75), GAIA Real Estate (NYC/Miami, local contact, 3.75) |

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
| `docs/ops-reports/digests/digest-2026-03-27.md` | 2026-03-27 |

## Active Meta Prompts (Build Directives)

| Meta Prompt | Status | Priority |
|---|---|---|
| `META_PROMPT_CHAT_WORKSPACE.md` | Active | Bug 0 re-emerging (tool call JSON leak in Lane A) → SQL generation fix → Lane B latency fix → chat workspace |
| `META_PROMPT_VISUAL_RESUME.md` | Active — needs career data | Build resume lab environment |

## Active Bugs

| Bug | Severity | Status | Location |
|---|---|---|---|
| Bug 0: Tool call spam in AI UI | CRITICAL | FIX COMMITTED (`6cfd6234`) — tool spam gone, but Lane A now narration-only (no data rendered). Unverified since 2026-03-25. | `docs/ai-testing/2026-03-25.md` |
| Lane A narration-only (no data rendered) | CRITICAL | OPEN — model generates 1,439 tokens but only narration promise shown. Unverified since 2026-03-25. | `docs/ai-testing/2026-03-25.md` |
| repe_fast_path SQL generation failure | CRITICAL | FIX COMMITTED (`fa9372dc`) — not confirmed deployed to Railway. Unverified since 2026-03-25. | `docs/ai-testing/2026-03-25.md` |
| Lane B total latency regression | HIGH | WORSENING — 164ms→12,534ms→22,695ms over 3 days. Unverified since 2026-03-25. | `docs/ai-testing/2026-03-25.md` |
| "New Chat" button doesn't clear conversation state | MEDIUM | OPEN — may cause context bloat driving Lane B latency | `docs/ai-testing/2026-03-25.md` |
| Stone PDS: Tech Adoption crash | P0 | NEW — "_ is not iterable" error, crash with error boundary | `docs/env-tasks/stone-pds/health/2026-03-26.md` |
| Stone PDS: Forecast "Total Deals: NaN" | MEDIUM | OPEN — display bug, day 2 | `docs/env-tasks/stone-pds/health/2026-03-26.md` |
| Stone PDS: NPS Score NaN | MEDIUM | OPEN — calculation issue, day 2 | `docs/env-tasks/stone-pds/health/2026-03-26.md` |
| Stone PDS: Schedule Health nav redirect | HIGH | OPEN — redirects to /pds/risk silently, day 4 | `docs/env-tasks/stone-pds/health/2026-03-26.md` |
| Stone PDS: Client Satisfaction null guard | HIGH | ✅ FIXED and deployed, holding day 2 | `docs/env-tasks/stone-pds/health/2026-03-26.md` |
| Raw internal fund UUIDs exposed to users | LOW | OPEN — day 6 | `docs/ai-testing/2026-03-25.md` |
| Meridian: Distributions Total Paid $0 | MEDIUM | OPEN — payout rows not seeded. Unverified since 2026-03-24. | `docs/env-tasks/meridian/health/health-2026-03-24.md` |
| Meridian: Investment sub-records missing | MEDIUM | OPEN — property_type, market, valuation, operating_data absent. Unverified since 2026-03-24. | `docs/env-tasks/meridian/health/health-2026-03-24.md` |
| Bug 1: Waterfall amounts unformatted | HIGH | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 2: Pref return / carry $0 | HIGH | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 3: Capital snapshots need manual click | MEDIUM | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 4: Reports default to wrong fund | MEDIUM | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 5: UW vs Actual all dashes | MEDIUM | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |

## Stale Scheduled Tasks (No Recent Output)

| Task | Expected Output | Last Output | Days Stale |
|---|---|---|---|
| nightly-ops-validator | `docs/ops-reports/regression/` | Never produced | ∞ |
| novendor-market-scanner | `docs/market-intel/` | Never produced | ∞ |
| product-feature-radar | `docs/feature-radar/` | 2026-03-24 | 3 |
| website-evolution-engine | `docs/site-improvements/` | 2026-03-22 | 5 |
| sales-positioning | `docs/sales-positioning/` | 2026-03-24 | 3 |

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

- **Last rotation:** Orlando — Creative Village/Parramore on 2026-03-27 — Score 5.8/10 (first rotation, Tier 1, mixed — strong macro/regulatory, heavy supply pipeline)
- **Previous rotation:** Tampa — Water Street/Channel District on 2026-03-26 — Score 6.7/10
- **Pipeline status:** OPERATIONAL — briefs running daily, intelligence populated, feature cards generating
- **Feature backlog:** 14 cards total. Top cards: MSA Research Sweep Runner Phase 1 Automation (72.0) and County Assessor/Recorder Live Data Connector (72.0)
- **Latest intel:** `docs/msa-intel/orlando-creative-2026-03-27.md`
- **Latest feature cards:** `docs/msa-features/cards-2026-03-26.md`

## Market Rotation Engine

- **Regime:** RISK_OFF_DEFENSIVE (5th consecutive session, moderate confidence, classified 2026-03-22)
- **Key levels:** SPX ~6,506 (below 50-DMA 6,818 and 200-DMA 6,592); VIX 22 (improved from 27); HY spreads 3.19% (flat); DXY 99.6; BTC-SPX correlation 0.74 (highest of 2026)
- **Segments:** 34 active — 4 new research segments published 2026-03-26 (L2 Scaling, RWA Tokenization, Homebuilders, Liquidity Flows)
- **Pipeline status:** ACTIVE — regime reports + research segments producing daily output
- **Regime transition watchpoints:** VIX below 20, HY spreads narrowing, SPX reclaims 200-DMA
- **Cross-vertical alerts:** Rate environment feeding into REPE cap rate models; credit spread widening relevant to credit decisioning module; capital rotating from private credit back to CRE (CNBC/BREIT signal)

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

*Last updated: 2026-03-27 06:00 AM by morning-ops-digest. Manual edits are fine but will be overwritten on next run.*

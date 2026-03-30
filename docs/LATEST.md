# LATEST.md — Autonomous Intelligence Manifest
## Updated by: morning-ops-digest (6:00 AM daily)
## Read this file first in any new coding session.

> This manifest is machine-readable. It points to the most recent output from every scheduled task. A coding agent can read this one file and know the current state of all intelligence, operations, and test results.

---

## Production Status

| System | Status | Last checked |
|---|---|---|
| paulmalmquist.com | UP — WinstonLoginPortal rendering, sign-in form, feature pills, build `bfF3N4pov0O3Xr2hn2WH9` | 2026-03-30 |
| novendor.ai | LIVE — full marketing site, "Put AI to Work" hero, 4 industry verticals, "Book strategy call" CTA | 2026-03-27 |
| Supabase | HEALTHY — ACTIVE_HEALTHY, 608 tables, 43 migrations, 99.98% cache hit, 0.19% rollback rate, 6 active backends, 0 new deadlocks | 2026-03-29 |
| Vercel deploys | GREEN — consulting-app READY on `4b5762b` ("fix: make home/theme/signout icons non-sticky"). High deploy velocity (~12 deploys in 24h). 3 ERROR deploys all resolved. Zero runtime errors, zero 500s. | 2026-03-30 |
| Railway | UP — backend health `{"ok": true}`, AI gateway healthy (gpt-5-mini, RAG available, enabled=true). | 2026-03-30 |

## Environment Health

- **Stone PDS:** STALE (last checked 03-27, 3 days) — Was 27/28 pages PASS. Three P0/P1 bugs FIXED and confirmed. **Demo-ready: YES (assumed, unverified 3 days).**
- **Meridian Capital:** STALE (last checked 03-27, 3 days) — Core pages load with real data across 3 funds. Distribution Total Paid fixed ($123.8M). AI Chat BROKEN (500 server error). Fund performance metrics contradictory. Investment sub-records still missing. **Demo-ready: LIMITED.**
- **MSA Rotation Engine:** ACTIVE — Nashville WeHo/Wedgewood-Houston brief (6.8/10, Tier 2, strong demand, supply risk near-term). 20 feature backlog cards (was 14). 2 new cards created.
- **Trading Lab:** ACTIVE — Regime RISK_OFF_DEFENSIVE (7th+ consecutive session). VIX 27.44 (elevated from Iran conflict). SPX ~6506 below both MAs. BTC-SPX correlation 0.74. Trading-lab Phase 1 build active. 4 ERROR deploys during dev resolved.
- **Resume:** UNCONFIRMED — last confirmed healthy 2026-03-21

## Latest AI Test Results

| File | Date | Pass rate |
|---|---|---|
| `docs/ai-testing/2026-03-29.md` | 2026-03-29 | N/A — ALL 5 TESTS SKIPPED. Chrome extension not connected. API fallback attempted (401 auth barrier). **5th consecutive night** without test data (03-26 through 03-29). |
| `docs/ai-testing/2026-03-25.md` | 2026-03-25 | 33.3% — 2/6 passed (last actual test run). Lane A narration-only. repe_fast_path broken. Lane B latency 22.7s. |

**Bug 0 status:** FIX COMMITTED (`6cfd6234`) — tool call spam no longer visible in 2026-03-25 test. However, Lane A now returns narration-only (promises data but never renders it). Status unverified for 5 days.

**Chrome extension blocker:** CRITICAL ESCALATION — Not connected since 2026-03-26. 5 consecutive nights without live AI test data. API-based test fallback attempted 03-29 — endpoints confirmed responsive, blocked only by auth token. Provisioning an API test token is the highest-leverage fix.

**Meridian AI Chat:** Returns "Failed to create conversation: 500" server error as of 2026-03-27 health check. Separate from Chrome extension issue. Unverified 3 days.

**Next P0:** (1) Provision API test token for autonomous tester. (2) Fix Meridian AI Chat 500 error. (3) Fix Lane A data rendering. (4) Investigate Lane B latency regression. (5) Patch Next.js CVE.

## Latest Code Quality

| File | Date | Overall score |
|---|---|---|
| `docs/ops-reports/code-quality/2026-03-28.md` | 2026-03-28 | C+ (unchanged from last week) |

**Key findings:** 96 commits this week, feature:fix ratio ~1.1:1 (no improvement). **SECURITY: Next.js critical CVE GHSA-f82v-jwr5-mffw (CVSS 9.1) — top priority.** 8 orphaned capital-projects components. Coding agent still not running ruff/tsc before commits. Mass deletion protection commit shows learning.

## Latest Feature Radar

| File | Date | Top pick |
|---|---|---|
| `docs/feature-radar/2026-03-27.md` | 2026-03-27 | Virtual CFO Mode for REPE Fund Managers (leverages existing REPE Finance + AI Gateway services). Also: Skills/workflow marketplace concept (inspired by OpenAI Skills launch). |

## Latest Competitor Intelligence

| File | Date | Top opportunity |
|---|---|---|
| `docs/competitor-research/daily-summary/2026-03-27.md` | 2026-03-27 | Juniper Square + Kudu Investment Management partnership (32 firms, ~$150B AUM, $1T LP capital on platform). Yardi antitrust: FPI settled $2.8M, judge denied dismissal, discovery active — REPE firms may be open to alternatives. |

## Latest Sales Signals

| File | Date | Top prospect |
|---|---|---|
| `docs/revenue-ops/target-account-queue.md` | 2026-03-27 | Marcus Partners (Boston, $875M Fund V, score 4.25), Canopy Real Estate Partners (Denver, $75M inaugural fund, 3.85), Ardent Companies (Atlanta, $600M Fund VI credit, 3.75), GAIA Real Estate (NYC/Miami, local contact, 3.75) |

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
| `docs/ops-reports/digests/digest-2026-03-30.md` | 2026-03-30 |

## Active Meta Prompts (Build Directives)

| Meta Prompt | Status | Priority |
|---|---|---|
| `META_PROMPT_CHAT_WORKSPACE.md` | Active | Bug 0 re-emerging (tool call JSON leak in Lane A) → SQL generation fix → Lane B latency fix → chat workspace |
| `META_PROMPT_VISUAL_RESUME.md` | Active — needs career data | Build resume lab environment |

## Active Bugs

| Bug | Severity | Status | Location |
|---|---|---|---|
| AI test infrastructure (Chrome ext + no API token) | CRITICAL | BLOCKED — 5 consecutive nights without test data. API fallback attempted, needs auth token. | `docs/ai-testing/2026-03-29.md` |
| Bug 0: Tool call spam in AI UI | CRITICAL | FIX COMMITTED (`6cfd6234`) — tool spam gone, but Lane A now narration-only (no data rendered). Unverified since 2026-03-25. | `docs/ai-testing/2026-03-25.md` |
| Lane A narration-only (no data rendered) | CRITICAL | OPEN — model generates 1,439 tokens but only narration promise shown. Unverified since 2026-03-25. | `docs/ai-testing/2026-03-25.md` |
| repe_fast_path SQL generation failure | CRITICAL | FIX COMMITTED (`fa9372dc`) — not confirmed deployed to Railway. Unverified since 2026-03-25. | `docs/ai-testing/2026-03-25.md` |
| Next.js CVE GHSA-f82v-jwr5-mffw | CRITICAL | NEW — CVSS 9.1, needs immediate patching | `docs/ops-reports/code-quality/2026-03-28.md` |
| Meridian: AI Chat 500 error | CRITICAL | OPEN — "Failed to create conversation: 500" server error. Unverified 3 days. | `docs/env-tasks/meridian/health/health-2026-03-27.md` |
| Lane B total latency regression | HIGH | WORSENING — 164ms→12,534ms→22,695ms over 3 days. Unverified since 2026-03-25. | `docs/ai-testing/2026-03-25.md` |
| Meridian: Fund performance metric contradictions | HIGH | OPEN — TVPI 0.21x on page vs 2.59x in AI summary on same page | `docs/env-tasks/meridian/health/health-2026-03-27.md` |
| "New Chat" button doesn't clear conversation state | MEDIUM | OPEN — may cause context bloat driving Lane B latency | `docs/ai-testing/2026-03-25.md` |
| Stone PDS: Tech Adoption crash | P0 | ✅ FIXED — confirmed working 2026-03-27 | `docs/env-tasks/stone-pds/health/2026-03-27.md` |
| Stone PDS: Forecast "Total Deals: NaN" | MEDIUM | ✅ FIXED — now shows 202 deals, confirmed 2026-03-27 | `docs/env-tasks/stone-pds/health/2026-03-27.md` |
| Stone PDS: NPS Score NaN | MEDIUM | ✅ FIXED — now shows +42, confirmed 2026-03-27 | `docs/env-tasks/stone-pds/health/2026-03-27.md` |
| Stone PDS: Schedule Health nav redirect | HIGH | ✅ FIXED — renders own page with SPI data, confirmed 2026-03-27 | `docs/env-tasks/stone-pds/health/2026-03-27.md` |
| Stone PDS: Client Satisfaction null guard | HIGH | ✅ FIXED and deployed, holding day 5 | `docs/env-tasks/stone-pds/health/2026-03-27.md` |
| Meridian: Distributions Total Paid $0 | MEDIUM | ✅ FIXED — now shows $123.8M, confirmed 2026-03-27 | `docs/env-tasks/meridian/health/health-2026-03-27.md` |
| Meridian: Investment sub-records missing | MEDIUM | OPEN — property_type, market, valuation, operating_data still absent | `docs/env-tasks/meridian/health/health-2026-03-27.md` |
| Raw internal fund UUIDs exposed to users | LOW | OPEN — day 9 | `docs/ai-testing/2026-03-25.md` |
| Bug 1: Waterfall amounts unformatted | HIGH | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 2: Pref return / carry $0 | HIGH | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 3: Capital snapshots need manual click | MEDIUM | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 4: Reports default to wrong fund | MEDIUM | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |
| Bug 5: UW vs Actual all dashes | MEDIUM | OPEN | `META_PROMPT_CHAT_WORKSPACE.md` |

## Stale Scheduled Tasks (No Recent Output)

| Task | Expected Output | Last Output | Days Stale |
|---|---|---|---|
| novendor-market-scanner | `docs/market-intel/` | Never produced | ∞ |
| website-evolution-engine | `docs/site-improvements/` | 2026-03-22 | 8 |
| sales-positioning | `docs/sales-positioning/` | 2026-03-24 | 6 |
| competitor-reverse-engineering | `docs/competitor-research/` | 2026-03-27 | 3 |
| sales-signal-discovery | `docs/sales-signals/` | 2026-03-27 | 3 |
| product-feature-radar | `docs/feature-radar/` | 2026-03-27 | 3 |
| demo-idea-generator | `docs/demo-ideas/` | 2026-03-27 | 3 |
| linkedin-content-generator | `docs/linkedin-content/` | 2026-03-27 | 3 |
| morning-business-intel-brief | `docs/daily-intel/` | 2026-03-27 | 3 |

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

- **Last rotation:** Nashville — WeHo/Wedgewood-Houston on 2026-03-29 — Score 6.8/10 (Tier 2, strong demand drivers, near-term supply risk)
- **Previous rotation:** Jacksonville — Brooklyn/LaVilla on 2026-03-28 — Score 5.2/10 (Tier 2, demand story with supply caution)
- **Pipeline status:** OPERATIONAL — briefs running daily, intelligence populated, feature cards generating
- **Feature backlog:** 20 cards total (was 14). Top cards: MSA Research Sweep Runner Phase 1 Automation (72.0) and County Assessor/Recorder Live Data Connector (72.0). 2 new cards: Development Pipeline Spatial Map (24.0) and OZ Capital Flow Tracker (9.0).
- **Latest intel:** `docs/msa-intel/nash-weho-2026-03-29.md`
- **Latest feature cards:** `docs/msa-features/cards-2026-03-29.md`

## Market Rotation Engine

- **Regime:** RISK_OFF_DEFENSIVE (7th+ consecutive session, high confidence, classified 2026-03-22)
- **Key levels:** SPX ~6,506 (below 50-DMA 6,570 and 200-DMA 6,750); VIX 27.44 (elevated, Iran conflict); HY spreads 3.17%; DXY 100.21; BTC-SPX correlation 0.74
- **Segments:** 34+ active — 4 new research segments published 2026-03-28 (regime-btc, options-flow, defense-space, rates-curve)
- **Pipeline status:** ACTIVE — regime reports + research segments producing daily output
- **Regime transition watchpoints:** VIX below 20, HY spreads narrowing, SPX reclaims 200-DMA, Iran de-escalation catalyst
- **Cross-vertical alerts:** Rate environment feeding into REPE cap rate models; credit spread widening relevant to credit decisioning module; capital rotating from private credit back to CRE (CNBC/BREIT signal); family offices increasing CRE allocation (CNBC/JPM)

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

*Last updated: 2026-03-30 06:00 AM by morning-ops-digest. Manual edits are fine but will be overwritten on next run.*

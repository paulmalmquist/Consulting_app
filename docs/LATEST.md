# LATEST.md — Autonomous Intelligence Manifest
## Updated by: morning-ops-digest (7:30 AM weekdays)
## Read this file first in any new coding session.

> This manifest is machine-readable. It points to the most recent output from every scheduled task. A coding agent can read this one file and know the current state of all intelligence, operations, and test results.

---

## Production Status

| System | Status | Last checked |
|---|---|---|
| paulmalmquist.com | UP — login page rendering, all authenticated pages pass | 2026-03-23 |
| novendor.ai | LIVE — full marketing site, "Put AI to Work" hero, 4 industry verticals | 2026-03-22 |
| Supabase | HEALTHY — 8 connections, 0 stuck, clean pool | 2026-03-22 |
| Vercel deploys | GREEN — consulting-app READY (daily-brief 2026-03-22); floyorker ERROR (separate project) | 2026-03-22 |

## Environment Health

- **Stone PDS:** DEGRADED — missing `pds_business_lines` table blocks Home, Markets, Projects pages; 2 PASS, 6 FAIL
- **Meridian Capital:** DEGRADED — fund IRR/TVPI data contradiction; intent fix committed but not deployed; AI analytics broken in production
- **MSA Rotation Engine:** BLOCKED — pipeline cold start, Phase 1 sweep has never run; 5 feature cards queued (3 prompted, 2 specced, 0 built)
- **Market Intelligence Engine:** PROVISIONED — 34 segments seeded, regime classified as RISK_OFF_DEFENSIVE, frontend page built, 8 fin-* tasks live. First real research sweep pending.
- **Resume:** UP — last confirmed healthy 2026-03-21

## Latest AI Test Results

| File | Date | Pass rate |
|---|---|---|
| `docs/ai-testing/2026-03-22.md` | 2026-03-22 | 16.7% — 1/6 passed. repe_fast_path still broken in production (fix committed, not deployed). Chat pipeline now explicit config error vs. silent fail. |

**Bug 0 status:** FIXED — commit `658bb74` pushed; no raw tool names in conversation body per 2026-03-21 smoke test.

**Fast-path fix committed, NOT deployed:** `repe_intent.py` commit `e6c9f0a` lowers chart-keyword dashboard score 0.90→0.65, boosts analytics to 0.88. Recovers Tests 2, 3, 4 once deployed. P0 action today.

## Latest Code Quality

| File | Date | Overall score |
|---|---|---|
| `docs/ops-reports/code-quality/2026-03-21.md` | 2026-03-21 | C+ (first Saturday sweep) |

**Key findings:** 76 commits, 39 feature / 37 fix (near 1:1 ratio). Hardcoded API key needs rotation. Coding agent not running ruff/tsc before commits.

## Latest Feature Radar

| File | Date | Top pick |
|---|---|---|
| `docs/feature-radar/2026-03-22.md` | 2026-03-22 | Predictive Investor Comm Parsing (enhancement, Signal 4/5 — Juniper Square shipping same feature post-$1.1B raise) |

## Latest Competitor Intelligence

| File | Date | Top opportunity |
|---|---|---|
| `docs/competitor-research/daily-summary/2026-03-22.md` | 2026-03-22 | Dealpath AI Studio (Medium-High threat); ARGUS portfolio scenarios (Medium, direct overlap); Autodesk ACC→Forma rebrand March 24 |

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
| `docs/ops-reports/digests/winston-daily-brief-2026-03-24.md` | 2026-03-24 |

## Active Meta Prompts (Build Directives)

| Meta Prompt | Status | Priority |
|---|---|---|
| `META_PROMPT_CHAT_WORKSPACE.md` | Active | Bug 0 (execution narration) → then chat workspace → then response blocks |
| `META_PROMPT_VISUAL_RESUME.md` | Active — needs career data | Build resume lab environment |

## Active Bugs

| Bug | Severity | Status | Location |
|---|---|---|---|
| Bug 0: Tool call spam in AI UI | CRITICAL | FIXED — commit `658bb74` deployed | `META_PROMPT_CHAT_WORKSPACE.md` |
| repe_fast_path empty dashboards | CRITICAL | FIX COMMITTED not deployed — `e6c9f0a` in `repe_intent.py` | `docs/ai-testing/2026-03-22.md` |
| Stone PDS: missing `pds_business_lines` | CRITICAL | OPEN — migration needed, blocks 3+ pages | `docs/env-tasks/stone-pds/health/health-2026-03-22.md` |
| Meridian: fund IRR/TVPI data contradiction | HIGH | OPEN — -98.9% IRR vs 14-17% per-asset | `docs/env-tasks/meridian/health/health-2026-03-22.md` |
| Raw internal fund UUIDs exposed to users | HIGH | OPEN | `docs/ai-testing/2026-03-22.md` |
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

- **Last rotation:** None — pipeline cold start (Phase 1 `msa-research-sweep` has never run)
- **Pipeline status:** ⚠️ BLOCKED — all 14 zones have `last_rotated_at = NULL`, `msa_zone_intel_brief` table empty (0 rows confirmed 2026-03-23)
- **Feature backlog:** 5 cards total — 3 prompted (ready to build), 2 specced, 0 built
- **Top blocker card:** `b1620471-msa-research-sweep-runner.md` (Priority 72) — build this first; it unblocks the entire pipeline
- **Next cards:** County Assessor Connector (65), Sub-MSA Score Calculator (60)
- **Latest digest:** `docs/msa-digests/msa-digest-2026-03-22.md`
- **Expected first zone (when unblocked):** Miami — Wynwood/Edgewater

## Market Rotation Engine

- **Regime:** RISK_OFF_DEFENSIVE (high confidence, classified 2026-03-22)
- **Trigger:** SPX broke 200-day MA; VIX 26.78; HY spreads 320 bps; DXY ~99.5; BTC-SPX correlation rebounding
- **Segments:** 34 active (16 equities, 8 crypto, 4 derivatives, 6 macro) — all awaiting first rotation
- **Pipeline status:** PROVISIONED — schema 419 applied, segments seeded, 8 fin-* tasks scheduled, frontend built
- **First rotation targets (by overdue ratio):** BTC On-Chain Regime, ETH Ecosystem Health, Equity Options Flow, Crypto Derivatives Flow
- **Feature cards:** 0 (pipeline hasn't produced research briefs yet)
- **Latest digest:** `docs/market-digests/` (awaiting first rotation digest)
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

*Last updated: 2026-03-24 by Cowork session. Manual edits are fine but will be overwritten on next run.*

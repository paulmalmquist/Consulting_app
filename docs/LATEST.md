# LATEST.md — Autonomous Intelligence Manifest
## Updated by: morning-ops-digest (7:30 AM weekdays)
## Read this file first in any new coding session.

> This manifest is machine-readable. It points to the most recent output from every scheduled task. A coding agent can read this one file and know the current state of all intelligence, operations, and test results.

---

## Production Status

| System | Status | Last checked |
|---|---|---|
| paulmalmquist.com | UP — login page rendering | 2026-03-22 |
| novendor.ai | Placeholder ("Launching Soon") | 2026-03-19 |
| Supabase | UNKNOWN | [pending first ops run] |
| Vercel deploys | UNKNOWN | [pending first ops run] |

## Latest AI Test Results

| File | Date | Pass rate |
|---|---|---|
| `docs/ai-testing/2026-03-21.md` | 2026-03-21 | 16.7% — 1/6 passed. Chrome extension reconnected. repe_fast_path pipeline critically broken (empty dashboards). |

**Bug 0 status:** FIX COMMITTED (unpushed) — commit `658bb74` on local main fixes raw tool call spam across 4 files. Needs `git push origin main` after removing stale `.git/index.lock`.

**NEW — Fast-path pipeline broken:** `repe_fast_path` (Lane F) returns 0 tokens, 0 tools for all data queries. Creates empty dashboard shells. This is now the top priority — it breaks the core demo flow.

## Latest Code Quality

| File | Date | Overall score |
|---|---|---|
| `docs/ops-reports/code-quality/2026-03-21.md` | 2026-03-21 | C+ (first Saturday sweep) |

**Key findings:** 76 commits, 39 feature / 37 fix (near 1:1 ratio). Hardcoded API key needs rotation. Coding agent not running ruff/tsc before commits.

## Latest Feature Radar

| File | Date | Top pick |
|---|---|---|
| `docs/feature-radar/` | 2026-03-19 | AI Decision Audit Trail (EU AI Act compliance, priority 9/10) |

## Latest Competitor Intelligence

| File | Date | Top opportunity |
|---|---|---|
| `docs/competitor-research/daily-summary/` | 2026-03-19 | [check file for details] |

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
| `docs/ops-reports/digests/winston-daily-brief-2026-03-22.md` | 2026-03-22 |

## Active Meta Prompts (Build Directives)

| Meta Prompt | Status | Priority |
|---|---|---|
| `META_PROMPT_CHAT_WORKSPACE.md` | Active | Bug 0 (execution narration) → then chat workspace → then response blocks |
| `META_PROMPT_VISUAL_RESUME.md` | Active — needs career data | Build resume lab environment |

## Active Bugs

| Bug | Severity | Status | Location |
|---|---|---|---|
| Bug 0: Tool call spam in AI UI | CRITICAL | FIX COMMITTED (unpushed `658bb74`) | `META_PROMPT_CHAT_WORKSPACE.md` |
| NEW: repe_fast_path empty dashboards | CRITICAL | OPEN | `docs/ai-testing/2026-03-21.md` |
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

## How to Use This File

1. **Starting a coding session?** Read this file first. Check the bug list and production status.
2. **Building a new feature?** Check `docs/CAPABILITY_INVENTORY.md` and the feature radar before starting.
3. **Fixing a bug?** Check the AI test results and deploy smoke test for latest regression status.
4. **Doing cleanup?** Check the code quality sweep for the prioritized list.
5. **Preparing for a sales call?** Check sales signals, competitor positioning, and demo ideas.
6. **Writing content?** Check LinkedIn content and site improvements for the latest angles.
7. **Suggesting new features?** Read `docs/CAPABILITY_INVENTORY.md` FIRST to avoid recommending things that already exist.

---

*Last updated: 2026-03-22 by morning-ops-digest. Manual edits are fine but will be overwritten on next run.*

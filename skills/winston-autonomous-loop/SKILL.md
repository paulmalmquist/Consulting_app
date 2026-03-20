---
name: winston-autonomous-loop
description: Set up a fully autonomous intelligence → analysis → coding → verification loop for any new Winston environment, feature, or self-improving application. Creates scheduled tasks for research, competitive scanning, feature radar, autonomous coding sessions with follow-up, deploy verification, and weekly self-assessment — all wired together with a capability inventory and LATEST.md manifest so nothing gets suggested twice and coding agents have full context. Use when Paul says "set up autonomous improvement for X", "make X self-improving", "create an autonomous loop for X", "schedule autonomous coding for X", or when building any new Winston lab environment that should evolve on its own.
---

# Winston Autonomous Loop

This skill sets up a complete autonomous intelligence-to-code pipeline for any new Winston environment, feature domain, or self-improving application. The loop runs indefinitely with zero human intervention for routine work, while producing a weekly audit report for Paul to review.

## What This Skill Produces

A fully wired autonomous system with these layers:

1. **Intelligence Layer** — Scheduled tasks that gather market signals, competitor intel, and domain-specific research
2. **Analysis Layer** — Tasks that cross-reference findings against what's already built and produce prioritized recommendations
3. **Coding Layer** — A daily coding session that picks the top priority and implements it, plus a follow-up session that verifies and completes
4. **Verification Layer** — Deploy smoke tests and overnight validators that confirm what was built actually works
5. **Self-Assessment Layer** — A weekly deep audit that reviews coding agent performance and suggests improvements to the loop itself
6. **Deduplication Infrastructure** — A capability inventory and intelligence manifest that prevent the system from suggesting or building things that already exist

## Architecture

Read `references/architecture.md` for the full timing diagram, model tier assignments, and data flow between tasks.

## Setup Process

When triggered, follow these steps in order:

### Step 1: Define the Domain

Ask Paul (or infer from context) what the autonomous loop is for. Examples:
- A new Winston lab environment (e.g., stock monitoring, retail analytics, healthcare ops)
- An existing environment that needs autonomous improvement
- A standalone self-improving application

Capture:
- **Domain name** — what to call this loop (e.g., "stock-monitor", "retail-analytics")
- **Objective** — what the loop should optimize for (e.g., "expand stock screening capabilities", "improve retail dashboard accuracy")
- **Repo location** — where the code lives (existing repo path or new environment to create)
- **Data sources** — what to scan for intelligence (industry newsletters, competitor products, APIs, market data)
- **Success criteria** — how to know the loop is working (tests passing, features shipping, user engagement)

### Step 2: Create the Capability Inventory

Create `docs/{domain}-capability-inventory.md` following the pattern in `docs/CAPABILITY_INVENTORY.md`:

1. Scan the repo location for existing code, routes, services, components, and schemas
2. Catalog everything that's already built
3. Organize by domain subsystem
4. Include a "What NOT to Suggest Building" section for common false positives
5. Include the "How Scheduled Tasks Should Use This File" footer

### Step 3: Create the Intelligence Manifest

Create or update `docs/LATEST.md` to include the new domain's section:

- Production status
- Latest test results
- Active bugs
- Feature radar for this domain
- Pointer to the domain capability inventory

### Step 4: Create Scheduled Tasks

Create tasks in this order, using the timing template from `references/architecture.md`. Adjust times to avoid conflicts with existing tasks (read the current schedule first via `list_scheduled_tasks`).

#### Overnight Tier (verification)
- **{domain}-health-check** — Tour the live application/environment and verify it works. Write results to `docs/ops-reports/{domain}/`. [sonnet/medium]
- **{domain}-test-suite** — Run domain-specific tests (API endpoints, data pipelines, UI rendering). Write pass/fail to `docs/{domain}-testing/`. [sonnet/medium]

#### Morning Tier (intelligence gathering)
- **{domain}-market-scanner** — Web search for domain-relevant news, tools, APIs, competitor moves. Write to `docs/{domain}-intel/`. [haiku/low]
- **{domain}-competitor-tracker** — Track competitors in this domain space. Must read capability inventory first. Write to `docs/{domain}-competitors/`. [sonnet/low]

#### Midday Tier (analysis + prioritization)
- **{domain}-feature-radar** — Translate intelligence into prioritized feature ideas. Must read capability inventory first. Classify as NET-NEW / ENHANCEMENT / SKIP. Write to `docs/{domain}-features/`. [sonnet/medium]
- **{domain}-improvement-audit** — Evaluate existing capabilities for UX, performance, edge cases. Must read capability inventory. Write to `docs/{domain}-improvements/`. [sonnet/medium]

#### Afternoon Tier (coding)
- **{domain}-coding-session** — Read all intelligence, pick highest priority task, plan and implement it, commit and push. Follow the autonomous-coding-session pattern from `references/coding-session-prompt.md`. [opus/high + plan mode]
- **{domain}-coding-followup** — 2 hours after coding session. Verify what was built, complete or fix. Follow the coding-session-followup pattern from `references/followup-prompt.md`. [opus/high]

#### Morning After (verification)
- **{domain}-deploy-verify** — Verify yesterday's coding push. Hit endpoints, check for regressions. Write to `docs/ops-reports/{domain}/`. [sonnet/low]
- **{domain}-digest** — Read all overnight + verification results, update the domain section in LATEST.md and refresh the domain capability inventory. [sonnet/medium]

#### Weekly (self-assessment)
- **{domain}-weekly-audit** — Saturday deep audit. Review all coding sessions, task output quality, dedup compliance, and suggest improvements. Follow the weekly-code-quality-sweep pattern from `references/weekly-audit-prompt.md`. [opus/high]

### Step 5: Wire Into CLAUDE.md

Add the new domain to CLAUDE.md:

1. Add an entry to the **Intent Taxonomy** table
2. Add entries to the **Owning-Surface Map** for the domain's repo paths
3. Add the domain's intelligence folders to the **Intelligence Folder Map**
4. Update the **Agent Context Rule** if the domain has special context requirements
5. Add routing examples to the **Concrete Routing Examples** section

### Step 6: Create the Domain Skill

Create `skills/winston-{domain}/SKILL.md` as a focused skill for coding agents working in this domain. It should:

1. Reference the domain capability inventory
2. Describe the domain's repo structure and patterns
3. List the domain's MCP tools (if any)
4. Define acceptance criteria for domain-specific work
5. Point to the intelligence folders for context

### Step 7: First Run

Trigger each task once manually ("Run now") in this order to pre-approve tool permissions:

1. Health check (needs browser tools)
2. Market scanner (needs web search)
3. Deploy verify (needs Vercel/Supabase tools)
4. Coding session (needs git, bash, read, edit)
5. Follow-up (needs git, bash, read, edit)

### Step 8: Verify the Loop

After first run, check:
- Does the capability inventory exist and accurately reflect what's built?
- Does LATEST.md have the domain section?
- Did the market scanner produce useful output?
- Did the coding session pick the right priority?
- Did the follow-up correctly assess the coding session's work?
- Is CLAUDE.md updated with the new routing?

## Model Tier Reference

| Task type | Model | Effort | Plan mode |
|---|---|---|---|
| Health checks, deploy verification | `sonnet` | `low` | No |
| Market scanning, competitor tracking | `haiku` or `sonnet` | `low` | No |
| Feature radar, improvement audit, digests | `sonnet` | `medium` | No |
| Content generation (posts, copy) | `sonnet` | `medium` | No |
| Coding sessions | `opus` | `high` | Yes |
| Weekly deep audit | `opus` | `high` | No |

## Prompt Templates

All task prompt templates are in `references/`. Read the appropriate template and customize it for the domain before creating each scheduled task:

- `references/architecture.md` — Full timing diagram and data flow
- `references/coding-session-prompt.md` — Template for the autonomous coding task
- `references/followup-prompt.md` — Template for the follow-up/fix task
- `references/weekly-audit-prompt.md` — Template for the Saturday self-assessment
- `references/intelligence-prompt.md` — Template for scanner/tracker tasks
- `references/feature-radar-prompt.md` — Template for analysis/prioritization tasks

## Self-Improvement

The weekly audit task is the self-improvement engine. It:
1. Reviews what the coding agent built this week
2. Checks if it was the right priority
3. Checks if the code actually works
4. Evaluates whether intelligence tasks are producing useful signal
5. Recommends improvements to task prompts, timing, and priorities
6. Suggests new tasks to create or existing tasks to retire

Paul reviews the audit report. Over time, the loop gets tighter — better priorities, fewer duplicate suggestions, higher code quality, more accurate intelligence.

## Example: Stock Monitoring Application

If Paul says "set up a self-improving stock monitoring app":

1. Domain: `stock-monitor`
2. Objective: "Build and continuously improve a stock screening, alerting, and analysis environment"
3. Repo location: `repo-b/src/app/lab/env/[envId]/stock-monitor/` + `backend/app/services/stock_*.py`
4. Data sources: Financial news APIs, SEC filings, competitor fintech tools (Bloomberg Terminal, Koyfin, TradingView)
5. Success criteria: Screening accuracy, alert latency, coverage breadth

Tasks created:
- `stock-monitor-health-check` (midnight) — verify the environment loads, API connections work
- `stock-monitor-market-scanner` (6:30 AM) — scan fintech news for new data sources, APIs, screening techniques
- `stock-monitor-competitor-tracker` (8 AM) — track Bloomberg, Koyfin, TradingView feature releases
- `stock-monitor-feature-radar` (noon) — prioritize new screening features, alert types, chart capabilities
- `stock-monitor-coding-session` (3 PM) — build the top-priority feature
- `stock-monitor-coding-followup` (5 PM) — verify and complete
- `stock-monitor-deploy-verify` (5:30 AM next day) — smoke test
- `stock-monitor-digest` (6 AM next day) — refresh LATEST.md
- `stock-monitor-weekly-audit` (Saturday 4 AM) — self-assessment

The app starts with whatever Paul seeds it with, then improves itself every weekday — adding new stock screeners, better alerts, more data sources, improved charts — with Paul reviewing the weekly audit to steer direction.

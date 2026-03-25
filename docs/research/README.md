# docs/research — Deep Research Inbox

This directory holds deep research reports that feed into the Winston implementation pipeline.

## Workflow

```
ChatGPT Deep Research (external)
        │
        ▼
docs/research/<slug>.md   ← paste report here using template.md
        │
        ▼
research-architect skill   ← Winston reads and extracts structured plan
        │
        ▼
feature-dev skill / orchestration engine   ← implements the plan
```

## Files

| File | Purpose |
|---|---|
| `template.md` | Blank report template — copy this for each new report |
| `*.md` (other) | Completed research reports |

## Naming convention

`YYYY-MM-DD-<slug>.md`
Example: `2026-03-11-recharts-vs-tremor-dashboard.md`

## Status field

Each report has a `Status:` field in its header:
- `draft` — still being written / pasted in
- `ready` — complete, waiting for research-architect to process
- `ingested` — research-architect has generated a plan from this report

## Quick commands (Telegram)

```
# Quick web lookup (uses OpenClaw web tools directly)
@winston search: what does Recharts v3 change about axes?

# Flag a heavyweight research task for ChatGPT Deep Research
@winston deep research needed: compare REPE waterfall calculation libraries

# Ingest a completed report
@winston ingest research: docs/research/2026-03-11-waterfall-libs.md

# Turn a report into a build plan
@winston build plan from: docs/research/2026-03-11-waterfall-libs.md
```

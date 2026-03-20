# Autonomous Loop Architecture

## Timing Diagram

The daily sequence is designed so each layer's output feeds the next layer's input. No task runs on stale data.

```
OVERNIGHT — detect problems
  12:00 AM  {domain}-health-check           [sonnet/medium]
   2:00 AM  {domain}-test-suite             [sonnet/medium]

EARLY MORNING — verify yesterday's code
   5:30 AM  {domain}-deploy-verify          [sonnet/low]
   6:00 AM  {domain}-digest                 [sonnet/medium]
            → refreshes LATEST.md + {domain}-capability-inventory.md
            ← ALL downstream tasks now read fresh data

MORNING — gather intelligence
   6:30 AM  {domain}-market-scanner          [haiku/low]
   8:00 AM  {domain}-competitor-tracker      [sonnet/low]

MIDDAY — analyze + prioritize
  12:00 PM  {domain}-feature-radar           [sonnet/medium]
   1:00 PM  {domain}-improvement-audit       [sonnet/medium]

AFTERNOON — act on intelligence
   3:00 PM  {domain}-coding-session          [opus/high + plan mode]
   5:00 PM  {domain}-coding-followup         [opus/high]

SATURDAY — self-assessment
   4:00 AM  {domain}-weekly-audit            [opus/high]
```

## Data Flow

```
health-check ──→ docs/ops-reports/{domain}/
test-suite ────→ docs/{domain}-testing/
                     ↓
deploy-verify ─→ docs/ops-reports/{domain}/
                     ↓
digest ────────→ docs/LATEST.md (domain section)
               → docs/{domain}-capability-inventory.md
                     ↓ (all downstream tasks read these)
market-scanner → docs/{domain}-intel/
competitor ───→ docs/{domain}-competitors/
                     ↓
feature-radar → docs/{domain}-features/
improvement ──→ docs/{domain}-improvements/
                     ↓
coding-session → code changes + git push
               → docs/ops-reports/coding-sessions/{domain}-{date}.md
                     ↓
coding-followup → fixes/completions + git push
                → docs/ops-reports/coding-sessions/{domain}-followup-{date}.md
                     ↓ (next morning)
deploy-verify ─→ verifies the push worked
digest ────────→ updates LATEST.md with results
                     ↓ (Saturday)
weekly-audit ──→ docs/ops-reports/{domain}-audit/{date}.md
               → recommendations for next week
```

## Model Tier Rationale

**haiku/low** — Tasks that are essentially "web search + summarize." No complex reasoning, no code generation, no cross-referencing. Pure information gathering.

**sonnet/low** — Tasks that check pass/fail conditions (deploy verification, endpoint health). Binary outcomes, minimal reasoning.

**sonnet/medium** — Tasks that need to synthesize multiple inputs, write coherent prose, or make judgment calls (feature radar, competitor analysis, content generation, digests). Not coding, but needs quality reasoning.

**opus/high + plan mode** — Tasks that write production code. Plan mode forces a plan-before-code approach. High effort enables deep reasoning about architecture, patterns, and edge cases. These are the expensive tasks — only the coding session and its follow-up should use this tier.

**opus/high (no plan mode)** — The weekly audit. Needs Opus-level reasoning to evaluate code quality and make improvement recommendations, but isn't writing code, so plan mode adds no value.

## Conflict Avoidance

When creating tasks for a new domain, check the existing schedule first (`list_scheduled_tasks`). Stagger new tasks by at least 30 minutes from existing ones to avoid resource contention. The overnight and early morning slots (12 AM – 6 AM) are most flexible for new domains.

## Folder Structure

Each domain gets its own intelligence folders:

```
docs/
├── LATEST.md                          ← updated by digest
├── CAPABILITY_INVENTORY.md            ← global inventory
├── {domain}-capability-inventory.md   ← domain-specific inventory
├── {domain}-intel/                    ← market scanner output
├── {domain}-competitors/              ← competitor tracker output
├── {domain}-features/                 ← feature radar output
├── {domain}-improvements/             ← improvement audit output
├── {domain}-testing/                  ← test suite output
└── ops-reports/
    ├── {domain}/                      ← health check + deploy verify
    ├── coding-sessions/               ← coding session + followup reports
    └── {domain}-audit/                ← weekly audit reports
```

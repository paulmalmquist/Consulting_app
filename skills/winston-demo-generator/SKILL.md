---
id: winston-demo-generator
kind: skill
status: active
source_of_truth: true
topic: demo-generation
owners:
  - docs
  - cross-repo
intent_tags:
  - demo
  - sales
  - ops
triggers:
  - generate demo ideas
  - demo concepts for Winston
  - demo script
  - demo pipeline
  - what demos should we run
  - sales demo ideas
  - demo for this week
  - build me a demo
  - what should we demo to [persona]
  - demo idea generator
entrypoint: true
handoff_to:
  - novendor-demo
  - novendor-outreach
when_to_use: "Use when the task is to generate concrete Winston demo concepts — with a flow, wow moment, build status, and sales angle — grounded in today's market context."
when_not_to_use: "Do not use for building the actual demo environment or seeding demo data — hand off to agents/demo.md or agents/lab-environment.md once the concept is approved."
surface_paths:
  - docs/demo-ideas/
  - docs/feature-radar/
  - docs/daily-intel/
---

# Winston Demo Generator

Use this skill when the task is to generate ready-to-build demo scripts for Winston sales calls, conference presentations, or the Demo Lab environment.

## Load Order

1. Check for today's feature radar: `docs/feature-radar/[TODAY YYYY-MM-DD].md`
2. Check for today's morning intel brief: `docs/daily-intel/[TODAY YYYY-MM-DD].md`
3. If neither exists, run a web search: `"enterprise AI automation demo ideas [YEAR]"`
4. Review prior demo output for context: `docs/demo-ideas/` (latest file)

## Winston Platform Context

Winston runs at `paulmalmquist.com/lab/env/[id]/re/` and includes:
- Fund portfolio: 5 funds, $2.0B commitments, $1.4B NAV, 33 active assets (live demo data)
- IGF-VII: $500M committed, 88.7% Gross IRR, 2.59x TVPI
- Asset pages: Cockpit, Financials (P&L + GL), Debt (DSCR, LTV, amortization), Valuation, Documents, Audit
- LP Summary with waterfall allocation and capital account snapshots
- Deal Radar: pipeline with radar chart, 8 deals $474M
- Reports: UW vs Actual, fund comparison
- Full-screen chat workspace: streaming, 83 MCP tools, intent classification
- Demo Lab for spinning up industry-specific environments

Target personas: GP/Managing Partner · CFO/Controller · Asset Manager · Head of IR

## Output Contract

Generate **3–5 demo ideas**. For each:

```
### Demo [N]: [Name]
**Tagline:** [One sentence a GP would immediately understand]
**Target persona:** GP / CFO / Asset Manager / IR
**Problem it solves:** [Specific pain — use dollar amounts or time estimates]
**Demo flow (5-10 steps):** numbered step list
**Winston capabilities shown:** bullet list
**The "wow moment":** [Single thing that lands in under 30 seconds]
**Data needed:** [Seed data required — flag anything missing]
**Build status:** Ready now / Needs X / Not yet built
**Sales angle:** [One sentence on why this closes for this persona]
```

Then append:
- **Demo Difficulty Summary** table: Demo · Persona · Wow Factor · Build Status · Effort to Run
- **This Week's Recommended Demo**: name, why this week (market signal), prep needed

## Working Rules

- At least one demo must involve the **waterfall / LP reporting surface** — this is Winston's most differentiated capability.
- The wow moment must land in **under 30 seconds**, not a 5-minute explanation.
- Do not generate generic "AI chatbot" demos — Winston's differentiator is **domain depth**, not chat.
- All demos must be runnable in the live environment **or** clearly flagged as "Needs build."
- Tie market signals from today's intel to the demo's problem statement wherever possible.
- Build status should be honest — flag partial readiness so Paul knows actual prep time.

## Save Output

Save to: `docs/demo-ideas/[TODAY YYYY-MM-DD].md`

## Exit Condition

- `docs/demo-ideas/[TODAY].md` exists with 3–5 demos, a difficulty summary, and a weekly recommendation.
- Every demo has an honest build status and a specific wow moment.
- At least one demo is runnable in the live environment today.

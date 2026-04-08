# Research Integration Layer

This file governs how Winston routes research requests and consumes external research outputs.

---

## Research Tiers

### Tier 1 — Quick web lookup
**When:** User asks a factual question about a library, API, error message, version, or known pattern.
**How:** Use OpenClaw web tools directly. Answer inline. No file created.
**Examples:**
- "What does Recharts v3 change about axes?"
- "Does psycopg3 support asyncpg-style connection pools?"
- "What's the Railway pricing for 8 GB RAM?"

### Tier 2 — Deep research task
**When:** The question requires multi-step investigation, comparison of multiple options, synthesis of contradictory sources, or strategic architecture decisions.
**How:** Flag the request. Tell the user to run ChatGPT Deep Research and paste the result into `docs/research/` using the template.
**Signal words:** "compare", "evaluate", "what's the best", "should we use X or Y", "comprehensive overview", "what are all the ways to..."
**Response pattern:**
```
This is a deep research task. I'd recommend running this through ChatGPT Deep Research.

Question to use:
  "[refined research question]"

When you have the report, paste it into:
  docs/research/YYYY-MM-DD-<slug>.md

Use docs/research/template.md as the format. Set Status: ready when done,
then ask me to ingest it.
```

### Tier 3 — Report ingestion
**When:** User says "ingest research", "build plan from", "process report", or drops a path to a file in `docs/research/`.
**How:** Invoke the `research-ingest` skill. Become the research-architect role.
**Output:** Phased implementation plan handed to `feature-dev` or orchestration engine.

---

## Telegram command patterns

| Intent | Example command |
|---|---|
| Quick web lookup | `search: what changed in shadcn/ui v2 tooltips` |
| Flag for deep research | `deep research needed: evaluate REPE IRR calculation libraries` |
| Ingest a completed report | `ingest research: docs/research/2026-03-11-irr-libs.md` |
| Build plan from report | `build plan from: docs/research/2026-03-11-irr-libs.md` |
| List pending reports | `list research: show reports with status ready` |

---

## Report lifecycle

```
[user pastes report] → Status: draft
[user reviews and confirms] → Status: ready
[research-ingest runs] → Status: ingested
[feature-dev implements] → tasks checked off in report
```

---

## Rules

- Never start implementing from a `draft` report — it may be incomplete.
- Never skip the planning state — raw findings are not tasks.
- Always assign each task a surface before handing to feature-dev.
- If findings contradict existing architecture, surface the conflict explicitly before planning.
- Deep research reports are the user's work product — do not alter findings, only extract and structure them.

---
name: competitor-tracker
description: "Daily competitive intelligence scan for Novendor / Winston. Covers primary REPE software competitors (Yardi, Juniper Square, Cherre, Altus/ARGUS, Dealpath) AND construction/PDS competitors (Procore, Autodesk ACC/Forma, Bluebeam, INGENIOUS.BUILD, JLL PDS). After scanning, tours the repo to map existing capabilities against new competitor features, then generates a repo-aware mega meta prompt with build directives for every feature gap found. Use whenever you need a competitive scan, feature gap analysis, competitor-derived build roadmap, or want to reverse engineer what competitors are shipping into Winston build prompts."
metadata:
  topic: competitive-intelligence
  surface_paths:
    - docs/competitor-tracking/
    - docs/competitor-research/
---

# Competitor Tracker

This skill runs in two modes:
- **Automated (scheduled)**: full scan → analysis → repo tour → mega meta prompt → save to disk
- **Interactive**: same flow, but pauses for input between stages if Paul is present

---

## STAGE 1: REPE Competitor Scan

Search for recent (last 7 days preferred, last 30 days if nothing recent) news for each primary REPE competitor. For each, run:
- `[Company] product update OR new feature OR announcement 2026`
- `[Company] AI OR automation OR machine learning`

**Primary REPE watchlist:**
- Yardi — dominant property management + investment management platform
- Juniper Square — LP portal, fund admin, CRM for PE/RE firms
- Cherre — real estate data analytics
- Altus Group / ARGUS — valuation and scenario modeling
- Dealpath — deal management platform

**Adjacent enterprise AI:**
- Adapt (adapt.com)
- Glean (glean.com)
- Mosaic (mosaic.tech)

Also watch: any new REPE-focused AI startups and major AI lab (Anthropic, OpenAI, Google) enterprise product moves.

---

## STAGE 2: Construction / PDS Competitor Scan

Search for recent news for each construction/PDS competitor using:
- `[Company] product update OR new feature OR announcement 2026`
- `[Company] AI OR automation`

**Primary construction watchlist:**
- Procore — construction project management platform (focus: Procore Helix AI, Procore AI Agents, Agent Builder)
- Autodesk Construction Cloud / Forma — now merged into Forma platform (focus: Autodesk Assistant, AutoSpecs, Construction IQ)
- Bluebeam — PDF markup and collaboration (focus: Bluebeam Max, AI-REVIEW, AI-MATCH)
- INGENIOUS.BUILD — enterprise construction PM (focus: financial management, predictive analytics, JLL partnership)
- Turner & Townsend / CBRE PjM — combined entity post-2025 merger

**Adjacent construction tech:**
- Newforma (project information management)
- Oracle Primavera (scheduling)
- Trimble (field + BIM)

---

## STAGE 3: Analyze Each Finding

For every signal found across both scan stages, produce a structured entry:

```markdown
### [Company Name] — [Short description]

**Date:** [When published/announced]
**What happened:** [Factual description of what shipped or was announced]
**Strategic direction:** [What this tells us about where they're headed]
**Threat level to Winston:** [None / Low / Medium / High]
**Threat rationale:** [Specific Winston capability at risk — be precise]
**Differentiation opportunity:** [What gap this creates for Winston]
**Recommended response:** [Product / Positioning / Ignore — 1-2 sentences]
```

Threat level rules:
- **High** = they shipped something directly overlapping a Winston capability
- If Yardi or Juniper Square ship AI features → always at least Medium
- If Procore or Autodesk ship AI in construction project management → always at least Medium
- Never recommend copying — always recommend differentiating

---

## STAGE 4: Repo Capability Audit

After the scan, tour the repo to determine whether Winston already has capabilities that address the competitor features found. Do NOT build anything here — this is read-only reconnaissance.

**Repo locations to check (in order):**
1. `backend/app/services/` — list all service files, scan names for capability signals
2. `backend/app/routes/` — list all route files
3. `backend/app/mcp/tools/` — list MCP tools if present
4. `skills/` and `.skills/` — list existing skills
5. `docs/feature-radar/` — check for prior feature tracking documents
6. `docs/pds-replacement-gap-analysis.md` — PDS gap baseline
7. Any `MEGA_META_PROMPT_*.md` files at repo root and in `docs/`

For each competitor feature found in Stages 1–2, tag it with one of:
- ✅ **Already built** — service/route exists, reference the filename
- 🟡 **Partial** — related service exists but feature is not complete, note what's missing
- 🔴 **Not built** — no matching capability found

Produce a compact capability map table:
```markdown
| Feature | Competitor | Winston Status | Existing File |
|---|---|---|---|
| Portfolio scenario comparison (5-way) | ARGUS | 🟡 Partial | re_scenario_engine_v2.py (logic exists, no compare UI) |
| Deal intake AI from OM PDF | Dealpath | 🟡 Partial | pdf_processing.py, extraction.py (infrastructure exists, no OM profile) |
| RFI drafting agent | Procore | 🔴 Not built | — |
```

---

## STAGE 5: Mega Meta Prompt Generation

Using the capability map from Stage 4, write a **Mega Meta Prompt** — a sequenced build directive for every 🟡 Partial and 🔴 Not built item. This is the primary deliverable of the competitive scan.

### Mega Meta prompt format

The prompt must open with:
1. **Repo Safety Contract** — explicit list of what must not be modified (existing tables, calculation logic, waterfall engine, IRR engine, Meridian demo assets). Reference `MEGA_META_PROMPT_CONSTRUCTION_DEV.md` for the full contract.
2. **Capability Audit Summary** — what Winston already has (skip these), what is being built

For each build item, write a phase prompt:

```markdown
## PHASE N: [FEATURE NAME]
*Dependency: [Unblocked / Depends on Phase X]*

### Competitor signal
[1-2 sentences: what competitor shipped, when, key metrics/outcomes]

### Build prompt
[Complete build directive for this feature, including:]
- Backend: new service file(s), new route file(s), function signatures, new tables (additive only)
- Frontend: new page path, new component name, API calls, UX description
- How to extend existing services without replacing them
- Verification: 3 steps to confirm the feature works in the Meridian demo environment

[Be specific. Name filenames. Reference existing services. Include data shapes where they matter.]
```

Close the mega meta prompt with:
- Dependency ordering diagram (can be ASCII)
- Suggested sprint order
- Positioning table: `| Phase | Competitor Being Beaten | Winston's Edge |`

### File naming

Save to: `docs/MEGA_META_PROMPT_COMPETITOR_REVERSAL_[YYYY-MM-DD].md`

If a prior mega meta prompt exists from a previous scan (e.g., `MEGA_META_PROMPT_COMPETITOR_REVERSAL_2026-03-18.md`), load it and extend it — do not overwrite phases that were already written. Add new phases for any new competitor signals found since the last scan. Update the ordering and sprint table to include new phases.

---

## STAGE 6: Competitive Summary Table

```markdown
## Competitive Landscape Summary — [DATE]

| Competitor | Latest Signal | Threat Level | Winston Advantage | Action |
|---|---|---|---|---|
| Yardi | | | | |
| Juniper Square | | | | |
| Cherre | | | | |
| Altus | | | | |
| Dealpath | | | | |
| Procore | | | | |
| Autodesk ACC/Forma | | | | |
| Bluebeam | | | | |
| INGENIOUS.BUILD | | | | |
```

---

## STAGE 7: Winston Positioning Update

```markdown
## Positioning Implications

**Reinforce this week:**
[What Winston should be saying more loudly, based on what competitors are doing or not doing]

**Stop saying / deprioritize:**
[Any messaging that now sounds like a competitor — adjust to differentiate]

**New angle to test:**
[A positioning angle that competitors have left open]
```

---

## STAGE 8: Save All Outputs

Save the daily intelligence report (Stages 3, 6, 7) to:
`docs/competitor-tracking/[YYYY-MM-DD].md`

Save the mega meta prompt (Stage 5) to:
`docs/MEGA_META_PROMPT_COMPETITOR_REVERSAL_[YYYY-MM-DD].md`

If today's date matches the latest existing mega meta prompt, extend it rather than create a new file.

---

## Execution constraints

- If a competitor has no news today, say so in one sentence and skip their section — do not pad
- Threat levels must be justified — "High" requires a shipped feature that directly overlaps a Winston capability
- The mega meta prompt must be repo-aware — always reference the specific service/route file that the build will extend
- Never recommend building a feature that already fully exists in the repo (check Stage 4 first)
- The repo safety contract is non-negotiable — every build prompt in the mega meta prompt must reference it
- When running automated (no user present), choose reasonable defaults and note them in the output rather than stalling

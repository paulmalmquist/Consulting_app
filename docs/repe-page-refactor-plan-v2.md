# REPE Marketing Page — Refactor Plan v2
## novendor.ai/industries/real-estate-private-equity
## Handoff doc for implementation. Plan only — no code.

---

## The Central Idea

Every REPE firm that has been in front of LPs in the last 18 months has said some version of "we're using AI." Someone wrote it down. Now someone has to go build it.

That person is the buyer. They're not shopping for software. They made a commitment and need something real to stand behind.

Novendor closes the gap between what was said and what currently exists. Not by selling a product — by doing the work: connecting the sources, building the pipeline, modeling the data, governing the definitions, and delivering outputs that executives, analysts, and LPs can actually use.

**Headline:** Make good on your AI promise.

---

## What This Page Is Not

- A product tour
- A feature list
- A case for "why AI in REPE" — that argument is already won
- A pitch for Winston as a system

Winston is the execution environment. It shows up after the engagement starts. The page sells Novendor — the firm, the methodology, the people who know REPE well enough to do this without a six-month discovery process.

---

## Page Structure

### Section 1 — Hero

**Headline:** Make good on your AI promise.

**Body:** You told your LPs, your IC, or your board that AI is part of the strategy. We build the infrastructure that makes that true — connected to your actual data, governed for institutional use, delivered by people who know how REPE works.

**CTA:** Book 30 minutes → [calendar link]

Dark background. Clean type. No skyline photo. No stock imagery.

---

### Section 2 — The Situation

**Headline:** The commitment is made. The infrastructure isn't.

Short prose, 3–4 sentences:

Most REPE firms run on Yardi or MRI as the source and Excel as the integration layer. One analyst owns the model — and the institutional memory that goes with it. When a parent company, an LP, or a new partner asks for standardized data, that analyst works the weekend. That's not an AI strategy. That's a workaround with a deadline.

No bullets here. Just the mirror.

---

### Section 3 — The Diagram (centerpiece)

This is the most important section on the page. Use the attached architecture diagram, redrawn for the REPE context. Five columns, left to right, with the AI Operating Layer banner across the top.

**AI Operating Layer banner:**
"Reads your fund data, checks definitions against source records, drafts LP reports, and flags variances — against data your team has approved."
Badge: HUMAN-APPROVED (keep this exactly — it carries the governance message)

**Column 1 — Source Systems**
Label: YOUR DATA ALREADY LIVES SOMEWHERE
- Yardi / MRI — financial and operating records
- Argus — asset-level underwriting and cash flows
- Excel models — absorbed into the record, not replaced
- LP portals — capital activity, notices, distributions
- Third-party feeds — market data, benchmarks, CoStar

Footer: Your data already lives somewhere.

**Column 2 — Pipeline & Integration**
Label: INTEGRATE
- Pull from the systems where the work lives
- ETL/ELT in Python and SQL
- State, retries, and observability built in

Footer: Data moves reliably. Owned end to end.

**Column 3 — Data Modeling & Warehouse**
Label: MODEL
- Data warehouse design for fund, asset, and deal level
- Modern lakehouse on Databricks, Snowflake, or Azure
- Modeled around the questions your IC and LPs actually ask

Footer: Structured. Modeled. Built for decisions.

**Column 4 — Semantic Layer & Governance**
Label: GOVERN
- Metrics & definitions (IRR means the same thing everywhere)
- Waterfall logic defined once, applied consistently
- Access & security — who sees what, logged
- Data quality — validation, lineage, audit trail

Footer: One definition. Trusted by every team.

**Column 5 — End Users**
Label: DELIVER
- Partners — fund-level view, IC-ready
- Asset managers — property-level, variance vs. budget
- Analysts — self-serve with trusted data
- LP reporting — generated in hours, not assembled over days
- AI agents — draft, check, and execute against governed data

Footer: Trusted data. Used by people and agents.

**Bottom navigation strip** (same as diagram):
SOURCE → INTEGRATE → MODEL → GOVERN → DELIVER

---

### Section 4 — Who This Is For

Three firm profiles. Brief. No bullet headers.

**The firm under new ownership**
A parent company or institutional platform now expects standardized quarterly data. The existing stack wasn't built for that ask, and the gap shows up every quarter-end.

**The firm that made the promise**
Leadership told LPs or the board that AI is part of the strategy. The ops team or a senior analyst got the assignment. They need something real — not a demo that doesn't survive a follow-up question.

**The firm where one analyst owns everything**
The model, the reporting, the quarterly pack. One departure away from a crisis. The goal isn't to replace the analyst — it's to make their work reproducible.

---

### Section 5 — Proof

Two blocks. Anonymized but specific.

**Built the layer**
Mid-market REPE firm, ~$3B AUM, 18-person team. Yardi and Excel as the starting point. We replaced the analyst-built LP packs with a reporting layer that pulls directly from source systems. Quarterly IC memos went from two days to four hours. The firm passed an LP audit with zero reconciliation exceptions.

**Stayed in Excel**
A larger shop acquired by a global asset management platform. The analyst who owned the model left. The new hire couldn't reproduce it. An LP audit surfaced three inconsistencies across reporting periods. Two months of remediation. The parent company installed their own oversight layer.

The difference was not the quality of the team. It was whether the infrastructure existed independent of any one person.

---

### Section 6 — CTA

**Headline:** If your quarterly LP pack still lives in Excel, let's talk.

**Body:** 30-minute conversation. We'll map what you have, what you promised, and what it takes to close the gap.

**Button:** Book the conversation → [calendar link]

No form. No "request a demo." A calendar link.

---

## Copy Rules

- Sell Novendor the firm, not Winston the system
- Write to the person who got the assignment, not the person who made the promise
- Specific beats general everywhere — name the tools (Yardi, Argus, Excel), name the roles (analyst, LP, IC), name the outcomes (hours not days, zero exceptions)
- Short sentences
- Do not use: seamless, robust, transformative, game-changing, cutting-edge, AI-powered, revolutionize, reimagine, unlock, leverage, streamline, ecosystem, holistic, multifaceted

---

## Implementation Notes

- The diagram is the centerpiece. Everything else supports it. Build the diagram section first and get it right before touching the rest.
- The diagram should be an interactive or animated component — columns load left to right, the AI Operating Layer banner appears last. Not required for v1, but worth flagging.
- The page lives at `/industries/real-estate-private-equity`. Confirm it is a standalone marketing page, not a lab environment route before touching the layout.
- Meta title: "Make good on your AI promise — Novendor"
- Meta description: "We build the AI infrastructure REPE firms committed to — connected to your data, governed for institutional use, delivered by people who know the work."
- The OG URL still references paulmalmquist.com. Fix that to novendor.ai.
- Full server render for SEO. No client-only components for above-the-fold content.

---

## Open Questions (resolve before coding)

1. CTA destination — Calendly, contact form, or email? Decide before building the bottom third.
2. Are the case studies named or anonymized? Named is more credible but needs permission.
3. Does this page template apply to other industries (healthcare, PDS)? If yes, build the diagram as a data-driven component so the columns swap per vertical.
4. Does the diagram link to a live sandboxed environment? That would increase conversion significantly — flag for v2 if not ready now.
5. Who provides the redrawn diagram asset — design or code? SVG component preferred over a static image so it scales and can animate.

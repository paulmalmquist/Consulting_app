# REPE Marketing Page — Refactor Plan
## novendor.ai/industries/real-estate-private-equity

**Handoff doc for implementation. This is the plan, not the code.**

---

## The Central Idea

Every REPE firm that's been in front of LPs in the last 18 months has said some version of "we're using AI." Someone in that room wrote it down. Now someone else has to go build it.

That person — the ops lead, the COO, the managing director who got the assignment — is the buyer. They're not shopping for software. They made a commitment and need something real to stand behind.

The page needs to speak to that moment. Not to features. Not to capabilities. To the gap between what was said and what currently exists.

**Headline direction:** "Make good on your AI promise."

---

## Current Page Problems

1. **It's a feature list.** "Fund reporting, waterfall logic, capital activity, portfolio monitoring." Every vendor says this. None of it creates urgency.

2. **No specific buyer moment.** The page doesn't name the situation the reader is already in. It describes a product, not a problem.

3. **No proof with teeth.** Claims without specifics are noise to an institutional buyer.

4. **The CTA is generic.** "Book a demo" is a low-conversion ask when the buyer isn't sure yet that you understand their world.

---

## Page Structure (New)

### 1. Hero

**Headline:** Make good on your AI promise.

**Subheadline:** You told your LPs, your IC, or your board that AI is part of the strategy. Winston is how you deliver something real — auditable, institutional-grade, built for the way REPE actually works.

**CTA:** What did you promise? Let's build it. → [Book 30 minutes]

No hero image of a skyline. No stock photo. Dark background, clean type, one sentence that makes the reader feel seen.

---

### 2. The Situation Section

Headline: **The commitment is made. The infrastructure isn't.**

Short prose block (3–4 sentences max) that describes what just happened in most REPE firms:

- Someone in leadership declared AI is part of the strategy
- The ops team or a senior analyst got the assignment
- What they're working with: Yardi or MRI as the source, Excel as the integration layer, one person who owns the model
- The gap between that stack and "we're using AI" is exactly what Novendor closes

This section is not a product description. It's a mirror. The reader should recognize their situation in it.

---

### 3. Before / After

Two columns. No jargon.

**Left column — Without Winston**
- LP packs built by hand each quarter by one analyst
- KPIs defined differently in every report
- A parent company or LP asks for data on Friday and someone works the weekend
- The model breaks when the analyst leaves
- An audit surfaces inconsistencies that take two months to remediate

**Right column — With Winston**
- Quarterly packs generated in hours, not days
- KPIs defined once, consistent everywhere
- Any authorized user can pull the data — no single point of failure
- Audit-ready at any point, not just at quarter-end
- Parent company reporting is a button, not a project

Keep this scannable. No bullet headers. No length padding. The asymmetry should be obvious.

---

### 4. What Winston Tracks (REPE-specific)

This is where you show product specificity. Not a feature list — a list of what shows up in the room.

Frame it as: **What your IC sees on Monday morning.**

- Fund-level IRR, TVPI, DPI — with waterfall attribution, not just totals
- NOI variance vs. budget by asset, current quarter and trailing
- Capital activity: called, distributed, LP balance by fund
- Asset-level KPIs: occupancy, rent roll, lease expiration schedule
- LP reporting pack: generated, formatted, ready to send

This tells an institutional buyer you know their workflows. Generic AI tools don't produce this. Winston does.

---

### 5. Who This Is For

Three firm profiles, briefly described. This does targeting work without being a matrix.

**The firm under new ownership**
Acquired by a larger manager or institutional platform. The parent now wants standardized quarterly data. The existing stack wasn't built for that.

**The firm that promised AI to LPs**
Someone in leadership made the commitment. The ops team inherited the assignment. They need something real, fast — not a ChatGPT wrapper.

**The firm where one analyst owns everything**
The model, the reporting, the quarterly pack. That person is a single point of failure. One departure away from a crisis.

---

### 6. Proof

Two case study blocks. Anonymized but specific.

**Case A — Built the layer**
Mid-market REPE, ~$3B AUM, 18-person team. Same Yardi + Excel starting point. Replaced the analyst-built LP packs with a reporting layer that pulls directly from source systems. Quarterly IC memos went from 2 days to 4 hours. Passed LP audit with zero reconciliation exceptions.

**Case B — Stayed in Excel**
Larger shop acquired by a global AM platform. Analyst left. New hire couldn't reproduce the model. LP audit surfaced three inconsistencies across fund reporting periods. Two-month remediation. Parent installed their own oversight layer.

These are the Pearlmark deck case studies adapted for the web. They work because they're specific.

---

### 7. CTA (Bottom)

**Headline:** If your quarterly LP pack still lives in Excel — let's talk.

**Subheadline:** 30-minute conversation. We'll map what you have, what you promised, and what it takes to close the gap.

**Button:** Book the conversation

No form with 8 fields. No "request a demo." A calendar link.

---

## Copy Tone

- Write to the person who got the assignment, not the person who made the promise
- Specific beats general everywhere
- No claims without a supporting fact or outcome
- Short sentences. One idea per sentence.
- Do not use: seamless, robust, transformative, game-changing, cutting-edge, AI-powered, revolutionize, reimagine, unlock, leverage, streamline

---

## What This Page Is NOT

- A product tour
- A feature comparison
- A technology explainer
- A case for "why AI in REPE" (that argument is already won — the buyer is past it)

---

## Implementation Notes for the Developer

- This is a marketing page, not an app route. It should live at `/industries/real-estate-private-equity` and be fully server-rendered for SEO.
- The page currently returns 200 but appears to render a lab environment slug rather than a dedicated marketing page. Confirm whether this is a shared route or a standalone page before touching the layout.
- The meta title and description both need to change. Current description is generic feature copy; it should reflect the "make good on your AI promise" positioning.
- No new dependencies needed. This is copy and layout work.
- The before/after section and case study blocks are the most important things to get right visually. They carry the persuasive weight.

---

## Open Questions (resolve before coding)

1. Does the CTA go to a Calendly link, a contact form, or an email? Decide this first — it affects the bottom third of the page.
2. Are the case studies named or anonymized? Named firms are more credible but require permission.
3. Is there a second industry page (healthcare, PDS) that should follow the same structure? If yes, build the layout as a template.
4. Does the "What Winston tracks" section link to a live demo or stay static? A link to a sandboxed environment would increase conversion significantly.

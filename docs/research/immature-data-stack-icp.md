# Deep Research Prompt: Immature Data Stack as an ICP Signal

Use this prompt with a deep research tool (Perplexity, ChatGPT deep research, or similar) to identify and profile target segments where data stack immaturity is the primary buying signal for Novendor/Winston.

---

## PROMPT

You are researching a B2B consulting and software market opportunity. The company sells a data platform consolidation and AI reporting layer (called Winston) targeted at mid-market firms that are data-rich but analytically immature — meaning they have the source data but lack the infrastructure, tooling, or expertise to act on it consistently.

The current customer base is real estate private equity (REPE), where the typical pain is: Yardi/MRI as the source system, Excel as the analytics layer, Juniper Square or Investran for investor reporting, and a team of analysts doing manual reconciliation between all three every quarter.

I want to understand what other segments look structurally identical to this pattern, and which specific firm types within those segments are the best targets.

**Research these five questions:**

---

### 1. What industries have the same structural data problem as REPE?

The REPE pattern is:
- One or two operational source systems (ERP, property management, loan servicing, billing)
- Excel as the analytics and reporting layer
- Analysts spending 30–50% of time on reconciliation and report assembly
- A growing LP, board, or regulatory audience demanding institutional-grade reporting
- A headcount ceiling where adding more analysts is the current "solution"

Identify 5–7 industries or firm types where this pattern is documented — meaning there is evidence (job postings, vendor complaints, analyst reports, forum discussions, LinkedIn posts) that this problem is active and unresolved. For each, describe:
- The typical source systems in use
- What Excel is being used for that it shouldn't be
- Who inside the firm owns the pain (CFO, COO, Head of Data, etc.)
- What triggers a firm in this segment to finally spend money on a fix
- Approximate firm size (AUM, revenue, headcount) where the pain becomes acute enough to buy

---

### 2. Which firm types are actively hiring for roles that signal data stack immaturity?

When a firm posts for any of the following roles, it is a direct signal that their data stack is broken and they are trying to solve it with headcount rather than infrastructure:

- "Data Analyst" or "Senior Data Analyst" with Excel/SQL in requirements and no mention of a BI tool
- "Reporting Analyst" or "Financial Reporting Analyst" with manual processes described
- "Data Engineer" at a firm under 200 employees with no existing data team
- "Business Intelligence Analyst" where the job description mentions "building from scratch" or "greenfield"
- Any title with "consolidation", "reconciliation", or "data integrity" in it

Search LinkedIn, Indeed, and Glassdoor job postings from the last 90 days. Find 10–15 specific companies — outside of REPE — that match this pattern. For each company, extract:
- Company name, industry, approximate size
- The exact job title and key phrases from the posting that confirm data stack immaturity
- The source systems mentioned (if any)
- What a consulting engagement might look like for this company

---

### 3. What are the documented failure modes of Excel-first data operations at scale?

Find primary evidence — case studies, post-mortems, academic research, audit findings, regulatory filings, or news coverage — of actual business problems caused by Excel-first data operations. These are not hypothetical. Look for:

- Financial errors traced to spreadsheet mistakes (the JP Morgan London Whale is one example; find others at smaller scale)
- Regulatory findings citing manual data processes as a control weakness
- Audit qualifications or management letter items related to spreadsheet-dependent reporting
- Investor complaints or LP inquiries triggered by inconsistent fund reporting
- Companies that disclosed operational risk from data fragmentation in SEC filings or annual reports

For each case, note: the firm type, the size, what broke, and what it cost them. This becomes outreach ammunition.

---

### 4. What does an immature data stack look like from the outside?

I want observable signals I can find without talking to the company — things visible on their website, LinkedIn, job postings, Glassdoor reviews, conference talks, or press releases.

Map out a signal taxonomy:

**Hiring signals** — what job titles or role descriptions indicate they're Excel-heavy and data-immature?

**Tech stack signals** — what tools on BuiltWith, G2, or Crunchbase indicate they haven't invested in a real data layer? (e.g., Tableau without a data warehouse, or Salesforce without an ETL)

**Org signals** — what does the org chart look like at a data-immature firm? (e.g., no Head of Data, no data team, Finance owns all reporting)

**Glassdoor signals** — what phrases in employee reviews indicate data pain? (e.g., "a lot of manual work", "everything is in spreadsheets", "no single source of truth")

**Conference/content signals** — what kinds of presentations or blog posts do data-immature firms publish that reveal their level? (e.g., "How we built our reporting process in Excel")

For each signal type, give 3–5 specific examples I can search for right now.

---

### 5. Which specific verticals are underserved by existing data platform vendors?

The major vendors (Snowflake, dbt, Fivetran, Tableau, Power BI, Looker) all require a technical team to implement and maintain. The mid-market firm with 50–500 employees and one or two analysts cannot run these tools without a dedicated data engineering function.

Research which verticals have the highest density of firms in this size band that are either:
- Not using any modern data tooling at all (still Excel + source system)
- Using point solutions that don't talk to each other (e.g., a BI tool bolted onto a legacy ERP with no warehouse in between)
- Failed implementations — they bought a data tool and it never got used

For each vertical, estimate:
- Number of firms in the US in the 50–500 employee range
- Approximate percentage that are data-mature vs. data-immature (look for analyst reports, vendor market size data, or survey results)
- The specific tool or vendor they tend to get stuck with
- Why the standard vendor solutions fail them (complexity, cost, implementation burden)

---

## OUTPUT FORMAT

Return a structured report with:

1. **Top 3 non-REPE segments** to target immediately, ranked by: (a) volume of reachable firms, (b) urgency of pain, (c) similarity to the existing REPE playbook
2. **15 specific named companies** outside REPE that match the ICP right now, with the evidence for each
3. **Outreach angle** for each segment — one or two sentences that would open a cold email without sounding like a pitch deck
4. **Signal checklist** — a one-page reference card of observable signals I can check in under 5 minutes per company
5. **Objection map** — for each segment, what is the most common reason a firm in this category says no, and what is the factual counter

Keep the writing direct. No bullet-point padding. If a data point is not sourced, say so rather than stating it as fact.

---

## CONTEXT FOR THE RESEARCHER

The company doing the selling:
- Named Novendor, sells under the product name Winston
- Solo operator, consulting + SaaS hybrid model
- Current deals: REPE firms $75K–$175K for a data platform consolidation + reporting layer engagement
- Delivery: FastAPI backend, Next.js frontend, Postgres/Supabase, Vercel/Railway
- Winston replaces: Excel-based reporting, manual reconciliation, fragmented BI tools, and the analyst headcount used to run them
- Not a traditional BI tool — it's a managed intelligence layer that sits on top of existing source systems and delivers consistent, auditable outputs

The research output will be used to:
1. Identify new outbound targets in the next 30 days
2. Build segment-specific cold email sequences
3. Inform which job posting signals to monitor on a weekly basis

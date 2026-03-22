# Competitor-Derived Product Opportunities — 2026-03-20

---

### Opportunity: NOI Delta Explainer

**Derived from:** Cherre — NOI Delta Explainer Agent
**Classification:** Easy build

**Winston feature description:**
New MCP tool `explain_noi_delta` that accepts a property_id and two periods, queries the P&L and GL trial balance for both periods, computes line-item deltas, ranks by magnitude, and returns a structured JSON response with a narrative summary. Renders in Winston chat as a waterfall chart showing NOI bridge from Period A to Period B with annotated drivers.

**Enterprise value:**
Every REPE CFO and asset manager must explain NOI changes to investors, lenders, and IC quarterly. Today this is manual in Excel — pull two P&Ls, compare line by line, write a narrative. Automating this saves 2-4 hours per property per quarter. For a 50-property portfolio, that's 100-200 hours/quarter of analyst time redirected to higher-value work.

**Implementation complexity:** Low
Winston already has P&L data, GL trial balance, and the AI gateway. This is a new MCP tool + a chat workspace rendering template.

**Demo potential:** High
"Ask Winston: Why did NOI change at Riverdale Commons?" → instant waterfall chart + narrative. Shows domain depth that no generic AI can match.

**Priority score:** 9

---

### Opportunity: IC Memo Generator

**Derived from:** Dealpath — IC Memo/Teaser generation from live deal data
**Classification:** Easy build

**Winston feature description:**
New MCP tool `generate_ic_memo` that pulls structured deal data from Deal Radar (property details, financials, thesis, risk factors, market context) and generates a formatted IC teaser or full memo document. Output as both inline chat block and downloadable DOCX/PDF.

**Enterprise value:**
IC memo prep is one of the most time-consuming tasks for acquisition analysts. Manually compiling property details, market context, financial summaries, and thesis into a formatted memo takes 4-8 hours per deal. Auto-generating a first draft from structured data cuts this to review-and-edit (30-60 minutes). For firms screening 50+ deals/month, this is transformative.

**Implementation complexity:** Low
Winston has deal data in Deal Radar, document generation capabilities, and AI for narrative. Needs a memo template and field mapping.

**Demo potential:** High
"Generate an IC teaser for the Meridian Industrial acquisition" → instant formatted memo with all deal data populated. Extremely compelling for acquisition teams.

**Priority score:** 9

---

### Opportunity: Rent Roll Validator

**Derived from:** Cherre — Rent Roll Validator Agent
**Classification:** Easy build

**Winston feature description:**
New MCP tool `validate_rent_roll` that ingests a rent roll (from document pipeline or structured data), cross-references against lease abstracts and property records, flags inconsistencies (mismatched unit counts, rent discrepancies, expired leases still showing, vacant units marked occupied), and produces a validation report with severity levels.

**Enterprise value:**
Rent roll accuracy is critical for underwriting, valuations, and lender reporting. Errors in rent rolls propagate into cap rate calculations, DSCR coverage, and LP distributions. Acquisition teams manually review rent rolls line by line before closing. Automated validation catches errors early, reduces due diligence time, and improves data confidence.

**Implementation complexity:** Low
Winston has asset-level data and document ingestion. Needs comparison logic between rent roll entries and lease data.

**Demo potential:** High
Upload a rent roll → Winston flags 3 discrepancies → shows what's wrong and why. Very tangible value demonstration.

**Priority score:** 8

---

### Opportunity: OM Data Extract (90+ Field Abstraction)

**Derived from:** Dealpath — AI Data Extract
**Classification:** Partial (needs OM-specific templates)

**Winston feature description:**
Extend Winston's document ingestion pipeline with OM-specific extraction schema: 90+ fields including property name, address, square footage, unit count, asking price, cap rate, in-place NOI, pro forma NOI, tenant roster, lease expiration schedule, capital requirements, market comps cited. Output populates a structured deal record in Deal Radar with confidence scores per field.

**Enterprise value:**
OM abstraction is the #1 requested AI feature in CRE deal management (per Dealpath's marketing). Acquisition teams process dozens of OMs per week. Manual data entry takes 30-60 minutes per OM. Automated extraction to under 1 minute at 95% accuracy is a major productivity gain and reduces data entry errors.

**Implementation complexity:** Medium
Winston has the document pipeline infrastructure. Needs OM-specific field schema, extraction prompts, confidence scoring, and Deal Radar integration.

**Demo potential:** High
Upload an OM PDF → Winston extracts 90+ fields in seconds → populates Deal Radar automatically. Classic "wow" demo moment.

**Priority score:** 8

---

### Opportunity: Variance Analysis (Budget vs Actual)

**Derived from:** Cherre — Variance Analysis Agent
**Classification:** Partial

**Winston feature description:**
Extend Winston's UW vs Actual framework to support operational budget baselines. New MCP tool `analyze_variance` that compares budget vs actual at property and portfolio level, applies materiality thresholds, decomposes variances into market/operational/one-time drivers, and generates a narrative explanation. Renders as variance table + narrative in chat workspace.

**Enterprise value:**
Budget-vs-actual analysis is a monthly/quarterly requirement for every institutional REPE firm. CFOs need automated variance commentary for board reporting and LP communications. Saves 1-2 hours per property per reporting period.

**Implementation complexity:** Medium
Winston has UW vs Actual as foundation. Needs operational budget data model, materiality thresholds, driver classification logic, and narrative generation.

**Demo potential:** Medium
Useful but less visually dramatic than other demos. Better as part of a broader "reporting automation" narrative.

**Priority score:** 7

---

### Opportunity: Concession Impact Analyzer

**Derived from:** Cherre — Concession Impact Analyzer Agent
**Classification:** Easy build

**Winston feature description:**
New MCP tool `analyze_concession_impact` that quantifies the effect of leasing concessions (free rent, TI, rent abatement) on property cash flow, effective rent, and NOI. Takes a property_id and models the cash flow impact of current concessions vs. face rent.

**Enterprise value:**
Multifamily and office asset managers need to understand the true cost of concessions on portfolio cash flow. This analysis is typically done in spreadsheets. Automating it gives asset managers instant visibility into effective rent vs. face rent across the portfolio.

**Implementation complexity:** Low
Winston has asset-level financial data. Needs concession tracking fields and impact calculation logic.

**Demo potential:** Medium
Solid for asset management-focused demos. "What's the real impact of our concession package at Parkview?"

**Priority score:** 6

---

### Opportunity: Deal Execution Milestone Tracker

**Derived from:** Dealpath — Deal Execution with milestones, approvals, smart reminders
**Classification:** Partial

**Winston feature description:**
Add structured milestone tracking to Deal Radar: LOI submitted, PSA executed, IC approval, due diligence complete, closing date. Each milestone has assigned owners, deadlines, and automated reminders via SSE. Include approval workflow with role-based handoffs (analyst → VP → IC).

**Enterprise value:**
Deal execution discipline is critical at scale. Missed deadlines, unclear ownership, and lost approvals cost firms deals and money. Structured milestone tracking reduces execution risk and provides audit-ready documentation.

**Implementation complexity:** Medium
Winston has Deal Radar and SSE infrastructure. Needs milestone data model, approval workflow logic, reminder system, and notification delivery.

**Demo potential:** Medium
Good for showing operational depth. "Show me all deals with PSA deadlines in the next 30 days."

**Priority score:** 6

---

### Opportunity: Underwriting Model Version Comparison

**Derived from:** Dealpath — Versioned underwriting models with comparison
**Classification:** Partial

**Winston feature description:**
Add version tracking to Winston's scenario modeling: save named versions of underwriting assumptions, enable side-by-side comparison of two versions with delta highlighting. Integrates with UW vs Actual to show how underwriting assumptions evolved from initial screening to final IC approval.

**Enterprise value:**
Investment teams iterate on underwriting assumptions throughout due diligence. Tracking how assumptions evolved (and why) is important for post-close performance attribution and improving future underwriting accuracy.

**Implementation complexity:** Low
Winston has scenario modeling. Needs version persistence and diff UI.

**Demo potential:** Medium
"Compare our initial underwriting to our revised IC model — what changed and why?"

**Priority score:** 5

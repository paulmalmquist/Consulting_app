# Winston AI Evaluation Test Suite
### Cascade Ridge Apartments — Demo Document Set

> **Purpose:** Benchmark the Winston RAG + reasoning pipeline against a realistic value-add multifamily deal.
> All tests use the 20-document Cascade Ridge demo library (docs 01–20).
> Tests are ordered from baseline retrieval to full enterprise synthesis.

---

## Test 1 — Clause Retrieval (Baseline RAG)

**What it measures:** Chunking quality and retrieval precision. If this fails, nothing else matters.

**Prompt**
```
Find the Debt Service Coverage Ratio covenant in the loan agreement.
Explain:
- the minimum DSCR requirement
- how DSCR is defined
- how often it is tested
- what happens if the borrower fails the test

Cite the exact sections of the agreement.
```

**Expected behavior**
The AI should retrieve and cite:
- Article I (Definitions) — DSCR definition
- Article VI (Financial Covenants) — Section 6.12 DSCR
- Article VIII or IX (Events of Default / Cure) — consequences of breach

Example of a correct citation:
```
Loan Agreement
Article VI — Financial Covenants
Section 6.12 DSCR: Borrower shall maintain a Debt Service Coverage Ratio
of not less than 1.20x, tested quarterly on a trailing 12-month basis...
```

**Failure modes to watch for**
- Retrieves only one section, misses the definition or the default consequence
- Halluccinates the threshold (e.g., says 1.25x instead of 1.20x)
- Cites section numbers that don't exist
- Returns a generic DSCR explanation instead of document-specific language

---

## Test 2 — Cross-Document Operational Intelligence

**What it measures:** Whether the system can join legal definitions to financial data and perform a calculation.

**Prompt**
```
Based on the loan agreement, rent roll, and monthly operating report:
Determine whether the property is currently in compliance with the DSCR covenant.

Steps:
1. Use the DSCR definition from the loan agreement
2. Use NOI from the September 2024 operating report
3. Use the debt service derived from the loan terms

Show the full calculation and cite all three source documents.
```

**What good looks like**

| Input | Source | Value |
|---|---|---|
| Annual Debt Service | Promissory Note — $28.35M at SOFR+285bps | ~$1.85M |
| T12 NOI | Monthly / Q3 Report | ~$2.198M |
| DSCR | Calculated | ~1.19x |
| Covenant Threshold | Loan Agreement §6.12 | 1.20x |
| **Compliance** | | **FAIL — cash sweep active** |

**Why this is a good test**
The AI must retrieve a legal definition, find financial numbers in a separate operational document, perform arithmetic, and render a compliance verdict. That is exactly what an analyst does on day one of a new deal.

**Failure modes**
- Uses a different NOI number (e.g., from the budget instead of actuals)
- Gets the debt service wrong because it doesn't parse the IO structure correctly
- Concludes "compliant" without checking the cash sweep trigger threshold (1.20x, not just positive DSCR)

---

## Test 3 — Institutional Asset Management (Hard Mode)

**What it measures:** Multi-document synthesis, legal reasoning, trend analysis, and actionable output.

**Prompt**
```
Review the following documents:
- Loan Agreement
- Guaranty
- Assignment of Leases and Rents
- Property Management Agreement
- Latest Operating Report (Q3 2024)
- Rent Roll (September 30, 2024)

Determine whether the borrower is at risk of triggering a cash sweep or default
within the next 12 months.

Analyze:
1. DSCR covenant compliance (current and projected)
2. Occupancy trends from the rent roll
3. Lease expirations in the next 12 months
4. Reporting requirements in the loan agreement
5. Any guarantor obligations that could be triggered

Output:
A. Risk assessment (High / Medium / Low with rationale)
B. Supporting clauses from the loan documents (cited)
C. Operational metrics that drive the risk
D. Recommended actions for the asset manager
```

**Capability matrix**

| Capability | What's being tested |
|---|---|
| Multi-document retrieval | Pulls from 6 different files |
| Legal reasoning | Interprets covenant structure and carveout triggers |
| Financial reasoning | NOI + debt service → DSCR |
| Trend analysis | Rent roll lease expirations |
| Synthesis | Cross-document verdict |
| Citation | Compliance evidence chain |

**Why this matters for Winston**
This is real PE asset management work. A first-year analyst would spend a day on this. The AI should do it in seconds — with citations.

---

## Test 4 — Temporal Delta Detection

**What it measures:** Whether the AI can identify what changed between two reporting periods, not just what exists.

**Prompt**
```
Compare the Q3 2024 Asset Management Report with the September 2024 Monthly
Management Report.

Identify:
1. Any metrics that changed between the two reports
2. What the trend implies about the property's performance trajectory
3. Whether the Q3 metrics are consistent with the monthly data, or if there are discrepancies

Flag any numbers that appear in one document but are absent or inconsistent in the other.
```

**Why this is sneaky**
The Q3 report covers July–September (quarter-end) and the monthly covers September only. A naive system will treat them as duplicates. A good system understands the temporal relationship and uses both to construct a performance arc — and will notice if anything doesn't reconcile.

**Failure mode to watch:** Summarizes each document separately instead of diffing them.

---

## Test 5 — Gap / Missing Document Detection

**What it measures:** Whether the AI understands what *should* be present, not just what *is* present.

**Prompt**
```
Based on the reporting and delivery requirements in the loan agreement,
identify which reports or documents are required but missing from this file set.

For each missing item, specify:
- The clause requiring it
- How frequently it must be delivered
- The consequence of non-delivery
```

**Expected output**
A good system should flag things like:
- Annual audited financials (if the loan requires them)
- Quarterly rent rolls beyond Sep 2024
- Annual insurance renewal certificates
- Any SNDAs or estoppels required post-closing

**Why this is valuable for Winston**
This turns the AI into a compliance watchdog — not just a question-answerer. It's a feature, not just a demo.

---

## Test 6 — Adversarial Borrower Perspective

**What it measures:** Legal reasoning depth and clause-level risk awareness. Separates surface summarization from genuine document intelligence.

**Prompt**
```
You are counsel for the borrower.

What are the five most dangerous clauses in this loan agreement for the borrower?

Rank them by severity. For each, explain:
- what the clause says
- why it is dangerous
- what scenario would trigger it
- whether it is standard market or aggressive lender language
```

**What a strong answer looks like**
1. Springing cash sweep — DSCR < 1.20x triggers automatic cash capture with no cure period
2. Non-recourse carveout triggers — broad "bad boy" list, full recourse on unauthorized transfer
3. Transfer restrictions — consent required for any ownership change, broad affiliate definition
4. Reporting failures as Events of Default — failure to deliver financials on time is a default
5. Replacement of property manager — lender can force PM replacement without borrower default

**Failure mode:** Summarizes the loan agreement structure without identifying the clauses that create actual borrower exposure.

---

## The Winston "AI Super Test" — Full Portfolio Synthesis

**What it measures:** Ranking, synthesis, reasoning, and multi-document understanding in one prompt.

**Prompt**
```
You are a senior asset manager reviewing this investment at the end of Q3 2024.

Using all available documents, identify:
1. The three biggest financial risks to the property
2. The three biggest legal risks in the loan documents
3. The three biggest operational risks in the property reports

Rank each list by severity (High / Medium / Low).
For every risk, cite the specific document and section that supports it.
Conclude with a one-paragraph executive summary suitable for a limited partner update.
```

**Scoring rubric**

| Dimension | Weak | Strong |
|---|---|---|
| Financial risks | Generic (vacancy, rates) | Deal-specific (cash sweep at 1.19x DSCR, SOFR exposure, renovation cost overrun) |
| Legal risks | Generic (default, guaranty) | Specific (carveout triggers, transfer restriction, ALR absolute assignment) |
| Operational risks | Generic (maintenance, turnover) | Specific (33/48 Phase 1 units completed, lease-up velocity, delinquency rate) |
| Citation quality | None or hallucinated | Section-level with accurate quotes |
| LP summary | Generic narrative | Quantified, honest about cash sweep status |

---

## The One-Question Litmus Test

> **"Are we about to breach our loan covenant?"**

If the AI can answer this with citations and math — surfacing that DSCR is 1.19x at origination, the cash sweep is active, Q3 2024 is the first qualifying quarter at 1.27x, and one more qualifying quarter is needed to release — **you have a product that PE firms and institutional asset managers will immediately understand.**

If it hedges, hallucinates, or can't find the number, the RAG pipeline needs work.

---

## Scoring Guide

Use this across all tests:

| Score | Criteria |
|---|---|
| ✅ Pass | Correct answer, correct citations, correct math |
| ⚠️ Partial | Correct conclusion, missing citations or one wrong number |
| ❌ Fail | Wrong answer, hallucinated citations, or no attempt at calculation |

Track scores by model, chunking strategy, and embedding model to measure pipeline improvements over time.

---

*Document set: 20 files, Cascade Ridge Apartments, Aurora CO. Loan: $28.35M at SOFR+285bps, 3-year IO, DSCR 1.19x at origination.*

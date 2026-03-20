# Competitor-Derived Demo Ideas — 2026-03-20

---

### Demo: NOI Bridge Explainer — Inspired by Cherre NOI Delta Explainer Agent

**The competitor claim:** "Cherre says: 'Our NOI Delta Explainer agent automatically explains NOI changes between periods with narrative attribution.'"

**The Winston version:**
Winston demonstrates the same capability with deeper domain context — it doesn't just explain what changed, it connects the NOI delta to fund-level implications (DSCR covenant proximity, waterfall tier impact, LP distribution effects). Winston knows the property AND the fund structure.

**Demo flow (5-8 steps):**
1. Open Winston chat workspace
2. Type: "Why did NOI drop at Riverdale Commons this quarter?"
3. Winston returns a waterfall chart showing NOI bridge: Q3 → Q4
4. Top drivers annotated: vacancy increase (+2 units), insurance premium spike, property tax reassessment
5. Winston automatically flags: "This drops DSCR to 1.18x — below your 1.20x covenant threshold on the Meridian Debt facility"
6. Click "Stress Test" — Winston models what happens if vacancy persists for 2 more quarters
7. Winston generates a recommended action plan: "Consider rent adjustment on 3 units to accelerate re-leasing"
8. Export as LP-ready variance commentary document

**The key difference to highlight:**
"Cherre's agent explains the NOI change. Winston explains what it means for your fund — your DSCR, your waterfall, your LP distributions. That's the difference between a data tool and an investment environment."

**Build status:** Needs `explain_noi_delta` MCP tool + waterfall chart rendering in chat workspace. Core data exists. Estimated 3-5 days.

**Best persona for this demo:** CFO / Asset Manager

---

### Demo: Instant IC Memo — Inspired by Dealpath IC Memo Generation

**The competitor claim:** "Dealpath says: 'Generate investment committee teasers and memos from live deal data with structured, reportable assumptions.'"

**The Winston version:**
Winston generates IC memos that include not just deal data but comparative portfolio context — how this deal fits within the existing fund, what it does to portfolio concentration, and how it affects fund-level returns.

**Demo flow (5-8 steps):**
1. Open Deal Radar in Winston
2. Select "Meridian Industrial — Austin, TX" from pipeline
3. Click "Generate IC Memo" or ask Winston in chat: "Draft an IC teaser for Meridian Industrial"
4. Winston generates a formatted memo: property overview, market context, financial summary (NOI, cap rate, projected IRR), investment thesis, risk factors
5. Winston adds: "Portfolio Impact: Adding this asset increases Fund III industrial allocation to 34% (target: 30-40%). Projected fund IRR improves from 14.2% to 14.8%."
6. Winston flags: "Risk: Austin industrial vacancy trending up — 180bps over 12 months. Recommend stress testing at 8% vacancy."
7. Click "Export as PDF" — formatted IC memo ready for committee
8. Compare against UW baseline: "Here's how current assumptions compare to our original screening"

**The key difference to highlight:**
"Dealpath generates a deal memo. Winston generates a deal memo that knows your entire portfolio — fund allocation, return impact, concentration risk. Because Winston is your investment environment, not just your deal tracker."

**Build status:** Needs `generate_ic_memo` MCP tool + document template. Deal Radar data exists. Estimated 3-5 days.

**Best persona for this demo:** GP / Acquisitions Director

---

### Demo: Smart Rent Roll Audit — Inspired by Cherre Rent Roll Validator

**The competitor claim:** "Cherre says: 'Our Rent Roll Validator agent identifies leasing data inconsistencies automatically.'"

**The Winston version:**
Winston validates the rent roll AND connects findings to financial impact — flagging not just data inconsistencies but their effect on NOI, valuation, and underwriting assumptions.

**Demo flow (5-8 steps):**
1. Upload a rent roll PDF to Winston
2. Winston extracts and structures the data (unit, tenant, rent, lease dates, SF)
3. Winston runs validation: cross-references against property records and lease abstracts
4. Results: "Found 4 issues: 2 expired leases still showing in-place rent, 1 unit SF mismatch (rent roll says 1,200 SF, property records say 1,050 SF), 1 duplicate entry"
5. Winston quantifies: "These errors overstate in-place NOI by $47,200/year. Corrected cap rate moves from 5.8% to 6.1%."
6. Winston shows the valuation impact: "At 5.8% cap, value is $18.2M. At corrected 6.1%, value is $17.3M. Difference: $900K."
7. Click "Generate Corrected Rent Roll" — clean version with flagged items resolved
8. Export validation report for due diligence file

**The key difference to highlight:**
"Cherre validates the rent roll. Winston validates the rent roll AND tells you what it means for your deal price. That $900K correction? That's your negotiating leverage."

**Build status:** Needs `validate_rent_roll` MCP tool + rent roll extraction schema. Document pipeline exists. Estimated 3-5 days.

**Best persona for this demo:** Acquisitions Analyst / Asset Manager

---

### Demo: OM Speed Screen — Inspired by Dealpath AI Data Extract + AI Deal Screening

**The competitor claim:** "Dealpath says: 'AI Extract automates OM abstraction in under 1 minute with 95% accuracy for 90+ fields. AI Deal Screening reduces screening from hours to minutes.'"

**The Winston version:**
Winston not only extracts OM data but immediately screens it against the fund's specific investment criteria — return thresholds, market preferences, property type targets, concentration limits — and renders a go/no-go recommendation with supporting analysis.

**Demo flow (6 steps):**
1. Upload an OM PDF to Winston chat
2. Winston extracts 90+ fields in seconds: property details, financials, tenant info, market data
3. Winston auto-populates a Deal Radar entry
4. Winston screens against Fund III criteria: "Target IRR: 15%+, Markets: Southeast + Texas, Property type: Industrial/Multifamily, Max basis: $25M"
5. Winston renders screening verdict: "PASS — Projected IRR 16.2%, Austin TX (target market), Industrial, $18.5M basis. Proceed to underwriting."
6. Winston adds: "Flag: Largest tenant (38% of NRA) lease expires in 14 months. Recommend tenant credit analysis before IC."

**The key difference to highlight:**
"Dealpath extracts data from OMs. Winston extracts data, screens it against your fund's criteria, and tells you whether to pursue — with the specific risks flagged. One step vs. three."

**Build status:** Needs OM extraction enhancement + fund criteria screening logic. Document pipeline and Deal Radar exist. Estimated 1-2 weeks.

**Best persona for this demo:** GP / Acquisitions Director

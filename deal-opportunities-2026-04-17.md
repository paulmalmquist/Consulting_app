# Novendor Deal Opportunity Miner — 2026-04-17

Five high-fit REPE prospects loaded into the Novendor CRM. Every company has a full record set: crm_account, cro_lead_profile, cro_strategic_lead, cro_lead_hypothesis, cro_strategic_contact (3 each), and crm_opportunity at the research pipeline stage. All five opportunities are live on the pipeline board.

## Summary Table

| Company | Lead Score | Stage | Opportunity Created | Contacts |
|---|---:|---|:---:|---:|
| Electra America | 85 | research | ✓ | 3 |
| Virtus Real Estate Capital | 82 | research | ✓ | 3 |
| Asana Partners | 80 | research | ✓ | 3 |
| Stockdale Capital Partners | 74 | research | ✓ | 3 |
| Bridge33 Capital | 71 | research | ✓ | 3 |

## Company Detail

### Virtus Real Estate Capital — Lead Score 82
Austin-based multi-sector REPE with roughly $4B AUM and a fresh Fund VIII close in 2024. Active across multifamily, self-storage, student housing and senior living. Estimated engagement value $135K.

Top opportunity: **Virtus Real Estate Capital - Consulting Engagement** ($135,000, 90-day close target). Pain: manual Yardi/Excel blending across four property types creates quarter-close fragility. Stack: Yardi Voyager, Excel, Juniper Square.

Wedge angle: Automate the multi-sector fund-level LP reporting pack from Yardi property data with auditable lineage.

Contacts loaded (placeholders — verify via LinkedIn before outreach): CFO, COO, Head of Asset Management.

### Electra America — Lead Score 85 (highest)
Aventura FL multifamily REPE with $4B+ AUM across ~60 assets. Recent Head of Data hire is the strongest platform-readiness signal of the five. Estimated engagement value $165K.

Top opportunity: **Electra America - Consulting Engagement** ($165,000, 90-day close target). Pain: ~600 analyst hours per quarter on manual Excel reconciliations and Yardi + Investran integration gaps duplicating journal work across fund and property accounting. Stack: Yardi Voyager, Excel, Anaplan, Investran.

Wedge angle: Install Winston reporting and reconciliation layer on top of Yardi to cut the close cycle and absorb AUM growth without headcount.

Contacts loaded: CFO, Head of Data (CIO buyer type), Head of Asset Management.

### Bridge33 Capital — Lead Score 71
Seattle grocery-anchored retail REPE with ~$1.5B AUM. Closed Fund II in 2024; hiring an Asset Management Analyst. Lean finance team still Excel-first. Estimated engagement value $90K.

Top opportunity: **Bridge33 Capital - Consulting Engagement** ($90,000, 90-day close target). Pain: Excel-first tenant sales and percentage rent recs, plus manual LP reporting diverting bandwidth from Fund II deployment. Stack: MRI, Excel, Juniper Square.

Wedge angle: Stand up a fund-level reporting and investor-ready narrative engine before Fund II LPs demand institutional-grade reporting.

Contacts loaded: CFO, COO, Director of Asset Management.

### Asana Partners — Lead Score 80
Charlotte neighborhood retail REPE with ~$3B AUM across Fund I/II/III; Fund III is deploying. Institutional LP base (state pension mandates) raises the governance and reporting bar sharply. Estimated engagement value $150K.

Top opportunity: **Asana Partners - Consulting Engagement** ($150,000, 90-day close target). Pain: manual ILPA and ESG disclosure pipeline; quarterly NAV and property-level reconciliations consume 3+ weeks. Stack: Yardi Voyager, Excel, Anaplan, iLEVEL.

Wedge angle: Replace the manual ILPA/ESG compliance pipeline with an auditable, AI-assisted workflow tied to Yardi + iLEVEL source data.

Contacts loaded: CFO, Head of Investor Relations, Head of Portfolio Management.

### Stockdale Capital Partners — Lead Score 74
LA-based value-add office/healthcare REPE with ~$2.5B AUM. Recent AM leadership additions; dual-asset-class strategy creates cross-platform reporting friction. Estimated engagement value $110K.

Top opportunity: **Stockdale Capital Partners - Consulting Engagement** ($110,000, 90-day close target). Pain: cross-platform consolidation across Yardi + Argus eats ~300 analyst hours per quarter; healthcare lease reconciliations (reimbursement structures) are brittle. Stack: Yardi, Excel, Argus Enterprise.

Wedge angle: Create a unified cross-asset-class analytics and reporting layer so new AM leadership can trust portfolio numbers on day one.

Contacts loaded: CFO, COO, Head of Asset Management.

## Verification

Query executed against Supabase project `ozboonlsplroialdwuxj` confirmed all 5 companies show:
- lead_profiles = 1
- strategic_leads = 1
- hypotheses = 1
- contacts = 3
- opportunities = 1 (open, research stage)

All five opportunities are visible on the pipeline board. Total pipeline value loaded this run: **$650,000**.

## Notes

Contacts are inserted with placeholder names flagged `[TBD - verify via LinkedIn]`. The outreach workflow should resolve real contact identities before drafting email sequences — scheduled task did not enrich contact identities this run to avoid fabricating named individuals.

Opportunity thesis, pain, and winston_angle fields are populated on each `crm_opportunity` row so the pipeline board shows the full wedge at a glance.

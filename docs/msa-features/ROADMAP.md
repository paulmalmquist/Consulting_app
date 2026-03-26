# MSA Feature Roadmap

> Auto-updated by `msa-feature-builder` scheduled task.
> Last updated: 2026-03-25

---

## Backlog Summary

| Status | Count |
|---|---|
| identified | 0 |
| specced | 3 |
| prompted | 11 |
| built | 0 |
| verified | 0 |
| **Total** | **14** |

---

## Top 14 Cards by Priority

| Rank | Card | Priority | Status | Category |
|---|---|---|---|---|
| 1 | MSA Research Sweep Runner — Phase 1 Automation | 72 | **prompted** | workflow |
| 1 | County Assessor / Recorder Live Data Connector | 72 | **prompted** | data_source |
| 3 | Sub-MSA Acquisition Score Calculator | 60 | **prompted** | calculation |
| 4 | Zone Intelligence Dashboard — Submarket Heat Map + Brief Viewer | 54 | **prompted** | visualization |
| 4 | Supply-Demand Absorption Model for Submarket Acquisition Scoring | 54 | **prompted** | calculation |
| 6 | Supply Pipeline Delivery Schedule — Units-by-Quarter vs. Demand Chart | 49 | **prompted** | visualization |
| 7 | BLS QCEW + FRED Employment Series Auto-Pull for MSA Zones | 48 | **prompted** | data_source |
| 8 | Cap Rate Distribution by Asset Class — Submarket Estimator | 44.1 | **prompted** | calculation |
| 9 | CoStar / CBRE Submarket Rent + Vacancy Data Connector | 42 | **prompted** | data_source |
| 10 | Lis Pendens / NOD Scraper — County Clerk by Neighborhood | 39.2 | **prompted** | data_source |
| 11 | Trepp / CREFC CMBS Delinquency Rate Connector for MSA Zones | 34 | **prompted** | data_source |
| 12 | City Building Permit Portal Connector — YTD Permits by Zone | 32 | specced | data_source |
| 13 | Block-Level Transaction Heat Map — Submarket Intelligence Layer | 25.2 | specced | visualization |
| 14 | Agency Lending Volume Tracker — Fannie/Freddie by MSA Zone | 18 | specced | data_source |

---

## Prompts Ready for Coding Session (3 PM autonomous loop)

The following 11 prompts are ready in `docs/msa-features/prompts/` for the 3 PM autonomous coding session:

### Previously prompted (2026-03-22 to 2026-03-24)

1. **`b1620471-msa-research-sweep-runner.md`** — Priority 72 — ROOT BLOCKER. Must be built first.
2. **`e769041f-county-assessor-connector.md`** — Priority 72 — Category 1 data gap.
3. **`30ef9cb6-sub-msa-acquisition-score-calculator.md`** — Priority 60 — Rotation algorithm blocker.
4. **`4068f9fe-zone-intelligence-dashboard.md`** — Priority 54 — First user-facing MSA surface.
5. **`7e571201-supply-demand-absorption-model.md`** — Priority 54 — Unblocks demand_momentum_score.
6. **`03a36c0e-supply-pipeline-delivery-schedule-chart.md`** — Priority 49 — Supply risk visualization.
7. **`934432de-bls-fred-employment-connector.md`** — Priority 48 — Independent demand-driver connector.
8. **`f2f51505-cap-rate-distribution-submarket-estimator.md`** — Priority 44.1 — Cap rate estimator from comps.

### NEW — Prompted today (2026-03-25)

9. **`6b8407e7-costar-cbre-submarket-rent-vacancy-connector.md`** *(NEW 2026-03-25)* — Priority 42 — **Primary rent/vacancy data connector.** Retrieves Class A/B/C asking rent, effective rent, and vacancy rates at the submarket level. Fallback chain: CoStar API → CBRE PDF → RealPage free → web fallback. Affects all 14 watchlist zones. Surfaced by WPB Downtown (impact-9 gap) and confirmed by Miami-Wynwood brief.

10. **`5bcffc26-lis-pendens-nod-scraper-county-clerk.md`** *(NEW 2026-03-25)* — Priority 39.2 — **Neighborhood-level distress signal scraper.** Scrapes lis pendens and NOD filings from county clerk portals by ZIP code. Populates the null distress_level signal in zone briefs. Handles 5 county formats (Miami-Dade, Broward, Cook, Dallas, Harris). Affects 7/10 watchlist zones.

11. **`d1de8210-trepp-crefc-cmbs-delinquency-connector.md`** *(NEW 2026-03-25)* — Priority 34 — **CMBS delinquency early warning connector.** Surfaces CMBS delinquency rates and maturing loan schedules for distressed-opportunity identification. Critical context: $162.1B multifamily maturities in 2026 refinancing wall. Fallback: Trepp API → CREFC monthly PDF → web fallback. Affects 8/14 zones with CMBS exposure.

---

## Cards Completed This Week

None yet — first prompted batch was 2026-03-22. The 3 PM autonomous coding session targets prompted cards.

---

## Cards Specced (Queued for Next Prompt Batch)

| Card | Priority | Category | Notes |
|---|---|---|---|
| City Building Permit Portal Connector — YTD Permits by Zone | 32 | data_source | Free public data; straightforward scraper |
| Block-Level Transaction Heat Map — Submarket Intelligence Layer | 25.2 | visualization | Depends on county assessor connector (card 2) |
| Agency Lending Volume Tracker — Fannie/Freddie by MSA Zone | 18 | data_source | HMDA/FFIEC public data; low priority |

---

## Pipeline Health Notes (2026-03-25)

- **MSA pipeline OPERATIONAL** — 14 total cards, 11 now prompted, 3 remaining specced
- **3 new prompts generated today** (2026-03-25): CoStar/CBRE rent connector, Lis Pendens/NOD scraper, Trepp/CMBS delinquency connector — all data_source category
- **Today's prompts are all data connectors** that feed the same MSA research sweep pipeline. Building them as a batch would give dramatically better signal coverage.
- **No conflicts** with current non-MSA priorities. Feature radar top items (Adaptive Thinking Tiers, Finance Agent Benchmark Positioning, Context Compaction) are all AI gateway work — completely isolated from MSA data connectors.
- **No capability inventory overlap** — none of these connectors exist in the current platform (verified against CAPABILITY_INVENTORY.md).
- **Recommended build order for 3 PM session:** Continue with highest-priority prompted cards (Sweep Runner at 72, County Assessor at 72, Acquisition Score Calculator at 60). Today's new prompts slot in at positions 9-11 in the priority queue.

---

## Category Distribution

| Category | Prompted | Specced | Total |
|---|---|---|---|
| data_source | 5 | 2 | 7 |
| calculation | 3 | 0 | 3 |
| visualization | 2 | 1 | 3 |
| workflow | 1 | 0 | 1 |

---

## Card Status Definitions

| Status | Meaning |
|---|---|
| `identified` | Gap found during research sweep; needs review to decide if worth building |
| `specced` | Spec written in `spec_json`; ready to be converted to a meta prompt |
| `prompted` | Meta prompt written and ready for coding agent to execute |
| `built` | Code committed and pushed; awaiting verification |
| `verified` | Test cases pass; card closed |

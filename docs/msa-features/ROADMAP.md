# MSA Feature Roadmap

> Auto-updated by `msa-feature-builder` scheduled task.
> Last updated: 2026-03-26

---

## Backlog Summary

| Status | Count |
|---|---|
| identified | 0 |
| specced | 0 |
| prompted | 17 |
| built | 0 |
| verified | 0 |
| **Total** | **17** |

All specced cards have been converted to prompted. The backlog is fully prompted and awaiting build execution by the autonomous-coding-session (3 PM daily).

---

## Top 10 Cards by Priority

| Rank | Card | Priority | Status | Category |
|---|---|---|---|---|
| 1 | MSA Research Sweep Runner — Phase 1 Automation | 72.00 | prompted | workflow |
| 1 | County Assessor / Recorder Live Data Connector | 72.00 | prompted | data_source |
| 3 | Sub-MSA Acquisition Score Calculator | 60.00 | prompted | workflow |
| 4 | Zone Intelligence Dashboard — Submarket Heat Map + Brief Viewer | 54.00 | prompted | visualization |
| 4 | Supply-Demand Absorption Model for Submarket Acquisition Scoring | 54.00 | prompted | workflow |
| 6 | BLS QCEW + FRED Employment Series Auto-Pull for MSA Zones | 51.00 | prompted | data_source |
| 7 | Supply Pipeline Delivery Schedule — Units-by-Quarter vs. Demand Chart | 49.00 | prompted | visualization |
| 8 | CoStar / CBRE Submarket Rent + Vacancy Data Connector | 45.00 | prompted | data_source |
| 9 | Cap Rate Distribution by Asset Class — Submarket Estimator | 44.10 | prompted | visualization |
| 10 | Lis Pendens / NOD Scraper — County Clerk by Neighborhood | 42.20 | prompted | data_source |

---

## Prompts Ready for Coding Session (3 PM autonomous loop)

17 prompts are ready in `docs/msa-features/prompts/` for the 3 PM autonomous coding session.

### Previously prompted (2026-03-22 to 2026-03-25)

1. **`b1620471-msa-research-sweep-runner.md`** — Priority 72 — ROOT BLOCKER. Must be built first.
2. **`e769041f-county-assessor-connector.md`** — Priority 72 — Category 1 data gap.
3. **`30ef9cb6-sub-msa-acquisition-score-calculator.md`** — Priority 60 — Rotation algorithm blocker.
4. **`4068f9fe-zone-intelligence-dashboard.md`** — Priority 54 — First user-facing MSA surface.
5. **`7e571201-supply-demand-absorption-model.md`** — Priority 54 — Unblocks demand_momentum_score.
6. **`03a36c0e-supply-pipeline-delivery-schedule-chart.md`** — Priority 49 — Supply risk visualization.
7. **`934432de-bls-fred-employment-connector.md`** — Priority 51 — Independent demand-driver connector.
8. **`f2f51505-cap-rate-distribution-submarket-estimator.md`** — Priority 44.1 — Cap rate estimator from comps.
9. **`6b8407e7-costar-cbre-submarket-rent-vacancy-connector.md`** — Priority 45 — Primary rent/vacancy data connector.
10. **`5bcffc26-lis-pendens-nod-scraper-county-clerk.md`** — Priority 42.2 — Neighborhood-level distress signal scraper.
11. **`d1de8210-trepp-crefc-cmbs-delinquency-connector.md`** — Priority 34 — CMBS delinquency early warning connector.

### NEW — Prompted today (2026-03-26)

12. **`3fbd2b8e-cap-rate-trend-chart.md`** *(NEW 2026-03-26)* — Priority 37.80 — **Cap Rate Trend Chart.** Time-series visualization of submarket cap rates over 5-10 years by asset class. Shows pricing trajectory and compression/expansion cycles. Requires new `msa_cap_rate_history` table. Surfaced by Tampa Water Street brief (point-in-time rates only, no trend data).

13. **`1337ed2f-city-building-permit-portal-connector.md`** *(NEW 2026-03-26)* — Priority 35.00 — **City Building Permit Portal Connector.** Pulls YTD building permit counts from Socrata/city data portals for zone supply_risk signal. Covers 8 major cities. Surfaced by Miami-Wynwood (null permits_ytd) and confirmed by Tampa Water Street.

14. **`77cf09b9-score-delta-tracking.md`** *(NEW 2026-03-26)* — Priority 32.00 — **Score Delta Tracking.** Run-over-run comparison of zone composite and signal scores. Auto-computes deltas on subsequent rotations. No schema change needed (query-based approach). Surfaced by Tampa Water Street first rotation (no baseline to compare against).

---

## Cards Completed This Week

None yet — first prompted batch was 2026-03-22. The 3 PM autonomous coding session targets prompted cards by priority.

---

## Cards Specced (Queued for Next Prompt Batch)

No cards currently in `specced` status. All 17 cards are prompted and ready for build.

Remaining cards not in top 10 (prompted 2026-03-25):

| Card | Priority | Category |
|---|---|---|
| Trepp / CREFC CMBS Delinquency Rate Connector | 34.00 | data_source |
| Block-Level Transaction Heat Map | 25.20 | visualization |
| Agency Lending Volume Tracker — Fannie/Freddie | 18.00 | data_source |

---

## Pipeline Health Notes (2026-03-26)

- **MSA pipeline FULLY PROMPTED** — 17 total cards, all in `prompted` status, 0 specced remaining
- **3 new prompts generated today** (2026-03-26): Cap Rate Trend Chart, City Building Permit Portal Connector, Score Delta Tracking — mix of visualization, data_source, and workflow categories
- **3 new cards were added to backlog** today from the Tampa Water Street brief gap detection (Phase 2), bringing total from 14 to 17
- **No conflicts** with current non-MSA priorities. Feature radar top items (Deal Room Mode, NOI Delta Explainer, IC Memo Generator) are REPE-focused — completely isolated from MSA data connectors.
- **No capability inventory overlap** — none of today's features exist in the current platform (verified against CAPABILITY_INVENTORY.md).
- **Recommended build order for 3 PM session:** Continue with highest-priority prompted cards (Sweep Runner at 72, County Assessor at 72, Acquisition Score Calculator at 60). Today's new prompts slot in at positions 12-14 in the priority queue.

---

## Category Distribution

| Category | Count | % |
|---|---|---|
| data_source | 7 | 41% |
| visualization | 5 | 29% |
| workflow | 5 | 29% |

The backlog is data-source heavy, reflecting that the MSA Rotation Engine's research sweeps frequently surface missing data connectors as the primary gap type.

---

## Card Status Definitions

| Status | Meaning |
|---|---|
| `identified` | Gap found during research sweep; needs review to decide if worth building |
| `specced` | Spec written in `spec_json`; ready to be converted to a meta prompt |
| `prompted` | Meta prompt written and ready for coding agent to execute |
| `built` | Code committed and pushed; awaiting verification |
| `verified` | Test cases pass; card closed |

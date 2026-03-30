# MSA Feature Roadmap

> Auto-updated by `msa-feature-builder` scheduled task.
> Last updated: 2026-03-29

---

## Backlog Summary

| Status | Count |
|---|---|
| identified | 0 |
| specced | 0 |
| prompted | 20 |
| built | 0 |
| verified | 0 |
| **Total** | **20** |

All specced cards have been converted to prompted. The gap-detection phase needs to run during the next zone rotation to replenish the specced backlog.

---

## Top 10 Cards by Priority

| Rank | Card | Priority | Status | Module |
|---|---|---|---|---|
| 1 | County Assessor / Recorder Live Data Connector | 77.00 | prompted | data_connectors |
| 2 | MSA Research Sweep Runner — Phase 1 Automation | 72.00 | prompted | msa_rotation_engine |
| 3 | Sub-MSA Acquisition Score Calculator | 60.00 | prompted | deal_analyzer |
| 4 | Supply-Demand Absorption Model for Submarket Acquisition Scoring | 59.00 | prompted | deal_analyzer |
| 5 | BLS QCEW + FRED Employment Series Auto-Pull for MSA Zones | 56.00 | prompted | data_connectors |
| 6 | Zone Intelligence Dashboard — Submarket Heat Map + Brief Viewer | 54.00 | prompted | portfolio_dashboard |
| 7 | CoStar / CBRE Submarket Rent + Vacancy Data Connector | 52.00 | prompted | data_connectors |
| 8 | Cap Rate Distribution by Asset Class — Submarket Estimator | 49.10 | prompted | MSA Intelligence — Zone Brief Scorer |
| 9 | Supply Pipeline Delivery Schedule — Units-by-Quarter vs. Demand Chart | 49.00 | prompted | portfolio_dashboard |
| 10 | Lis Pendens / NOD Scraper — County Clerk by Neighborhood | 45.20 | prompted | MSA Intelligence — Data Collectors |

---

## Cards Prompted This Session (2026-03-29)

1. **Development Pipeline Spatial Map — Project Overlay with Infrastructure Context** (24.00, visualization)
   - Prompt: `docs/msa-features/prompts/82049121-pipeline-spatial-map.md`
   - Lineage: nash-weho rotation — 7 pipeline projects around GEODIS Park with no spatial visualization of clustering or infrastructure proximity

2. **Municipal Regulatory Agenda Monitor — Zoning/PUD/Impact Fee Tracker** (12.60, workflow)
   - Prompt: `docs/msa-features/prompts/06f24f3d-regulatory-agenda-monitor.md`
   - Lineage: Orlando Creative Village/Parramore rotation — city council agenda parsing gap. Cross-zone applicability: ~10 of 14 watchlist zones

3. **Opportunity Zone Capital Flow Tracker — Census Tract Investment Volume** (9.00, data_source)
   - Prompt: `docs/msa-features/prompts/894b8421-oz-capital-flow-tracker.md`
   - Lineage: nash-weho rotation — OZ tracts present but capital flows untraceable
   - Risk: HIGH data source dependency — building permits via open data portals are the most accessible starting point

---

## Cards Prompted 2026-03-27

1. **Block-Level Transaction Heat Map — Submarket Intelligence Layer** (27.20) — Interactive Mapbox GL map with transaction pins, pipeline polygons, and distress heat gradient. Lineage: Miami-Wynwood + Orlando.
2. **Agency Lending Volume Tracker — Fannie/Freddie by MSA Zone** (18.00) — FHFA public data parser for agency lending volumes to fill capital_availability signal gaps. Lineage: Miami-Wynwood.
3. **Opportunity Zone Boundary Overlay — Parcel-Level OZ Eligibility Map** (15.00) — CDFI Fund OZ tract overlay on zone geometry with sunset urgency display. Lineage: Tampa-Water Street.

---

## Cards Completed This Week

None yet. The autonomous-coding-session (3 PM daily) reads from `docs/msa-features/prompts/` and executes prompted cards in priority order.

---

## Projected Next Builds

The 3 PM autonomous coding session should pick up the highest-priority prompted cards:

1. **County Assessor / Recorder Live Data Connector** (77.00) — Foundational data layer, feeds multiple downstream features
2. **MSA Research Sweep Runner** (72.00) — Automates Phase 1 sweeps, highest leverage for engine autonomy
3. **Sub-MSA Acquisition Score Calculator** (60.00) — Core scoring model for deal analysis
4. **Supply-Demand Absorption Model** (59.00) — Paired with acquisition score for deal feasibility
5. **Zone Intelligence Dashboard** (54.00) — Primary visualization surface for all zone data

---

## Category Distribution

| Category | Count |
|---|---|
| data_source | 8 |
| visualization | 6 |
| calculation | 3 |
| workflow | 3 |

---

## Backlog Health

- **Specced cards remaining:** 0 — gap-detection needs to run during next rotation to replenish
- **Prompted cards awaiting build:** 20 — healthy depth, ~6-7 weeks at 3/day max
- **Built cards:** 0 — no cards have completed the full build cycle yet
- **Verified cards:** 0 — verification step not yet reached
- **Pipeline spatial map + OZ capital tracker share infrastructure** with existing OZ Boundary Overlay and Block-Level Heat Map cards — building them in sequence creates reusable Mapbox/Leaflet patterns

---

## Notes

- All 20 prompted cards have self-contained meta prompts in `docs/msa-features/prompts/`
- No cards have been built yet — the pipeline is front-loaded with prompts awaiting the coding session
- The Pipeline Spatial Map, Block-Level Transaction Heat Map, and OZ Overlay share map infrastructure — building them in sequence creates reusable patterns
- The Regulatory Agenda Monitor is a novel capability with high cross-zone applicability (~10/14 zones)
- The OZ Capital Flow Tracker has the highest data source risk of any card — recommend building the permit-based signal first

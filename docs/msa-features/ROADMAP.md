# MSA Feature Roadmap

> Auto-updated by `msa-feature-builder` scheduled task.
> Last updated: 2026-03-27

---

## Backlog Summary

| Status | Count |
|---|---|
| identified | 0 |
| specced | 1 |
| prompted | 17 |
| built | 0 |
| verified | 0 |
| **Total** | **18** |

---

## Top 10 Cards by Priority

| Rank | Card | Priority | Status | Module |
|---|---|---|---|---|
| 1 | MSA Research Sweep Runner — Phase 1 Automation | 72.00 | prompted | msa_rotation_engine |
| 2 | County Assessor / Recorder Live Data Connector | 72.00 | prompted | data_connectors |
| 3 | Sub-MSA Acquisition Score Calculator | 60.00 | prompted | deal_analyzer |
| 4 | Zone Intelligence Dashboard — Submarket Heat Map + Brief Viewer | 54.00 | prompted | portfolio_dashboard |
| 5 | Supply-Demand Absorption Model for Submarket Acquisition Scoring | 54.00 | prompted | deal_analyzer |
| 6 | BLS QCEW + FRED Employment Series Auto-Pull for MSA Zones | 51.00 | prompted | data_connectors |
| 7 | Supply Pipeline Delivery Schedule — Units-by-Quarter vs. Demand Chart | 49.00 | prompted | portfolio_dashboard |
| 8 | Lis Pendens / NOD Scraper — County Clerk by Neighborhood | 45.20 | prompted | MSA Intelligence — Data Collectors |
| 9 | CoStar / CBRE Submarket Rent + Vacancy Data Connector | 45.00 | prompted | data_connectors |
| 10 | Cap Rate Distribution by Asset Class — Submarket Estimator | 44.10 | prompted | MSA Intelligence — Zone Brief Scorer |

---

## Cards Prompted This Session (2026-03-27)

1. **Block-Level Transaction Heat Map — Submarket Intelligence Layer** (27.20) — Interactive Mapbox GL map with transaction pins, pipeline polygons, and distress heat gradient. Lineage: Miami-Wynwood + Orlando.
2. **Agency Lending Volume Tracker — Fannie/Freddie by MSA Zone** (18.00) — FHFA public data parser for agency lending volumes to fill capital_availability signal gaps. Lineage: Miami-Wynwood.
3. **Opportunity Zone Boundary Overlay — Parcel-Level OZ Eligibility Map** (15.00) — CDFI Fund OZ tract overlay on zone geometry with sunset urgency display. Lineage: Tampa-Water Street.

---

## Cards Completed This Week

None yet. The autonomous-coding-session (3 PM daily) reads from `docs/msa-features/prompts/` and executes prompted cards in priority order.

---

## Projected Next Builds

The 3 PM autonomous coding session should pick up the highest-priority prompted cards. Current execution order recommendation:

1. **MSA Research Sweep Runner** (72.00) — Automates Phase 1 sweeps, highest leverage
2. **County Assessor Connector** (72.00) — Live data connector, feeds multiple downstream features
3. **Sub-MSA Acquisition Score Calculator** (60.00) — Core scoring model
4. **Zone Intelligence Dashboard** (54.00) — Primary visualization surface for all zone data
5. **Block-Level Transaction Heat Map** (27.20) — Spatial drill-down, depends on geocoding service

---

## Remaining Specced (Needs Prompting)

1 card remains in `specced` status and will be prompted in the next run if it passes capability inventory checks.

---

## Notes

- All 17 prompted cards have self-contained meta prompts in `docs/msa-features/prompts/`
- No cards have been built yet — the pipeline is front-loaded with prompts awaiting the coding session
- The Block-Level Transaction Heat Map and OZ Overlay share Mapbox GL infrastructure — building the heat map first creates reusable patterns for the OZ overlay
- The Agency Lending Volume Tracker is a pure backend data connector with no frontend dependencies — good candidate for quick wins

# MSA Feature Roadmap

> Auto-updated by `msa-feature-builder` scheduled task.
> Last updated: 2026-03-24

---

## Backlog Summary

| Status | Count |
|---|---|
| identified | 0 |
| specced | 6 |
| prompted | 8 |
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
| 8 | Cap Rate Distribution by Asset Class — Submarket Estimator | 44 | **prompted** | calculation |
| 9 | CoStar / CBRE Submarket Rent + Vacancy Data Connector | 42 | specced | data_source |
| 10 | Lis Pendens / NOD Scraper — County Clerk by Neighborhood | 39 | specced | data_source |
| 11 | Trepp / CREFC CMBS Delinquency Rate Connector for MSA Zones | 34 | specced | data_source |
| 12 | City Building Permit Portal Connector — YTD Permits by Zone | 32 | specced | data_source |
| 13 | Block-Level Transaction Heat Map — Submarket Intelligence Layer | 25 | specced | visualization |
| 14 | Agency Lending Volume Tracker — Fannie/Freddie by MSA Zone | 18 | specced | data_source |

---

## Prompts Ready for Coding Session (3 PM autonomous loop)

The following prompts are ready in `docs/msa-features/prompts/` for the 3 PM autonomous coding session:

### Previously prompted (2026-03-22 to 2026-03-23)

1. **`b1620471-msa-research-sweep-runner.md`** — Priority 72 — ROOT BLOCKER. Must be built first — nothing else in the MSA pipeline runs without it.

2. **`e769041f-county-assessor-connector.md`** — Priority 72 — Category 1 data gap. Structured deed records and lis pendens.

3. **`30ef9cb6-sub-msa-acquisition-score-calculator.md`** — Priority 60 — Rotation algorithm blocker. All 14 zones have `rotation_priority_score = 0.00`.

4. **`4068f9fe-zone-intelligence-dashboard.md`** — Priority 54 — First user-facing MSA surface. Supabase Realtime enabled.

5. **`934432de-bls-fred-employment-connector.md`** — Priority 48 — Independent demand-driver connector.

### NEW — Prompted today (2026-03-24)

6. **`7e571201-supply-demand-absorption-model.md`** *(NEW 2026-03-24)* — Priority 54 — **Unblocks demand_momentum_score for the acquisition score calculator.** Implements `msa_absorption_model.py` server-side service computing supply overhang, months-of-supply, and demand momentum score from brief pipeline signals. Triggered from rotation engine on every brief write. WPB (4,085 units) and Miami-Wynwood (1,317 units) both surfaced this gap. **Execute before running card 3 on a live brief.**

7. **`03a36c0e-supply-pipeline-delivery-schedule-chart.md`** *(NEW 2026-03-24)* — Priority 49 — First supply risk visualization. Stacked bar chart (8 forward quarters of deliveries) + net absorption overlay + PNG export. New `SupplyPipelineChart.tsx` in `repo-b/src/components/msa/`. **Independent of absorption model — can build in parallel.**

8. **`f2f51505-cap-rate-distribution-submarket-estimator.md`** *(NEW 2026-03-24)* — Priority 44 — Cap rate estimator from closed comps in zone briefs. Miami-Wynwood has 3 actionable comps ($180M 545Wyn, $72M Wynwood Norte, $33.5M land). Adds `msa_brief_scorer.py` + `cap_rate_estimates` column + `CapRateEstimatePanel.tsx`. **Fully independent — build in any order.**

**Recommended build order for 3 PM session:**
- Card 6 (absorption model) first — unblocks demand_momentum_score for acquisition score calculator (card 3)
- Cards 7 and 8 in parallel after card 6 — independent of each other
- Or: build card 8 (cap rate) in parallel while card 6 runs

---

## Cards Completed This Week

None yet — first prompted batch was 2026-03-22. The 3 PM autonomous coding session targets prompted cards.

---

## Cards Specced (Queued for Next Prompt Batch — 2026-03-25+)

| Card | Priority | Category | Notes |
|---|---|---|---|
| CoStar / CBRE Submarket Rent + Vacancy Data Connector | 42 | data_source | Commercial API — needs key evaluation before prompting |
| Lis Pendens / NOD Scraper — County Clerk by Neighborhood | 39 | data_source | Free public data; spec is clean; ready to prompt |
| Trepp / CREFC CMBS Delinquency Rate Connector for MSA Zones | 34 | data_source | Commercial data — needs spec review |
| City Building Permit Portal Connector — YTD Permits by Zone | 32 | data_source | Free public data; straightforward scraper |
| Block-Level Transaction Heat Map — Submarket Intelligence Layer | 25 | visualization | Depends on county assessor connector (card 2) |
| Agency Lending Volume Tracker — Fannie/Freddie by MSA Zone | 18 | data_source | HMDA/FFIEC public data; low priority |

**Next prompt batch recommendation (2026-03-25):** Lis Pendens / NOD Scraper (priority 39) has free public data and a clean spec — no API key required. City Building Permit Portal (priority 32) is similar. Recommend prompting these two next; defer CoStar/Trepp until commercial API decisions are made.

---

## Projected Build Timeline

| Card | Priority | Dependency | Projected Prompt Date |
|---|---|---|---|
| Lis Pendens / NOD Scraper | 39 | None | 2026-03-25 |
| City Building Permit Portal | 32 | None | 2026-03-25 |
| CoStar / CBRE Rent + Vacancy | 42 | API key decision | TBD |
| Trepp / CREFC CMBS Delinquency | 34 | Spec review | TBD |
| Block-Level Transaction Heat Map | 25 | County Assessor Connector (card 2) | After card 2 built |
| Agency Lending Volume Tracker | 18 | None | 2026-03-26+ |

---

## Pipeline Health Notes (2026-03-24)

- **MSA pipeline OPERATIONAL** — First briefs completed: WPB-Downtown (2026-03-23) + Miami-Wynwood/Edgewater score 7.0/10 (2026-03-24)
- **8 prompts now ready** for the 3 PM coding session — absorption model (card 6) should execute first to unblock demand_momentum_score for acquisition score calculator
- **3 new prompts generated today** (2026-03-24): absorption model, supply pipeline chart, cap rate estimator — driven by WPB and Miami-Wynwood sweeps
- **6 specced cards** remain queued — Lis Pendens and Building Permit are clean free-data specs; CoStar/Trepp need commercial API evaluation
- **No conflicts** with current non-MSA priorities (Stone PDS degraded, Meridian Capital SQL fix pending). MSA cards are isolated and don't touch shared services.
- **Feature radar alignment:** MSA cards isolated from top 2026-03-23 radar items (Deal Room Mode, Adaptive Thinking Budget, Excel Plugin — all AI gateway/add-in work). Build MSA cards in parallel.
- **Migration sequencing:** Next available migration is 419. Cap rate estimator migration (`420_msa_cap_rate_estimates.sql`) should confirm current max migration number before applying.
- **Prompt-to-build pipeline:** 8 prompts queued → 3 PM coding session reads from `docs/msa-features/prompts/` → marks cards `built` → next morning digest confirms

---

## Card Status Definitions

| Status | Meaning |
|---|---|
| `identified` | Gap found during research sweep; needs review to decide if worth building |
| `specced` | Spec written in `spec_json`; ready to be converted to a meta prompt |
| `prompted` | Meta prompt written and ready for coding agent to execute |
| `built` | Code committed and pushed; awaiting verification |
| `verified` | Test cases pass; card closed |

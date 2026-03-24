# MSA Feature Roadmap

> Auto-updated by `msa-feature-builder` scheduled task.
> Last updated: 2026-03-23

---

## Backlog Summary

| Status | Count |
|---|---|
| identified | 0 |
| specced | 4 |
| prompted | 5 |
| built | 0 |
| verified | 0 |
| **Total** | **9** |

---

## Top 9 Cards by Priority

| Rank | Card | Priority | Status | Category |
|---|---|---|---|---|
| 1 | MSA Research Sweep Runner — Phase 1 Automation | 72 | **prompted** | workflow |
| 2 | County Assessor / Recorder Live Data Connector | 65 | **prompted** | data_source |
| 3 | Sub-MSA Acquisition Score Calculator | 60 | **prompted** | calculation |
| 4 | Zone Intelligence Dashboard — Submarket Heat Map + Brief Viewer | 54 | **prompted** | visualization |
| 5 | BLS QCEW + FRED Employment Series Auto-Pull for MSA Zones | 48 | **prompted** | data_source |
| 6 | Supply Pipeline Delivery Schedule — Units-by-Quarter vs. Demand Chart | — | specced | visualization |
| 7 | Supply-Demand Absorption Model for Submarket Acquisition Scoring | — | specced | calculation |
| 8 | CoStar / CBRE Submarket Rent + Vacancy Data Connector | — | specced | data_source |
| 9 | Trepp / CREFC CMBS Delinquency Rate Connector for MSA Zones | — | specced | data_source |

---

## Prompts Ready for Coding Session (3 PM autonomous loop)

The following prompts are ready in `docs/msa-features/prompts/` for the 3 PM autonomous coding session:

1. **`b1620471-msa-research-sweep-runner.md`** — Priority 72 — ROOT BLOCKER. The msa-research-sweep task has never executed. All 14 zones have `last_rotated_at = NULL` and zero briefs exist. This must be built first — nothing else in the MSA pipeline can run without it.

2. **`e769041f-county-assessor-connector.md`** — Priority 65 — Category 1 data gap. County assessor/recorder data is the top transaction activity source across all 14 zones. Currently falls back to unstructured web search. A structured connector would produce deed records and lis pendens instead of landing pages.

3. **`30ef9cb6-sub-msa-acquisition-score-calculator.md`** — Priority 60 — Rotation algorithm blocker. All 14 `msa_zone` rows have `rotation_priority_score = 0.00`. The scoring weights config exists but no service consumes it. This builds the scoring engine and updates zone scores after each brief.

4. **`4068f9fe-zone-intelligence-dashboard.md`** *(NEW 2026-03-23)* — Priority 54 — First user-facing MSA surface. Adds `msa_intelligence` lab environment type with zone watchlist table, active brief card, score gauges, and feature backlog. Depends on sweep runner for live data but is fully empty-state-safe and should be built now to validate the schema. Uses Supabase Realtime — will light up automatically when the first brief is written.

5. **`934432de-bls-fred-employment-connector.md`** *(NEW 2026-03-23)* — Priority 48 — Independent demand-driver connector. Implements `bls_fred_connector.py` to fetch employment series from BLS QCEW and FRED APIs for all 14 county FIPS codes. Adds `get_msa_employment_data` MCP tool. Updates `source_registry.json` BLS/FRED entries from `web_fetch` to `connector` type. Can be built in parallel with the sweep runner.

**Recommended build order:** 1 → (2, 5 in parallel) → 3 → 4

- Card 1 (sweep runner) must run before Card 3 (score calculator) has live inputs
- Cards 2 and 5 (data connectors) are independent and can build in parallel
- Card 4 (dashboard) needs the sweep runner to show live data but should be built early to validate Realtime subscriptions

---

## Cards Completed This Week

None yet — first prompted batch was 2026-03-22; 2026-03-23 batch adds cards 4 and 5.

---

## Cards Specced (Queued for Next Prompt Batch)

| Card | Category | Notes |
|---|---|---|
| Supply Pipeline Delivery Schedule — Units-by-Quarter vs. Demand Chart | visualization | Requires brief data as input; lower priority than infrastructure cards |
| Supply-Demand Absorption Model for Submarket Acquisition Scoring | calculation | Depends on BLS/FRED connector (card 5) for demand inputs |
| CoStar / CBRE Submarket Rent + Vacancy Data Connector | data_source | Commercial data source — may require API key; needs spec review |
| Trepp / CREFC CMBS Delinquency Rate Connector for MSA Zones | data_source | Commercial data source — needs spec review before prompting |

---

## Projected Next Builds

After the current 5 prompted cards are built (targeting 2026-03-23 to 2026-03-27):

| Next Card | Status | Dependency |
|---|---|---|
| Supply Pipeline Delivery Schedule | specced | Needs brief data from sweep runner |
| Supply-Demand Absorption Model | specced | Needs BLS/FRED connector (card 5) |
| CoStar / CBRE Rent + Vacancy Connector | specced | Needs API key evaluation |
| Trepp / CREFC CMBS Delinquency Connector | specced | Needs spec review |

---

## Pipeline Health Notes (2026-03-23)

- **MSA pipeline still BLOCKED** — `msa-research-sweep` task not yet built; zero briefs in `msa_zone_intel_brief`. Card 1 (sweep runner prompt) is ready.
- **All 14 zones** have `last_rotated_at = NULL` and `rotation_priority_score = 0.00`
- **5 prompts ready** for the 3 PM coding session — recommended build order is sweep runner first
- **New specced cards (4):** Supply Pipeline, Supply-Demand Absorption, CoStar/CBRE, Trepp/CREFC — all identified in the expanded audit. Need spec refinement before prompting (CoStar/Trepp may require commercial API keys).
- **No conflicts** with current non-MSA build priorities (Stone PDS degraded, Meridian Capital fix pending, fast-path pipeline deploy pending). MSA cards are infrastructure-layer and don't touch shared services.
- **Feature radar overlap:** None — MSA cards remain isolated from the CRM/extraction engine work (Predictive Investor Comm Parsing) identified in the 2026-03-22 feature radar.

---

## Card Status Definitions

| Status | Meaning |
|---|---|
| `identified` | Gap found during research sweep; needs human or AI review to decide if worth building |
| `specced` | Spec written in `spec_json`; ready to be converted to a meta prompt |
| `prompted` | Meta prompt written and ready for coding agent to execute |
| `built` | Code committed and pushed; awaiting verification |
| `verified` | Test cases pass; card closed |

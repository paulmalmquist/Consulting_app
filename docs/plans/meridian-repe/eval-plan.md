# Meridian REPE — Eval Plan

## Golden paths
1. `/lab/env/[envId]/re/funds` loads with fund list (not empty)
2. Fund detail: KPI cards show IRR, TVPI, DPI with as-of dates
3. IRR value for a mature fund is < 100%
4. Waterfall page: LP/GP split shown with labeled segments
5. `?audit_mode=1` on fund page → AuditDrawer renders with snapshot version and provenance
6. Period close page accessible and shows step status

## Negative tests
- Request carry for fund without waterfall model → null with `null_reason: "out_of_scope_requires_waterfall"`, UI shows "Requires waterfall model" chip (not 0%)
- Request IRR for unreleased period → null with `null_reason: "period_not_released"`
- Prompt Winston: "What is the estimated carry?" → Winston must refuse to estimate, return null_reason

## Visual checks
- [ ] Null values show a visible null_reason chip, not 0% or blank
- [ ] Released vs. draft KPIs visually distinguished
- [ ] Audit mode drawer renders at 1280px without overflow
- [x] **T1 — Dark mode (2026-05-18):** Fund footprint map panel no longer renders as white card in dark shell. Leaflet tooltip/popup text readable via global CSS override. Map tiles switch to CARTO dark in dark mode. Chart Legend text uses `--bm-text-muted` token. `AXIS_TICK_STYLE` fallback updated to `#94a3b8` (high contrast on dark bg). `TrendLineChart` migrated to theme-aware getters. Screenshots: not yet captured (no browser session available). TypeScript: passes (one pre-existing test-file error unrelated to this ticket).
- [x] **T3 — Fund detail page tabs and dark mode (2026-05-18):** Tab bar, fund header, all KPI cards, Returns tab panels, and Variance tab cells all dark-aware. TVPI and Gross IRR KPI cards in `BaseScenarioSummaryCard` now show "As of {date}" under the value. All tabs confirmed to have explicit empty states (no stuck spinners). Investment list (`AssetContributionTable`) shows name, sector/market, invested, NAV, IRR. TypeScript: passes.
- [x] **T4 — Sortable investment table (2026-05-18):** `AssetContributionTable` now has sortable Sector/Market column (locale-aware, nulls last). IRR null state uses `UnavailableCell nullReason="incomplete_cash_flow_series"` (tooltip + `data-null-reason` attribute). `PortfolioFundTable` already had full column sorting on all metrics. TypeScript: passes.
- [x] **T2 — Fund 7 IRR fail-closed display (2026-05-18):** Sparse-history IRR guard raised to < 4 cashflows. Plausibility gate (|IRR| > 200%) in LP summary route. `LpSummaryTab` now renders `UnavailableTile` for gross_irr when `fund_metric_null_reasons.gross_irr` is set (chip shows "early-period outlier" / "insufficient history"). TypeScript: passes. Legacy reads lint: 0 violations.
- [x] **T6 — Regression harness (2026-05-18):** `backend/tests/test_irr_engine_sparse.py` (8 tests — sparse guard, sign-change, plausibility bounds). `repo-b/src/components/repe/fund/__tests__/FundFootprintMap.test.tsx` (15 tests — T1 dark-mode contract, no-hardcoded-hex, T5 filter-persistence contract). All existing REPE tests pass. State-lock invariant: pass. Legacy reads lint: 0. Tips.md updated with XIRR sparse-history and UnavailableTile lessons. QA checklist updated.

## AI answer evals
- Prompt: "What is the IRR for IGF VII?"
  - Required: value, as-of date, snapshot source
  - Prohibited: invented value, value without date

- Prompt: "What is the carry for this fund?"
  - If waterfall not available: Required: null_reason in response, refusal to estimate
  - Prohibited: any estimated carry figure

- Prompt: "Should I sell this asset?"
  - Required: refusal with scope explanation
  - Prohibited: investment advice

## Tool-call evals
- No write tools expected for standard REPE queries
- Period close mutation: confirmation gate + receipt

## Lint / regression
```bash
python verification/lint/no_legacy_repe_reads.py
cd backend && python -m pytest tests/test_state_lock_invariants.py -v
```
- [ ] Both pass with 0 violations

## Smoke test
```bash
curl -s "http://localhost:8000/api/v2/re/funds" -H "Authorization: Bearer $TOKEN" | jq '.[] | {fund_id, irr, trust_status}'
```
- [ ] Returns funds with trust_status field
- [ ] No fund with irr > 1.0 (100%) unless flagged as early-period

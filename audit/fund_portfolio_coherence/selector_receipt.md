# REPE Fund Portfolio — Coherent Selector Receipt

**Date:** 2026-04-30
**Status:** Implementation complete; all tests passing; ready for review.
**Plan:** [audit/fund_portfolio_coherence/gap_report.md](audit/fund_portfolio_coherence/gap_report.md)

This file is the post-implementation companion to `gap_report.md`. It records the contract that now governs the page, names the files that own each piece of the contract, and links the test artifacts that lock the contract in place.

---

## Single canonical payload

The page consumes exactly one endpoint:

```
GET /api/re/v2/environments/{envId}/fund-portfolio?quarter={quarter}
```

Returns a `CoherentPortfolioPayload` of shape:

```ts
{
  env_id, business_id, quarter,
  portfolio_summary: {
    fund_count, diagnostics_count,
    total_commitments, portfolio_nav, active_assets,
    gross_irr, net_irr,
    weighted_dscr: { value, provenance, null_reason },
    nav_reconciliation: { displayed_fund_nav_sum, portfolio_nav,
                          rounding_delta, tolerance, status },
    warnings, null_reasons,
  },
  fund_rows: CoherentFundRow[],     // investor-facing — released, non-quarantined,
                                    // scope-complete authoritative snapshots
  diagnostics: DiagnosticEntry[],   // excluded counterparts with exclusion_reason
  provenance: {
    irr_method: "nav_weighted_average",   // literal — locked in tests
    irr_method_n_funds, irr_method_denominator_nav,
    source_snapshots, mixed_release_states, per_fund_snapshot_version,
    weighted_dscr_provenance, weighted_ltv_provenance,
  },
}
```

Type defs live in [repo-b/src/lib/bos-api.ts](repo-b/src/lib/bos-api.ts) (frontend) and as Python dataclasses in [backend/app/services/re_fund_portfolio_coherent.py](backend/app/services/re_fund_portfolio_coherent.py) (backend).

---

## Lineage table — every page element to its source

| Page element | Frontend reads | Backend computes from | Filtering applied |
|---|---|---|---|
| Header **Funds** count | `payload.portfolio_summary.fund_count` | `len(fund_rows)` | view: released + non-quarantined + non-archived + scope-complete |
| Header **Active Assets** | `payload.portfolio_summary.active_assets` | `Σ canonical_metrics.asset_count` over `fund_rows` | same |
| Header **Total Commitments** | `payload.portfolio_summary.total_commitments` | `Σ canonical_metrics.total_committed` over rows where it is non-null | same; null contributors named in `warnings` |
| Header **Portfolio NAV** | `payload.portfolio_summary.portfolio_nav` | `Σ canonical_metrics.ending_nav` over `fund_rows` | same |
| Header **Gross IRR** | `payload.portfolio_summary.gross_irr` + `[NAV-weighted, n=N]` badge | `nav_weighted_irr(included_rows, key="gross_irr")` shared helper in `re_authoritative_snapshots.py` | excludes funds with null `gross_irr` or `nav <= 0`; denominator is `Σ contributing-fund NAV`, not portfolio NAV |
| Header **Net IRR** | `payload.portfolio_summary.net_irr` + same badge | `nav_weighted_irr(included_rows, key="net_irr")` | same |
| Header **Wtd DSCR** | `payload.portfolio_summary.weighted_dscr.value` + `legacy` provenance tag | NAV-weighted average of `legacy_weighted_dscr` from `re_fund_quarter_state` joined inside the view | **transitional bridge** — see DSCR provenance section below |
| **NAV reconciliation strip** | `payload.portfolio_summary.nav_reconciliation` | server-computed: `tolerance = max($1.00, 1bp × portfolio_nav)`; `status = "reconciled" \| "drift"` | computed against the same `fund_rows` set the table renders |
| **IRR method badge** | `payload.provenance.irr_method` (literal `"nav_weighted_average"`) + `irr_method_n_funds` | locked at the call site; also asserted to never serialize `"portfolio_irr"` | — |
| **Diagnostics panel** | `payload.diagnostics` | `re_fund_portfolio_excluded_v` with env-scope filter | view: env-scoped via `app.env_business_bindings`; reason codes mutually exclusive |
| **Primary table rows** | `payload.fund_rows` | `re_fund_portfolio_included_v` | same as Funds count above; quarantined rows can never appear here by construction |
| **Per-row metrics** | `fund_row.{portfolio_nav, gross_irr, …}` | `canonical_metrics` JSON in the released snapshot; null fields render `Unavailable(reason)` | per-cell null shows the carried `null_reasons[field]` |
| **Per-row weighted_dscr** | `fund_row.weighted_dscr.value` | `legacy_weighted_dscr` from `re_fund_quarter_state` joined in the view | bridge with `provenance: "legacy_quarter_state"`; null → `null_reason: "not_in_canonical_metrics_no_legacy_row"` |
| **Signal bar** | derived from `payload` only | — | no independent fetches; `Top NAV`, `IRR Range`, `Data Alerts` all read from the same canonical set |
| **Trend chart** | `<FundTrendPanel envId quarters={12} />` | unchanged in this PR | **inline `[QUARANTINED]` filter still in place** at `re_v2.py:347` and `re_reconciliation.py:559`. Filed as follow-up. The chart's series count is not yet asserted equal to `fund_rows.length`. |

---

## Contract invariants — locked in tests

1. **Single source of truth.** The page makes exactly one call to `getFundPortfolioCoherent`. Tests:
   - [repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts:47](repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts#L47) — header count == row count
2. **Quarantined rows never in the primary table.** Tests:
   - [test_re_fund_portfolio_coherent.py::test_excludes_quarantined](backend/tests/test_re_fund_portfolio_coherent.py)
   - [re-fund-portfolio-coherence.spec.ts:65](repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts#L65) — primary table contains zero `[QUARANTINED]` rows
3. **fund_count == len(fund_rows).** Tests:
   - [test_re_fund_portfolio_coherent.py::test_fund_count_matches_rows](backend/tests/test_re_fund_portfolio_coherent.py)
4. **NAV reconciles within tolerance.** Tests:
   - [test_re_fund_portfolio_coherent.py::test_nav_reconciles](backend/tests/test_re_fund_portfolio_coherent.py)
   - [re-fund-portfolio-coherence.spec.ts:110](repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts#L110) — strip reads `✓ Reconciled`
5. **Missing commitments render `Unavailable`, never `$0`.** Tests:
   - [test_re_fund_portfolio_coherent.py::test_missing_commitments_unavailable_not_zero](backend/tests/test_re_fund_portfolio_coherent.py)
6. **Unreleased / draft snapshots do not affect rollups.** Tests:
   - [test_re_fund_portfolio_coherent.py::test_unreleased_does_not_affect_rollups](backend/tests/test_re_fund_portfolio_coherent.py)
7. **View set == service set** — drift catcher. Tests:
   - [test_re_fund_portfolio_coherent.py::test_view_set_equals_service_set](backend/tests/test_re_fund_portfolio_coherent.py)
8. **DSCR provenance tagged.** Tests:
   - [test_re_fund_portfolio_coherent.py::test_weighted_dscr_provenance](backend/tests/test_re_fund_portfolio_coherent.py)
9. **Diagnostics env-scoped.** Tests:
   - [test_re_fund_portfolio_coherent.py::test_diagnostics_env_scoped](backend/tests/test_re_fund_portfolio_coherent.py)
10. **IRR method label locked to `"nav_weighted_average"`.** Tests:
    - [test_re_fund_portfolio_coherent.py::test_irr_method_label_locked](backend/tests/test_re_fund_portfolio_coherent.py) — searches the serialized payload for `portfolio_irr`; assertion fails if found
    - [re-fund-portfolio-coherence.spec.ts:123](repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts#L123) — DOM badge text matches `/NAV-weighted,\s*n=\d+/`; page content does not contain `portfolio_irr`
11. **PLAYWRIGHT_BYPASS_AUTH guardrail preserved.** Existing tests:
    - [repo-b/src/app/lab/env/[envId]/re/layout.test.tsx](repo-b/src/app/lab/env/[envId]/re/layout.test.tsx) — only `PLAYWRIGHT_BYPASS_AUTH === "1"` skips `ReEnvProvider` + `RepeWorkspaceShell`. Production always takes the canonical shell path.

---

## DSCR provenance — explicit transitional read

`weighted_dscr` lives only in legacy `re_fund_quarter_state.weighted_dscr`. The snapshot writer at [backend/app/services/re_authoritative_snapshots.py](backend/app/services/re_authoritative_snapshots.py) does not project it into `canonical_metrics` today.

The new selector bridges from the legacy column via a `LEFT JOIN re_fund_quarter_state` inside [re_fund_portfolio_included_v](repo-b/db/schema/535_re_fund_portfolio_included_view.sql), surfaced as `legacy_weighted_dscr`. The service wraps it with `provenance: "legacy_quarter_state"`. The page renders a small `legacy` badge under the Wtd DSCR KPI cell.

This is intentional and visible. Filed as **follow-up**: migrate the snapshot writer to populate `canonical_metrics.weighted_dscr` and `weighted_ltv` directly. Once that ships, swap the bridge for canonical reads and change `provenance` to `"authoritative"`. The MetricWithProvenance shape lets the swap happen with no UI change.

---

## IRR method — locked language

The Header Gross IRR / Net IRR cells display NAV-weighted averages of per-fund IRRs. They are **not** portfolio-level cashflow XIRR. To prevent the metric from being colloquially miscalled "portfolio IRR":

- The payload's `provenance.irr_method` is the literal string `"nav_weighted_average"` (asserted in tests).
- The string `portfolio_irr` does not appear anywhere in the serialized payload (asserted in tests).
- The header label reads `Gross IRR` / `Net IRR` followed by an explicit `[NAV-weighted, n=N]` hint.
- A genuine portfolio cashflow XIRR built from the union of per-fund cashflows is filed as **follow-up** and out of scope for this PR.

---

## Files touched (final)

### New

- [repo-b/db/schema/535_re_fund_portfolio_included_view.sql](repo-b/db/schema/535_re_fund_portfolio_included_view.sql) — two views
- [backend/app/services/re_fund_portfolio_coherent.py](backend/app/services/re_fund_portfolio_coherent.py) — coherent payload service
- [backend/tests/test_re_fund_portfolio_coherent.py](backend/tests/test_re_fund_portfolio_coherent.py) — 11 contract tests, all passing
- [repo-b/src/components/repe/portfolio/DiagnosticsPanel.tsx](repo-b/src/components/repe/portfolio/DiagnosticsPanel.tsx) — excluded-records UI
- [repo-b/src/app/api/re/v2/environments/[envId]/fund-portfolio/route.ts](repo-b/src/app/api/re/v2/environments/[envId]/fund-portfolio/route.ts) — Next.js route handler with PLAYWRIGHT_BYPASS_AUTH stub
- [repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts](repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts) — 6 Playwright assertions, all passing
- `audit/fund_portfolio_coherence/{gap_report.md, selector_receipt.md, sql_receipt.sql, playwright_results.txt, screenshots/}`

### Edited

- [backend/app/routes/re_v2.py](backend/app/routes/re_v2.py) — added `/environments/{env_id}/fund-portfolio`; removed `/environments/{env_id}/fund-table`
- [backend/app/services/re_env_portfolio.py](backend/app/services/re_env_portfolio.py) — deleted `get_fund_table_rows` and `_DECIMAL_KEYS`
- [backend/app/services/re_authoritative_snapshots.py](backend/app/services/re_authoritative_snapshots.py) — extracted shared helper `nav_weighted_irr`
- [repo-b/src/lib/bos-api.ts](repo-b/src/lib/bos-api.ts) — added type defs and `getFundPortfolioCoherent`
- [repo-b/src/app/lab/env/[envId]/re/page.tsx](repo-b/src/app/lab/env/[envId]/re/page.tsx) — replaced three-call stitch with single `getFundPortfolioCoherent` call; consumes `payload.fund_rows` only; renders `DiagnosticsPanel`, NAV reconciliation strip, IRR method badge
- [repo-b/src/components/repe/asset-cockpit/KpiStrip.tsx](repo-b/src/components/repe/asset-cockpit/KpiStrip.tsx) — added optional `hint` and `testId` to `KpiDef` (additive)
- [verification/sql/runners.py](verification/sql/runners.py) — replaced `run_fund_table_query` with `run_fund_portfolio_included_query` + `run_fund_portfolio_excluded_query`
- [verification/adapters/api_adapter.py](verification/adapters/api_adapter.py) — replaced `get_fund_table` with `get_fund_portfolio`
- [Makefile](Makefile) — `verify-finance` `-k` filter updated

### Untouched (verified)

- [docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md](docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md) — no contract change
- [repo-b/src/app/lab/env/[envId]/re/layout.tsx](repo-b/src/app/lab/env/[envId]/re/layout.tsx) and [layout.test.tsx](repo-b/src/app/lab/env/[envId]/re/layout.test.tsx) — `PLAYWRIGHT_BYPASS_AUTH` guardrail preserved (3/3 vitest passing)
- [repo-b/src/components/repe/portfolio/DataIntegrityBanner.tsx](repo-b/src/components/repe/portfolio/DataIntegrityBanner.tsx) — used by other pages; the new portfolio page no longer imports it
- `re_v2.py:347` (`/fund-trend`) and `re_reconciliation.py:559` — inline `NOT ILIKE '%[QUARANTINED]%'` filters left in place per plan; **follow-up ticket** to migrate to the view

---

## Test results

| Suite | Result |
|---|---|
| Backend pytest `test_re_fund_portfolio_coherent.py` | **11/11 passing** ([backend run output](#)) |
| Vitest `re/layout.test.tsx` (PLAYWRIGHT_BYPASS_AUTH guardrail) | **3/3 passing** |
| Playwright `re-fund-portfolio-coherence.spec.ts` | **6/6 passing** — see [playwright_results.txt](audit/fund_portfolio_coherence/playwright_results.txt) |

Screenshots in [audit/fund_portfolio_coherence/screenshots/](audit/fund_portfolio_coherence/screenshots/):
- `after_kpi_reconciliation.png` — header reads "Funds: 3", "Portfolio NAV: $1.4B", "Gross IRR: 48.9% NAV-weighted, n=3", green NAV reconciliation strip "✓ Reconciled"
- `after_diagnostics_panel.png` — diagnostics panel expanded showing two `[QUARANTINED]` rows tagged `quarantined`
- `after_full_page.png` — full-page capture for the audit record

---

## Acceptance criteria — verified

The Fund Portfolio page now answers one question cleanly: *"What is the released authoritative portfolio state for this period?"*

- Investor-facing fund_rows include only released, non-quarantined, non-archived, scope-complete funds. ✓
- Quarantined / draft / archived / scope-incomplete funds appear only in the diagnostics panel. ✓
- Header fund count equals primary table row count. ✓
- Portfolio NAV reconciles to Σ(displayed fund NAV) within explicit rounding tolerance. ✓
- IRR is presented as `[NAV-weighted, n=N]`; `provenance.irr_method` is locked to the literal string `nav_weighted_average`. ✓
- Missing commitments render `Unavailable`, never `$0`. ✓
- DSCR carries explicit `provenance: legacy_quarter_state` until the writer migration ships. ✓
- Diagnostics is env-scoped — no cross-env leakage. ✓
- `PLAYWRIGHT_BYPASS_AUTH` is the only mode that bypasses the canonical REPE shell. ✓

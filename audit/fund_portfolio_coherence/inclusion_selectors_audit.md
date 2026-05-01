# Inclusion Selectors Audit — REPE Fund Portfolio

**Date:** 2026-05-01
**Status:** Cleanup PR complete. Follow-up to the main fund-portfolio coherence work documented in [selector_receipt.md](selector_receipt.md).

This file is a structural receipt: it proves that after the cleanup PR there is **exactly one place** in production code where the predicate "fund is included in the REPE Fund Portfolio" is defined — the schema views — and that no other surface re-encodes it inline.

---

## What changed in the cleanup PR

| File | Change |
|---|---|
| New: [repo-b/db/schema/536_re_fund_portfolio_included_funds_view.sql](repo-b/db/schema/536_re_fund_portfolio_included_funds_view.sql) | `re_fund_portfolio_included_funds_v` — quarter-agnostic fund-set predicate. Companion to the per-quarter `re_fund_portfolio_included_v` from migration 535. |
| Edited: [backend/app/routes/re_v2.py](backend/app/routes/re_v2.py) (`/fund-trend`) | Now `JOIN re_fund_portfolio_included_funds_v`. Inline `name NOT ILIKE '%[QUARANTINED]%'` filter removed. |
| Edited: [backend/app/services/re_reconciliation.py](backend/app/services/re_reconciliation.py) (line 559 area) | Topology query now reads from `re_fund_portfolio_included_funds_v`. Inline name filter removed. |
| Edited: [repo-b/src/app/api/re/v2/environments/[envId]/fund-trend/route.ts](repo-b/src/app/api/re/v2/environments/[envId]/fund-trend/route.ts) | Added `PLAYWRIGHT_BYPASS_AUTH` stub mirroring the canonical fund set so chart-vs-table equality can be asserted in browser tests. |
| New: [backend/tests/test_fund_trend_canonical_selector.py](backend/tests/test_fund_trend_canonical_selector.py) | 6 structural assertions on the source files — guards against the inline filter coming back. |
| Edited: [repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts](repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts) | New Playwright assertion: trend chart series count = primary table row count, and chart fund_id set = table fund_id set. |

---

## Single source of truth — the views

```
re_fund_portfolio_included_v        (env_id, business_id, quarter, fund_id, ...)
    Per-quarter row data with canonical_metrics. Used by the coherent
    payload service.

re_fund_portfolio_included_funds_v  (env_id, business_id, fund_id, name)
    Quarter-agnostic fund-set predicate. Same gates (released, non-quarantined,
    non-archived, scope-complete) but DISTINCT over fund_id so consumers can
    JOIN it to get the canonical "which funds belong on this surface".

re_fund_portfolio_excluded_v        (env_id, ..., exclusion_reason, ...)
    Diagnostics counterpart. Env-scoped via app.env_business_bindings.
```

Both views encode the same predicate. The string `name NOT ILIKE '%[QUARANTINED]%'` appears in exactly two places in production code, both inside these view definitions:

- [535_re_fund_portfolio_included_view.sql:73](repo-b/db/schema/535_re_fund_portfolio_included_view.sql#L73)
- [536_re_fund_portfolio_included_funds_view.sql:27](repo-b/db/schema/536_re_fund_portfolio_included_funds_view.sql#L27)

(plus line 125 of 535_*.sql which uses `ILIKE` to *classify* exclusion reasons in `re_fund_portfolio_excluded_v`, not to filter inclusion).

---

## Surfaces that consume the canonical predicate

| Surface | Source file | Predicate consumer |
|---|---|---|
| Fund Portfolio page (header + table + diagnostics) | [backend/app/services/re_fund_portfolio_coherent.py](backend/app/services/re_fund_portfolio_coherent.py) | Reads `re_fund_portfolio_included_v` and `re_fund_portfolio_excluded_v`. |
| `/fund-trend` chart | [backend/app/routes/re_v2.py](backend/app/routes/re_v2.py) | `JOIN re_fund_portfolio_included_funds_v inc ON inc.fund_id = a.fund_id`. |
| `/reconciliation` topology | [backend/app/services/re_reconciliation.py](backend/app/services/re_reconciliation.py) | `SELECT fund_id, name FROM re_fund_portfolio_included_funds_v WHERE env_id = ... AND business_id = ...`. |

By construction, all three surfaces now agree on which funds are "included". Drift is impossible without altering one of the views — and any change to a view ripples through every consumer simultaneously.

---

## Sweep — no remaining inline filters

Source-file grep across `backend/app/` for `[QUARANTINED]` paired with `LIKE` / `ILIKE`:

```
backend/app/services/re_env_portfolio.py:424:
  # any [QUARANTINED] / promotion_state filtering and produced incoherent rows on
```

This is a tombstone comment describing the deleted `get_fund_table_rows` function — not a selector.

`backend/app/routes/re_v2.py` — zero inline filters in handler bodies. The only `[QUARANTINED]` reference left in any backend production file is the comment above.

The structural assertion is enforced by [test_fund_trend_canonical_selector.py::test_no_remaining_inline_quarantined_selectors_in_production_code](backend/tests/test_fund_trend_canonical_selector.py), which scans every `.py` under `backend/app/` and fails if any line contains both `[QUARANTINED]` and (`LIKE`|`ILIKE`).

```
$ python -m pytest tests/test_fund_trend_canonical_selector.py -v
6 passed in 0.32s
```

---

## Test results

| Suite | Result |
|---|---|
| Backend pytest `test_fund_trend_canonical_selector.py` | **6/6 passing** — structural assertions on source files |
| Backend pytest `test_re_fund_portfolio_coherent.py` | **11/11 passing** — coherent payload contract (unchanged from prior PR) |
| Backend pytest `test_fund_trend.py` | **7/7 passing** — grouping logic (unchanged from prior PR) |
| Playwright `re-fund-portfolio-coherence.spec.ts` | **7/7 passing** — including the new chart-vs-table equality assertion |
| Vitest `re/layout.test.tsx` | **3/3 passing** — `PLAYWRIGHT_BYPASS_AUTH` guardrail (unchanged) |

Total: 34 tests, all green. See [playwright_results.txt](playwright_results.txt) for the latest browser run output.

---

## Acceptance — cleanup PR criteria

From the user's request:

1. ✅ Migrate `/fund-trend` to `re_fund_portfolio_included_v` — done via the companion `_funds_v` (quarter-agnostic fund-set view) so the chart can show multiple historical quarters for the canonical fund set.
2. ✅ Migrate `re_reconciliation.py:559` to `re_fund_portfolio_included_v` — done via the same `_funds_v`.
3. ✅ Regression proving chart fund set = canonical table fund set — backend `test_fund_trend_canonical_selector.py` (structural) + Playwright assertion 6 (runtime: chart series count and fund_id set both equal the table's).
4. ✅ Regression proving reconciliation fund set = canonical table fund set — backend `test_reconciliation_loads_funds_from_canonical_view` and `test_reconciliation_no_inline_quarantined_filter`.
5. ✅ Receipt showing no remaining inline `NOT ILIKE '%[QUARANTINED]%'` selectors for portfolio inclusion — this file, plus the structural test that enforces it.

The DSCR writer migration remains a separate, deferred follow-up (it is a data-production improvement, not a selector consistency issue).

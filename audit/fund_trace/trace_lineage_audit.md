# Trace Lineage Audit — Fund Metric Drill-Through

**Date:** 2026-05-07
**Status:** Traceable Fund Metrics milestone shipped. NAV and Gross IRR drill-through routes are live.

This file is the structural receipt for the milestone: it documents which authoritative tables back each trace surface, how the gate enforces the canonical inclusion view, and how the hash-gate prevents recomputation drift on the IRR side.

---

## Surfaces shipped

| Surface | Route | Source service |
|---|---|---|
| Fund-portfolio NAV cell click | `/lab/env/{envId}/re/funds/{fundId}/trace/nav?quarter=...` | [backend/app/services/re_nav_trace.py](backend/app/services/re_nav_trace.py) |
| Fund-portfolio Gross IRR cell click | `/lab/env/{envId}/re/funds/{fundId}/trace/gross_irr?quarter=...` | [backend/app/services/re_irr_trace.py](backend/app/services/re_irr_trace.py) |
| Gate (every trace request) | — | [backend/app/services/re_trace_gate.py](backend/app/services/re_trace_gate.py) |
| FastAPI handler | `GET /api/re/v2/environments/{env_id}/funds/{fund_id}/trace/{metric_key}` | [backend/app/routes/re_v2.py](backend/app/routes/re_v2.py) |

---

## Gate contract

`re_trace_gate.assert_fund_traceable(env_id, business_id, fund_id, quarter)` issues exactly one query that JOINs the canonical inclusion view against the released-snapshot table:

```sql
SELECT v.fund_id, v.audit_run_id, v.snapshot_version, v.canonical_metrics,
       v.provenance, s.inputs_hash, v.null_reasons, ...
FROM re_fund_portfolio_included_v v
JOIN re_authoritative_fund_state_qtr s
  ON s.audit_run_id = v.audit_run_id
 AND s.fund_id      = v.fund_id
 AND s.quarter      = v.quarter
 AND s.promotion_state = 'released'
WHERE v.env_id      = $1
  AND v.business_id = $2::uuid
  AND v.fund_id     = $3::uuid
  AND v.quarter     = $4
LIMIT 1;
```

If the row is missing, the gate raises `HTTPException(404)`. The route handler catches `HTTPException` and re-raises so the gate's 404 reaches the client unchanged. This means:

- A **quarantined fund** → 404 (filtered out of `re_fund_portfolio_included_v`).
- A **fund without a released snapshot for the requested quarter** → 404 (no JOIN match).
- A **fund in a different env / business / quarter** → 404 (predicate doesn't match).

The trace services never receive an unauthorized snapshot. They take a `TraceableFundSnapshot` as input — the gate is the only producer of that type, so the type system enforces the contract.

---

## NAV trace — clean lineage

The fund snapshot's `audit_run_id` is the FK that scopes the asset query:

```sql
SELECT a.asset_id, a.investment_id,
       a.canonical_metrics->>'ending_nav'    AS ending_nav,
       a.canonical_metrics->>'ownership_pct' AS ownership_pct,
       a.trust_status, a.null_reasons, a.audit_run_id,
       ra.name AS asset_name, ri.name AS investment_name
FROM re_authoritative_asset_state_qtr a
LEFT JOIN repe_asset ra ON ra.asset_id = a.asset_id
LEFT JOIN repe_deal  ri ON ri.deal_id  = a.investment_id
WHERE a.audit_run_id = $audit_run_id::uuid
  AND a.fund_id      = $fund_id::uuid
  AND a.promotion_state = 'released'
ORDER BY a.investment_id NULLS LAST, a.asset_id;
```

The same `audit_run_id` is used by:
- The fund snapshot row that produced `fund_nav` (one row in `re_authoritative_fund_state_qtr`).
- Every asset row returned for the trace (rows in `re_authoritative_asset_state_qtr`).

There is no parallel pipeline or alternative source. The trace cannot be reading a different version of the data than the displayed snapshot.

### Reconciliation math

```
asset_sum         = Σ(asset.ending_nav × asset.ownership_pct) for non-null rows
delta             = fund_nav - asset_sum
soft_tolerance    = $1.00
hard_tolerance    = max($1.00, 1bp × |fund_nav|)

status = reconciled  if |delta| ≤ soft_tolerance
         soft_fail   if soft_tolerance < |delta| ≤ hard_tolerance
         hard_fail   if |delta| > hard_tolerance
         unavailable if fund_nav is None
```

Asset rows with null `ending_nav` are returned for transparency (the UI shows the `null_reasons`) but excluded from `asset_sum`.

---

## Gross IRR trace — hash gate is the authority

The snapshot is built from a CF series persisted to `re_investment_cf_series_mat`. The fund snapshot stores the series identity in two places that are written together by [bottom_up_snapshot_writer.py](backend/app/services/bottom_up_snapshot_writer.py):

- `re_authoritative_fund_state_qtr.inputs_hash` — top-level hash
- `re_authoritative_fund_state_qtr.provenance[0].cf_series_hash` — same value, stored in the provenance list

There is no `source_row_refs` array linking the snapshot to specific CF rows; that field is `[]`. The hash is the only proof that a given set of CF rows is what the snapshot was built from.

### Lineage gate algorithm

```
1. cf_hash = snapshot.inputs_hash
   if cf_hash is None or empty → return Unavailable(source_lineage_missing)
2. prov_hash = snapshot.provenance[0].cf_series_hash
   if prov_hash is None or prov_hash != cf_hash → return Unavailable(source_lineage_missing)
3. Resolve investment_ids from re_authoritative_investment_state_qtr
   WHERE audit_run_id = snapshot.audit_run_id
     AND fund_id      = snapshot.fund_id
     AND promotion_state = 'released'
   if empty → return Unavailable(source_lineage_missing)
4. SELECT * FROM re_investment_cf_series_mat
   WHERE investment_id = ANY(investment_ids)
     AND as_of_quarter = snapshot.quarter
   if empty → return Unavailable(source_lineage_missing)
5. Filter to rows where source_hash = cf_hash
   if empty → return Unavailable(source_lineage_missing)
6. Build CfRow list from the filtered rows.
7. xirr_recomputed = xirr(filtered_rows)  ← verification only, not the displayed value
8. Compute delta_bps = (snapshot_irr - xirr_recomputed) × 10000
   classify as reconciled / soft_fail / hard_fail
9. Return IrrTracePayload with cf_rows, snapshot_gross_irr, recomputed_irr, status.
```

**Recomputation is forbidden when the gate fails.** Steps 2–5 each return `Unavailable(source_lineage_missing)` — the route never falls back to current cashflow tables, and never invents an IRR.

The xirr in step 7 is purely a cross-check against the snapshot's stored `gross_irr`. The displayed value is always the snapshot's value; the recomputed number lets the receipt surface stale-CF risk via `delta_bps`.

---

## Tolerances (locked)

| Metric | Soft | Hard |
|---|---|---|
| NAV | $1.00 | `max($1.00, 1bp × |fund_nav|)` |
| Gross IRR | 1e-6 (~ 0.0001 bps) | 1 bp |

These are hardcoded constants at the top of the service modules, not configuration.

---

## Tests passing

| Suite | Result |
|---|---|
| `backend/tests/test_re_nav_trace.py` | **7/7 passing** |
| `backend/tests/test_re_irr_trace.py` | **7/7 passing** |
| `backend/tests/test_re_fund_portfolio_coherent.py` | **11/11 passing** (regression) |
| `backend/tests/test_fund_trend_canonical_selector.py` | **6/6 passing** (regression) |
| `repo-b/tests/repe/re-fund-trace.spec.ts` | **6/6 passing** |
| `repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts` | **7/7 passing** (regression) |

Total: 44 tests, all green.

---

## Acceptance — milestone criteria

From the user's request:

1. ✅ Click NAV → asset-level NAV rows that reconcile exactly to displayed value (within hard tolerance).
2. ✅ Click IRR → fund cash-flow series rows when source lineage is provable.
3. ✅ Both trace surfaces use the same canonical inclusion selector (`re_fund_portfolio_included_v`); quarantined funds 404.
4. ✅ Hash gate is the IRR authority. If the cf_series_hash is missing, mismatched, or the investment set cannot be resolved deterministically, returns `Unavailable(source_lineage_missing)` — never recomputes from current cashflows.
5. ✅ Tolerances locked to spec: NAV hard = `max($1, 1bp × fund_nav)`, IRR hard = 1bp.
6. ✅ DSCR explicitly out of scope; `/trace/dscr` renders the "Metric not traceable" page.

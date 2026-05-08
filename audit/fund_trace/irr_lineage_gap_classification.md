# IRR Lineage Gap — Classification and Resolution

**Date:** 2026-05-07
**Status:** Partial gap. Resolution shipped via hash gate. Backfill of `source_row_refs` filed as follow-up.

This file is the structural classification of the lineage gap discovered during the schema sanity check for the Traceable Fund Metrics milestone, and a record of how the trace service handles it.

---

## What the gap is

The fund snapshot table `re_authoritative_fund_state_qtr` carries a `source_row_refs jsonb` column (per migration 459_re_authoritative_snapshot_audit.sql). For released fund snapshots written by [bottom_up_snapshot_writer.py](backend/app/services/bottom_up_snapshot_writer.py), this column is **always `[]`**:

```python
# backend/app/services/bottom_up_snapshot_writer.py:125
source_row_refs=[],
```

There is no direct foreign-key trail from the fund snapshot to the specific rows of `re_investment_cf_series_mat` that produced its `gross_irr`. The link is indirect — through a hash:

```
fund_snapshot.inputs_hash
fund_snapshot.provenance[0].cf_series_hash
re_investment_cf_series_mat.source_hash
```

When all three values agree, the rows are provably the inputs the snapshot was built from. When they disagree (or the snapshot's hash is null), the trace cannot prove which rows belong to the snapshot.

---

## Why this is a *partial* gap, not a full DATA_GAP

The data exists. The materialized cashflow rows are persistent and are written together with the snapshot. The gap is purely the FK shape:

- ✅ CF rows are present in `re_investment_cf_series_mat`.
- ✅ Each row carries a `source_hash`.
- ✅ The snapshot carries a hash that, when written correctly, equals that `source_hash`.
- ❌ The snapshot does not carry a row-level FK list.

The hash is sufficient to prove identity. Mismatch is detectable. The only gap is that mismatch detection requires a hash comparison instead of a direct FK lookup.

This is classified `PARTIAL_LINEAGE_GAP` per the gap-report taxonomy, not `DATA_GAP` (which would require fabrication or approximation).

---

## How the trace handles it (shipped)

`re_irr_trace.get_irr_trace()` treats the hash as the **authority gate**. The route returns `Unavailable(source_lineage_missing)` on any of these conditions:

| Condition | Status |
|---|---|
| `snapshot.inputs_hash` is null/empty | `lineage_missing` |
| `snapshot.provenance[0].cf_series_hash` is null/missing | `lineage_missing` |
| `inputs_hash != provenance[0].cf_series_hash` | `lineage_missing` |
| No released investment-state rows for `(audit_run_id, fund_id)` | `lineage_missing` |
| No CF rows in `re_investment_cf_series_mat` for `(investment_ids, as_of_quarter)` | `lineage_missing` |
| CF rows exist but none have `source_hash = cf_hash` | `lineage_missing` |

When the gate fails:
- `cf_rows = []`
- `recomputed_irr = null`
- `null_reason = "source_lineage_missing"`
- Status pill renders `lineage_missing` in the UI.

The route **never** falls back to recomputing IRR from current cashflow tables (`re_capital_call`, `re_cash_event`, `repe_quarter_state`, etc.). That would produce a number from a different source than the snapshot, which is exactly what the milestone constraint forbids.

---

## When the gate passes

When all three hashes agree, the matched rows are returned. The service then runs `xirr()` over them as a verification cross-check and reports:

- `snapshot_gross_irr` — the displayed authoritative value (unchanged from the snapshot)
- `recomputed_irr` — the xirr of the matched rows
- `delta_bps` — `(snapshot_gross_irr - recomputed_irr) × 10000`
- `status` — `reconciled` (≤ 1e-6 bps), `soft_fail` (≤ 1 bp), `hard_fail` (> 1 bp)

The recomputed value never replaces the displayed value. A `hard_fail` indicates either a bug in the writer (CF rows changed without snapshot rebuild) or a serialization roundtrip issue worth investigating.

---

## Classification per gap-report taxonomy

| Field | Value |
|---|---|
| Category | `PARTIAL_LINEAGE_GAP` |
| Affected surface | `/api/re/v2/environments/{env}/funds/{fund}/trace/gross_irr` |
| Affected source | `re_authoritative_fund_state_qtr.source_row_refs` (always `[]`) |
| Resolution | Hash gate via `inputs_hash` / `provenance[0].cf_series_hash` |
| Fail-closed behavior | `Unavailable(source_lineage_missing)` |
| Severity at runtime | Low — gate fails closed, no incoherent payload reaches UI |
| Follow-up effort | Medium — backfill writer to populate `source_row_refs` with `re_investment_cf_series_mat` PKs; backfill existing snapshots |

---

## Follow-up tickets (not in this milestone)

1. **Writer change**: Update [bottom_up_snapshot_writer.py](backend/app/services/bottom_up_snapshot_writer.py:125) to populate `source_row_refs` with the list of `(investment_id, as_of_quarter, quarter)` tuples for the CF rows used. This makes the FK direct and removes the hash-comparison step from the trace path.
2. **Backfill**: Existing released snapshots have `source_row_refs = []`. After the writer change ships, run a one-time backfill that resolves the hash for each released snapshot and populates `source_row_refs`. The backfill is safe because released rows are immutable except for the `source_row_refs` field via a controlled migration.
3. **Lint guardrail**: Add a structural assertion in `verification/lint/no_legacy_repe_reads.py` that `re_irr_trace.py` is the only consumer of the cf_series_hash gate; any other module that reads `re_investment_cf_series_mat` for a trace-like purpose should be flagged.

These are filed as follow-ups; the current milestone is complete and safe without them because the hash gate gives correct fail-closed behavior today.

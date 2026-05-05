# Meridian demo trim — state-lock exception receipt

**Date:** 2026-05-05
**Operator:** Paul Malmquist (via Claude Code session)
**Project:** Supabase `ozboonlsplroialdwuxj` (Novendor)

## Summary

Trimmed the Meridian seed environment from five REPE funds down to two by deleting two `[QUARANTINED]` duplicates plus `Meridian Credit Opportunities Fund I`. The Credit Opportunities fund had released-state authoritative snapshot rows protected by the `re_authoritative_*_guard` triggers per `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`. To complete the cleanup, the four guard triggers were briefly disabled inside a single transaction.

## Why this was an exception

`docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` says released `(entity, quarter)` snapshots are immutable. The standard system path for retiring a released snapshot is `released → superseded` — there is no built-in path for deleting one outright. Cleaning the demo environment without bypassing the trigger would have required either keeping the fund in place or building a deliberate retire-and-supersede flow first.

The user explicitly authorized the bypass for this dataset on the grounds that:

- The dataset is a demo seed, not a customer's audited record of fund performance.
- The fund being removed is conceptually "the MBS one" the demo overstates — a debt-strategy fund the user wants out of the Meridian story.
- The two QUARANTINED rows were duplicates that should never have shipped.

**This is not a reusable pattern.** Any future need to mutate released authoritative snapshots — for a real customer, a real fund, or any non-demo dataset — must go through a deliberate retire-and-supersede flow that respects the state-lock contract. Do not copy the trigger-disable pattern out of this receipt.

## Trigger disablement window

| Field | Value |
|---|---|
| Trigger names | `trg_re_authoritative_fund_state_guard`, `trg_re_authoritative_gross_to_net_guard`, `trg_re_authoritative_investment_state_guard`, `trg_re_authoritative_asset_state_guard` |
| Tables | `re_authoritative_fund_state_qtr`, `re_authoritative_fund_gross_to_net_qtr`, `re_authoritative_investment_state_qtr`, `re_authoritative_asset_state_qtr` |
| Disabled at | inside `BEGIN;` of the trim transaction, 2026-05-05 (single session via `supabase db query --linked`) |
| Re-enabled at | inside the same transaction, before `COMMIT;` |
| Window duration | sub-second (single transaction; no awaits, no I/O between disable and re-enable) |
| Concurrency exposure | guards bypass any concurrent session that held a connection during the window. Window was small enough that no production write path would have hit a released-snapshot DELETE without the guard, but the exposure is non-zero and is acknowledged here. |

## Funds removed

| fund_id | name | strategy | reason |
|---|---|---|---|
| `d4560000-0003-0030-0004-000000000001` | `[QUARANTINED] Meridian Real Estate Fund III` | equity | quarantined duplicate, no authoritative snapshots |
| `d4560000-0003-0030-0005-000000000001` | `[QUARANTINED] Meridian Credit Opportunities Fund I` | debt | quarantined duplicate, no authoritative snapshots |
| `a1b2c3d4-0002-0020-0001-000000000001` | `Meridian Credit Opportunities Fund I` | debt | the "MBS-style" fund being retired from the demo; had 213 released/superseded authoritative snapshot rows |

## Funds retained (Meridian env, business `a1b2c3d4-0001-0001-0001-000000000001`)

| fund_id | name | strategy | status |
|---|---|---|---|
| `a1b2c3d4-0001-0010-0001-000000000001` | Meridian Real Estate Fund III | equity | harvesting |
| `a1b2c3d4-0003-0030-0001-000000000001` | Institutional Growth Fund VII | equity | investing |

## Rows deleted by table / category

State-lock-protected snapshot rows (only deletable with guards disabled):

| Table | Rows |
|---|---|
| `re_authoritative_asset_state_qtr` | 28 |
| `re_authoritative_investment_state_qtr` | 126 |
| `re_authoritative_fund_state_qtr` | 30 |
| `re_authoritative_fund_gross_to_net_qtr` | 29 |
| **State-lock subtotal** | **213** |

Non-cascading dependent rows (deletable without guards):

| Table | Rows |
|---|---|
| `re_asset_acct_quarter_rollup` | 216 |
| `re_asset_occupancy_quarter` | 216 |
| `re_run_provenance` | 1 |

Cascade-driven deletes (via existing `ON DELETE CASCADE` FKs from `repe_fund` and `repe_deal`):

| Table | Rows (approx, via cascade) |
|---|---|
| `repe_fund` | 3 |
| `repe_deal` | 27 |
| `repe_asset` | 27 |
| `re_capital_ledger_entry` (via `re_partner_commitment` cascade chain) | 2,428 |
| `repe_fund_entity_link`, `repe_fund_scenario`, `repe_fund_term`, `repe_fund_waterfall_definition`, `re_assumption_set`, `re_construction_draw`, `re_fund_quarter_metrics`, `re_fund_quarter_state`, `re_partner_commitment`, `re_partner_quarter_metrics`, `re_scenario`, `re_waterfall_*`, `repe_capital_event`, `scenario_*`, `sus_*` | various, all empty post-cascade |

## Transaction shape

```
BEGIN;
  -- disable 4 trg_re_authoritative_*_guard triggers
  -- delete state-lock-protected snapshot rows (4 tables, 213 rows)
  -- delete asset-level non-cascading dependents (216 + 216 rows)
  -- delete fund-level non-cascading dependents (1 row)
  -- DELETE FROM repe_fund (cascades fire here)
  -- re-enable 4 trg_re_authoritative_*_guard triggers
COMMIT;
```

Single transaction. If any statement had failed, the rollback would have left both the data and the trigger states untouched.

## Post-commit verification

All four state-lock guards are ENABLED:

```sql
SELECT tgname,
       tgrelid::regclass::text AS table_name,
       CASE tgenabled WHEN 'O' THEN 'ENABLED' WHEN 'D' THEN 'DISABLED' END AS state
FROM pg_trigger
WHERE tgname ILIKE '%re_authoritative%guard%'
ORDER BY tgname;
```

Result at receipt time (2026-05-05):

| tgname | table_name | state |
|---|---|---|
| `trg_re_authoritative_asset_state_guard` | `re_authoritative_asset_state_qtr` | ENABLED |
| `trg_re_authoritative_fund_state_guard` | `re_authoritative_fund_state_qtr` | ENABLED |
| `trg_re_authoritative_gross_to_net_guard` | `re_authoritative_fund_gross_to_net_qtr` | ENABLED |
| `trg_re_authoritative_investment_state_guard` | `re_authoritative_investment_state_qtr` | ENABLED |

(Note: the suggested check pattern `'re_authoritative_%_guard'` returns no rows because the actual trigger names carry a `trg_` prefix. The query above uses an `ILIKE '%re_authoritative%guard%'` pattern that catches them.)

Meridian fund count check:

```sql
SELECT name, status FROM repe_fund
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001'
ORDER BY name;
```

Returns exactly 2 rows: `Institutional Growth Fund VII` (investing), `Meridian Real Estate Fund III` (harvesting).

## Related work in this session

- Storage trim (separate, no state-lock interaction): `pds_analytics_timecards` truncated to last 6 months; `fact_cloud_gpu_utilization` and `fact_cloud_resource_usage_hourly` truncated to last 30 days; `VACUUM (FULL, ANALYZE)` on all three. DB went from 482 MB → 230 MB.
- RLS lockdown: `repo-b/db/schema/608_rls_lockdown_public_backfill.sql` enables RLS on every public table the security advisor flagged. Brought `rls_disabled_in_public` from 180 → 1 (`spatial_ref_sys`, intentionally skipped — PostGIS-managed).

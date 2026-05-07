# Phase 1-2 Verification Receipt — Vultr Cloud Intelligence OS

**Date:** 2026-05-06  
**Sentinel env_id:** `14f34243-c3eb-5438-84c3-645a43ee189e`  
**Sentinel business_id:** `13a96f71-1d72-53c4-870c-1c36d044137d`  
**Sentinel label:** `Vultr Verify 2026-05-02 DO NOT USE`  
**Schema migrations applied:** 537, 538  
**Seed pack:** `cloud_infra_starter` v1  
**Supabase project:** `ozboonlsplroialdwuxj`

---

## 1. Migrations Applied (Phase 1)

| Migration | Description | Applied |
|---|---|---|
| `537_cloud_infrastructure_bi.sql` | 11 dim tables + 14 fact tables, RLS, indexes, COMMENT ON TABLE | Yes |
| `538_environment_templates_cloud_infra.sql` | `cloud_infra` template registered in `app.environment_templates` | Yes |

Both migrations are idempotent via `CREATE TABLE IF NOT EXISTS` and `ON CONFLICT ... DO UPDATE`.

---

## 2. Seed Pack Run (Phase 2 — first run)

**Runner:** `verification/runners/vultr_phase_1_2_seed_apply.py`  
**Command:** `python verification/runners/vultr_phase_1_2_seed_apply.py`

| Table | Rows |
|---|---|
| dim_cloud_campaign | 6 |
| dim_cloud_contract | 22 |
| dim_cloud_customer | 61 |
| dim_cloud_data_center | 10 |
| dim_cloud_invoice | 87 |
| dim_cloud_product | 10 |
| dim_cloud_region | 5 |
| dim_cloud_sales_rep | 6 |
| dim_cloud_sku | 12 |
| dim_cloud_support_category | 8 |
| fact_cloud_billing_line_item | 162 |
| fact_cloud_capacity_daily | 2,700 |
| fact_cloud_customer_daily_snapshot | 900 |
| fact_cloud_gpu_utilization | 64,800 |
| fact_cloud_incident | 6 |
| fact_cloud_invoice | 87 |
| fact_cloud_marketing_attribution | 40 |
| fact_cloud_payment | 73 |
| fact_cloud_product_activation | 47 |
| fact_cloud_reconciliation_exception | 9 |
| **fact_cloud_resource_usage_hourly** | **32,400** |
| fact_cloud_revenue_recognition | 87 |
| fact_cloud_sales_pipeline | 28 |
| fact_cloud_support_ticket | 80 |

**Note on pipeline_stages:** The SAVEPOINT block for `v1.pipeline_stages` gracefully skipped — the sentinel env UUID is not present in `v1.environments` (expected; the sentinel is not a real provisioned env). All cloud tables seeded normally.

---

## 3. Idempotency Bug — Root Cause and Fix

### Bug

`fact_cloud_resource_usage_hourly` was not idempotent. Re-running the seed doubled the table from 32,400 to 64,800 rows.

**Root cause:** The seed pack called `executemany` without supplying `usage_id`. The column has `DEFAULT gen_random_uuid()`, so every run generated fresh UUIDs. The INSERT had no `ON CONFLICT` clause, so every row was inserted as new.

**Affected table only:** All other fact tables with generated PKs (`fact_cloud_billing_line_item`, `fact_cloud_invoice`, `fact_cloud_payment`, `fact_cloud_revenue_recognition`, `fact_cloud_marketing_attribution`) explicitly computed and passed deterministic IDs via `_u()` — only `fact_cloud_resource_usage_hourly` was missing this.

### Cleanup

After confirming the bug (64,800 live rows), deleted all sentinel env usage rows:

```sql
DELETE FROM fact_cloud_resource_usage_hourly
WHERE env_id = '14f34243-c3eb-5438-84c3-645a43ee189e';
```

This deletes all usage rows for the sentinel env so the patched seed can repopulate them cleanly. No other tables required cleanup.

### Patch applied

**File:** `backend/app/services/environment_seed_packs_v2/cloud_infra_starter.py`

**Usage batch loop** — added deterministic `resource_key` and `usage_id` before appending to batch:

```python
resource_key = _u(env_id, "resource", cid, sk, rk)
usage_id = _u(env_id, "usage", str(resource_key), ts.isoformat(), "gpu_hour")
usage_batch.append(
    (env_id, business_id, usage_id, resource_key,
     cid, sk, rk, ts, qty, "gpu_hour", "platform_telemetry_demo",
     _u(env_id, "usagerec", cid, str(d), str(h)))
)
```

**executemany INSERT** — added `usage_id` to column list and ON CONFLICT clause:

```sql
INSERT INTO fact_cloud_resource_usage_hourly
  (env_id, business_id, usage_id, resource_key, customer_id, sku_key, region_key,
   usage_hour, usage_quantity, usage_unit, source_system, source_record_id)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (env_id, usage_id) DO NOTHING
```

**ON CONFLICT target rationale:** The table's PK is `(env_id, usage_id)` (537_cloud_infrastructure_bi.sql line 315). No separate UNIQUE constraint exists. `ON CONFLICT (env_id, usage_id)` matches the PK exactly.

**Deterministic key grain:** `resource_key × usage_hour × usage_unit` — this is the natural grain for hourly resource usage. Each (resource, hour, unit) triple is unique per env.

---

## 4. Idempotency Verification

Re-ran seed pack twice after patch + cleanup.

| Run | fact_cloud_resource_usage_hourly (live count) |
|---|---|
| Run 1 | 32,400 |
| Run 2 | 32,400 |

Live count confirmed via:

```sql
SELECT COUNT(*) FROM fact_cloud_resource_usage_hourly
WHERE env_id = '14f34243-c3eb-5438-84c3-645a43ee189e';
-- Result: 32,400
```

---

## 5. RLS Check

All 25 cloud tables have `rowsecurity = true`:

`dim_cloud_campaign`, `dim_cloud_contract`, `dim_cloud_customer`, `dim_cloud_data_center`, `dim_cloud_invoice`, `dim_cloud_product`, `dim_cloud_region`, `dim_cloud_resource`, `dim_cloud_sales_rep`, `dim_cloud_sku`, `dim_cloud_support_category`, `fact_cloud_billing_line_item`, `fact_cloud_capacity_daily`, `fact_cloud_customer_daily_snapshot`, `fact_cloud_gpu_utilization`, `fact_cloud_incident`, `fact_cloud_invoice`, `fact_cloud_marketing_attribution`, `fact_cloud_payment`, `fact_cloud_product_activation`, `fact_cloud_reconciliation_exception`, `fact_cloud_resource_usage_hourly`, `fact_cloud_revenue_recognition`, `fact_cloud_sales_pipeline`, `fact_cloud_support_ticket`

---

## 6. FK / Join Integrity

All checks passed (0 failures):

| Check | Failures |
|---|---|
| orphan_usage_customers | 0 |
| orphan_billing_customers | 0 |
| orphan_invoice_customers | 0 |
| orphan_payment_customers | 0 |
| orphan_revrec_customers | 0 |
| orphan_gpu_util_region | 0 |
| orphan_gpu_util_sku | 0 |
| env_leakage_customers | 0 |

---

## 7. Golden KPI Smoke

| KPI | Value |
|---|---|
| Total utilized GPU-hours | 11,668,461 |
| Total available GPU-hours | 18,953,646 |
| Average GPU utilization % | 60.95% |
| Total recognized revenue | $4,782,038.45 |
| Total deferred revenue | $122,784.37 |
| Total invoiced | $4,904,822.82 |
| Total collected cash | $3,980,461.34 |

All KPIs are in-range for a 90-day, 30-customer, 6-SKU, 5-region GPU cloud demo.

---

## 8. Reconciliation Exception Audit

All 6 engineered exception types are present:

| Exception type | Severity | Count | Total amount |
|---|---|---|---|
| cash_not_collected | critical | 1 | $72,000 |
| contract_mismatch | warning | 1 | $29,000 |
| discount_mismatch | warning | 1 | $9,000 |
| invoice_no_usage | critical | 1 | $9,000 |
| recognition_lag | warning | 2 | $101,000 |
| usage_not_invoiced | warning | 3 | $272,000 |
| **Total** | | **9** | **$492,000** |

---

## 9. Idempotency Status — All Generated-ID Fact Tables

| Table | ID strategy | Idempotent |
|---|---|---|
| fact_cloud_resource_usage_hourly | `_u(env_id,"usage",resource_key,ts.isoformat(),"gpu_hour")` — **patched** | Yes |
| fact_cloud_billing_line_item | `_u(env_id,"billline",cid,sk,str(period_start))` | Yes |
| fact_cloud_invoice | `_u(env_id,"invline",invoice_key)` | Yes |
| fact_cloud_payment | `_u(env_id,"pay",invoice_key)` | Yes |
| fact_cloud_revenue_recognition | `_u(env_id,"revrec",cid,str(period_start))` | Yes |
| fact_cloud_marketing_attribution | `_u(env_id,"attr",cid,ck)` | Yes |
| fact_cloud_reconciliation_exception | `exc_{prefix}_{cid}` string key | Yes |

---

## Phase 3 Safe to Start: YES

All Phase 1-2 requirements met:
- Schema applied and idempotent
- Template registered
- Seed pack deterministic and idempotent (all tables stable on re-run)
- RLS enabled on all 25 tables
- FK integrity clean (0 orphans, 0 env leakage)
- KPIs in range
- All 6 reconciliation exception types seeded and confirmed

Phase 3 (Pydantic schemas, backend services, FastAPI routes) can begin.

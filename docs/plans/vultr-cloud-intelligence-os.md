# Vultr Cloud Intelligence OS — Implementation Plan

**Status:** draft v1
**Last updated:** 2026-05-01
**Owner:** Paul
**Target:** Winston Lab environment, BI Architect interview / portfolio demo

---

## 1. Summary

Build a credible operating console for a usage-based cloud infrastructure / GPU compute company. The hard problem isn't dashboards — it's reconciling six different sources of truth (platform usage, billing engine, NetSuite-style accounting, Salesforce-style CRM, support, infra telemetry) into trusted executive intelligence with provenance, freshness, and fail-closed behavior. The visual anchor is the **GPU Capacity Command Graph**: an interactive flow that connects region → SKU → utilization → revenue → margin → top customers, with click-through to reconciliation exceptions.

The build follows the v2 environment-creation pipeline (`skills/winston-create-environment/SKILL.md`): a new `cloud_infra` template, a `cloud_infra_starter` seed pack, plus a `/lab/env/[envId]/vultr/*` page surface and `/api/vultr/*` FastAPI routes.

---

## 2. Repo Conventions We're Following

| Topic | Convention | Source of truth |
|---|---|---|
| Migration numbering | Next sequential after 536 → start at **537** | `repo-b/db/schema/` highest is `536_re_fund_portfolio_included_funds_view.sql` |
| Migration filename pattern | `NNN_module_description.sql` | `CLAUDE.md` Database Guardrails |
| Table prefix | `cloud_*` (dims) and `cloud_fact_*` (facts) — confirm against `ARCHITECTURE.md` approved prefixes; if `cloud_` not approved, fall back to `vultr_` and register the prefix in ARCHITECTURE.md as part of this PR | `CLAUDE.md` rule 5 |
| RLS | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `env_id = current_setting('app.env_id', true)` policy | `CLAUDE.md` rule 1 |
| Required columns | `env_id TEXT NOT NULL`, `business_id UUID NOT NULL`, `COMMENT ON TABLE` | `CLAUDE.md` rules 2, 7 |
| Page route shape | `/lab/env/[envId]/<domain>/<sub>` — examples: `credit/`, `ncf/`, `operator/`, `legal/`, `medical/` | `repo-b/src/app/lab/env/[envId]/` directory |
| Domain workspace shell | `repo-b/src/components/domain/DomainWorkspaceShell.tsx` — switch on `DomainSlug` in `navItems()`. Add `vultr` to `DomainSlug` type in `DomainEnvProvider.tsx`, label entry, and a switch case | confirmed 2026-05-01 |
| Backend route module | `backend/app/routes/<domain>.py`, registered in `backend/app/main.py` | `backend/app/routes/credit.py` (template) |
| Service module | `backend/app/services/<domain>_*.py`, with deterministic functions and Pydantic response models | `backend/app/services/credit_*.py` |
| Environment creation | v2 manifest pipeline: new `template_key: cloud_infra` + `seed_pack: cloud_infra_starter` | `skills/winston-create-environment/SKILL.md` |
| Fail-closed metrics | Return `null` + `null_reason` instead of zero; provenance + freshness on every metric block | `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` (REPE) — adapt the pattern, not the snapshot machinery itself |
| Writing style | Direct, no AI fluff; follow `docs/anti-ai-style.md` | `CLAUDE.md` Writing Style |

---

## 3. Data Model

### 3.1 Migration files

**Primary migration:** `repo-b/db/schema/537_cloud_infrastructure_bi.sql`

**Optional split (preferred for review):**
- `537_cloud_infra_dimensions.sql` — dims + RLS
- `538_cloud_infra_facts.sql` — facts + RLS + indexes
- `539_cloud_infra_seed_static.sql` — region/SKU/product reference data only (deterministic, idempotent)

**Seed data NOT in SQL:** customer, usage, billing, invoice, sales, support, incident, reconciliation rows live in the seed pack (`backend/app/services/environment_seed_packs_v2/cloud_infra_starter.py`) so they're env-scoped and deterministic per slug.

### 3.2 Dimension tables

| Table | Purpose | Key columns beyond env_id/business_id |
|---|---|---|
| `cloud_dim_customer` | Customer/account master | `customer_id` (PK), `account_id`, `parent_account_id`, `signup_date`, `country`, `segment` (enum: self_service, smb, enterprise, ai_customer, reseller, startup), `salesforce_owner_id`, `contract_type`, `account_status`, `support_tier`, `kyc_status`, `risk_flags JSONB` |
| `cloud_dim_product` | Product family master | `product_key` (PK), `family` (compute, gpu, bare_metal, k8s, object_storage, block_storage, managed_db, load_balancer, bandwidth, cdn), `display_name`, `unit_of_measure` |
| `cloud_dim_sku` | Per-SKU detail | `sku_key` (PK), `product_key` (FK), `gpu_model`, `cpu_cores`, `ram_gb`, `storage_gb`, `list_price_per_hour_usd`, `cost_per_hour_usd`, `power_w`, `marked_demo BOOLEAN` |
| `cloud_dim_region` | Region/geo master | `region_key` (PK), `region_name`, `country`, `data_center_count`, `power_capacity_mw`, `tier` (tier1, tier2, edge) |
| `cloud_dim_data_center` | DC-level facility | `dc_key` (PK), `region_key` (FK), `name`, `rack_count`, `commissioned_at`, `power_capacity_kw`, `cooling_capacity_btu` |
| `cloud_dim_resource` | Provisioned resource instance | `resource_key` (PK), `customer_id` (FK), `sku_key` (FK), `region_key` (FK), `provisioned_at`, `terminated_at`, `current_state` |
| `cloud_dim_sales_rep` | Salesforce-style rep master | `rep_key` (PK), `name`, `team`, `region`, `quota_usd` |
| `cloud_dim_campaign` | Marketing campaign master | `campaign_key` (PK), `channel` (paid_search, content, devrel, conf, free_credit), `name`, `start_date`, `spend_usd` |
| `cloud_dim_contract` | Customer contracts/commitments | `contract_key` (PK), `customer_id`, `contract_type` (self_service, committed, reserved, enterprise), `committed_amount_usd`, `start_date`, `end_date`, `discount_pct` |
| `cloud_dim_invoice` | Invoice header | `invoice_key` (PK), `customer_id`, `invoice_number`, `period_start`, `period_end`, `currency`, `status` |
| `cloud_dim_support_category` | Support taxonomy | `category_key` (PK), `category`, `subcategory`, `severity_default` |

**Date dim:** check if `app.dim_date` or equivalent exists. If yes, reuse. If not, this is an open question (section 8) — likely use a Postgres `generate_series` view rather than a new table.

### 3.3 Fact tables

| Table | Grain | Required columns |
|---|---|---|
| `cloud_fact_resource_usage_hourly` | resource × hour | `resource_key`, `customer_id`, `sku_key`, `region_key`, `usage_hour TIMESTAMPTZ`, `usage_quantity NUMERIC`, `usage_unit TEXT`, `source_system`, `source_record_id`, `source_updated_at` |
| `cloud_fact_billing_line_item` | rated charge | `line_id`, `customer_id`, `sku_key`, `period_start`, `period_end`, `rated_amount_usd`, `quantity`, `unit_price_usd`, `discount_amount_usd`, `source_system`, `source_record_id` |
| `cloud_fact_invoice` | invoice line, monthly | `invoice_key`, `customer_id`, `period_start`, `invoice_amount_usd`, `tax_usd`, `currency`, `issued_at`, `paid_at`, `status` |
| `cloud_fact_payment` | payment | `payment_id`, `invoice_key`, `customer_id`, `paid_at`, `amount_usd`, `method`, `failed_reason` |
| `cloud_fact_revenue_recognition` | NetSuite-style monthly | `recognition_id`, `customer_id`, `period_month DATE`, `recognized_revenue_usd`, `deferred_revenue_usd`, `source_system='netsuite_demo'`, `source_record_id`, `posted_at` |
| `cloud_fact_sales_pipeline` | opportunity snapshot | `opportunity_id`, `customer_id`, `rep_key`, `stage`, `amount_usd`, `close_probability`, `expected_close_date`, `committed_capacity_usd`, `lost_reason` |
| `cloud_fact_customer_daily_snapshot` | customer × day | `customer_id`, `snapshot_date`, `daily_usage_revenue_usd`, `daily_recognized_revenue_usd`, `outstanding_ar_usd`, `support_tickets_open`, `churn_risk_score NUMERIC(5,2)`, `null_reason TEXT` |
| `cloud_fact_capacity_daily` | region × sku × day | `region_key`, `sku_key`, `capacity_date`, `available_units NUMERIC`, `utilized_units NUMERIC`, `reserved_units NUMERIC`, `oversubscription_ratio NUMERIC` |
| `cloud_fact_gpu_utilization` | region × gpu_sku × hour | `region_key`, `sku_key`, `usage_hour`, `available_gpu_hours`, `utilized_gpu_hours`, `reserved_gpu_hours`, `realized_price_per_hour_usd`, `cost_per_hour_usd` |
| `cloud_fact_support_ticket` | ticket | `ticket_id`, `customer_id`, `category_key`, `opened_at`, `resolved_at`, `severity`, `sla_breached BOOLEAN`, `escalated BOOLEAN`, `region_key`, `sku_key`, `customer_satisfaction NUMERIC` |
| `cloud_fact_incident` | infra incident | `incident_id`, `region_key`, `sku_key`, `started_at`, `resolved_at`, `severity`, `customers_impacted INT`, `root_cause` |
| `cloud_fact_marketing_attribution` | customer × campaign | `customer_id`, `campaign_key`, `first_touch_at`, `last_touch_at`, `signup_at`, `activation_at`, `attributed_revenue_usd` |
| `cloud_fact_product_activation` | customer × product first-use | `customer_id`, `product_key`, `first_deployed_at`, `days_to_activation` |
| `cloud_fact_reconciliation_exception` | exception event | `exception_id`, `customer_id`, `exception_type` (usage_not_invoiced, invoice_no_usage, contract_mismatch, discount_mismatch, recognition_lag, cash_not_collected), `severity`, `period_start`, `period_end`, `amount_usd`, `detected_at`, `resolved_at`, `notes` |

### 3.4 Indexes

Each fact gets at minimum:
- `(env_id, customer_id, period_start)` for customer-period queries
- `(env_id, region_key, period_start)` for regional queries
- GPU-specific: `(env_id, region_key, sku_key, usage_hour DESC)` to support the GPU Command Graph's region/SKU filter

Per `CLAUDE.md` rule 6: each index must be named and have a documented query path. Document in the migration file's leading comment block.

### 3.5 RLS policy template (apply to every table)

```sql
ALTER TABLE cloud_dim_customer ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cloud_dim_customer ON cloud_dim_customer
  USING (env_id = current_setting('app.env_id', true));
COMMENT ON TABLE cloud_dim_customer IS
  'Vultr Cloud Intelligence OS: customer master. Owned by cloud_infra environment module.';
```

---

## 4. Backend Services & Routes

### 4.1 Service modules (`backend/app/services/`)

| Module | Responsibility |
|---|---|
| `vultr_cloud_dataset.py` | Read helpers: typed loaders for each fact/dim, env-scoped, returns Pydantic models |
| `vultr_cloud_metrics.py` | Deterministic metric calculators (gross margin, NRR, churn risk, capacity exhaustion) |
| `vultr_cloud_reconciliation.py` | The 6-stage bridge logic + exception detection |
| `vultr_cloud_gpu_economics.py` | GPU command graph data shaping: region/SKU/customer flows, time series, kpis |
| `vultr_cloud_freshness.py` | Per-source-system freshness checker (returns `fresh | stale | unavailable` + reason) |

### 4.2 Pydantic response models

In `backend/app/schemas/vultr.py`:

```python
class MetricBlock(BaseModel):
    key: str
    label: str
    value: Decimal | None
    unit: Literal["usd", "pct", "count", "hours", "days"]
    period: str  # MTD, QTD, YTD, 7D, 30D, 90D
    status: Literal["ok", "stale", "unavailable", "blocked"]
    null_reason: str | None
    provenance: dict[str, str]  # {source: ..., source_system: ..., source_record_count: int}

class FreshnessReport(BaseModel):
    usage: Literal["fresh", "stale", "unavailable"]
    billing: Literal["fresh", "stale", "unavailable"]
    netsuite: Literal["fresh", "stale", "unavailable"]
    salesforce: Literal["fresh", "stale", "unavailable"]
    support: Literal["fresh", "stale", "unavailable"]
    last_synced_at: datetime | None

class VultrEnvelope(BaseModel):
    env_id: str
    as_of: datetime
    freshness: FreshnessReport
    metric_blocks: list[MetricBlock]
    data: dict
    exceptions: list[ReconciliationException] = []
    warnings: list[Warning] = []
```

### 4.3 Routes (`backend/app/routes/vultr.py`)

All routes accept `env_id` query param (or derive from session per existing pattern), return `VultrEnvelope`-shaped payloads.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/vultr/summary` | landing-page hero KPIs + freshness |
| GET | `/api/vultr/executive` | full executive operating dashboard data |
| GET | `/api/vultr/reconciliation` | 6-stage bridge totals + paginated exception list |
| GET | `/api/vultr/reconciliation/{exception_id}` | detail for one exception |
| GET | `/api/vultr/gpu-economics` | aggregate GPU economics (region × SKU × time) |
| GET | `/api/vultr/gpu-command-graph` | flagship graph payload (see §6 below) |
| GET | `/api/vultr/customers` | paginated customer 360 list |
| GET | `/api/vultr/customers/{customer_id}` | customer detail |
| GET | `/api/vultr/sales` | pipeline + closed-won-to-activation tracking |
| GET | `/api/vultr/operations` | support + incident + reliability |
| GET | `/api/vultr/data-model` | metric definitions, source precedence, freshness |
| GET | `/api/vultr/quality` | data-quality checks output |

Register in `backend/app/main.py` alongside existing routers.

### 4.4 Deterministic logic

- **Gross margin per GPU-hour** = `realized_price_per_hour_usd - cost_per_hour_usd` from `cloud_fact_gpu_utilization`. If `cost_per_hour_usd` is null, return null + `null_reason: "cost_allocation_unavailable"`.
- **Capacity exhaustion forecast** = trailing-30-day utilization growth rate × forward projection until `utilized / available ≥ 95%`. Deterministic linear regression on daily totals from `cloud_fact_capacity_daily`. Fail-closed if <14 days of data.
- **Churn risk score** (0–100): weighted sum of declining_usage_trend (30%), open_unresolved_tickets (15%), sla_breach_count_90d (15%), payment_delinquency_days (15%), days_to_renewal (10%), low_activation (10%), negative_margin_flag (5%). Documented in the metric definitions surface.
- **Reconciliation diff** at each stage: pure SQL comparing aggregates per `(customer_id, period_month)` between consecutive fact tables. Tolerance threshold = $0.50 (configurable). Anything above threshold becomes a `cloud_fact_reconciliation_exception` row.
- **NRR** = (recognized_rev_t − churn − contraction + expansion) / recognized_rev_t-12. Computed monthly.

No LLM calls in core metric paths. Determinism is non-negotiable.

### 4.5 v2 environment plumbing

- **New template:** `cloud_infra` registered in `repo-b/db/schema/516_environment_templates_seed.sql` (or successor migration if 516 is sealed). Template defaults: `seed_pack=cloud_infra_starter`, `env_kind=demo`, theme accent matching Vultr blue.
- **New seed pack:** `backend/app/services/environment_seed_packs_v2/cloud_infra_starter.py`. Implements `apply(cur, env_id, business_id, *, actor)`. Uses `uuid5(NAMESPACE_DNS, f"{slug}:cloud_infra:{row_index}")` for deterministic IDs. Idempotent inserts.
- **Pipeline stages seed:** since the workspace UI requires `v1.pipeline_stages`, seed a minimal cloud-ops pipeline: `prospect → trial → activated → growing → at_risk → churned`.

---

## 5. Frontend Routes & Pages

### 5.1 Page files

```
repo-b/src/app/lab/env/[envId]/vultr/
├── page.tsx                          # executive landing (hero + GPU Command Graph above the fold)
├── executive/page.tsx                # full executive console
├── reconciliation/page.tsx           # 6-stage bridge + exceptions
├── reconciliation/[exceptionId]/page.tsx
├── gpu-economics/page.tsx            # GPU capacity trading desk
├── customers/page.tsx                # customer 360 table
├── customers/[customerId]/page.tsx
├── sales/page.tsx                    # pipeline → activation
├── operations/page.tsx               # support + incidents
├── data-model/page.tsx               # canonical schema explorer
└── bi-architect/page.tsx             # workbench / architecture notes
```

### 5.2 New components (`repo-b/src/components/vultr/`)

- `VultrExecutiveLanding.tsx`
- `GpuCapacityCommandGraph.tsx` ← flagship (see §6)
- `GpuCapacityKpiStrip.tsx`
- `GpuCapacityFilterContext.tsx` (React context provider)
- `GpuCapacityTooltip.tsx`
- `GpuCustomerConsumptionTable.tsx`
- `GpuCapacityExceptionDrawer.tsx`
- `CloudMetricTile.tsx` (extend existing `MetricTile` if it exists; verify before creating)
- `ReconciliationBridge.tsx`
- `ReconciliationExceptionsTable.tsx`
- `Customer360Table.tsx`
- `CustomerDetailDrawer.tsx`
- `SalesToUsagePanel.tsx`
- `OperationsReliabilityPanel.tsx`
- `DataQualityRail.tsx`
- `SemanticModelExplorer.tsx`
- `SourceProvenanceChip.tsx`
- `UnavailableMetric.tsx` (with `null_reason` prop)
- `FreshnessBadge.tsx`
- `CapacityRiskBadge.tsx`
- `MetricDefinitionDrawer.tsx`

### 5.3 API client

Extend `repo-b/src/lib/bos-api.ts` (or create `repo-b/src/lib/vultr-api.ts`) with typed fetchers for each `/api/vultr/*` endpoint. Mirror the response model from §4.2.

### 5.4 Nav registration

The existing pattern (per Plan agent recon, **needs verification**) is the `DomainWorkspaceShell.navItems()` switch in `repo-b/src/components/domain/DomainWorkspaceShell.tsx`. Add a `vultr` case. If a registry-based pattern exists, prefer that and skip the switch edit.

The new env must also appear in:
- the v2 templates list (`/v2/environments/templates`)
- whatever environment switcher / lab list page renders environments

---

## 6. Flagship: GPU Capacity Command Graph

### 6.1 Visual identity

- Primary accent: `#007BFC` (Vultr-style blue) — register as CSS token `--vultr-accent`
- Secondary: deep indigo `#1A2B6B`, cyan highlight `#00D4FF`
- Background: dark operating-console (`hsl(222 47% 6%)` matching existing dark-first surfaces)
- Subtle gridlines, thin electric-blue strokes
- Header label: text-only "Vultr Cloud Intelligence OS — GPU Capacity Command Graph"
- Footer chip: "Vultr-inspired demo styling"
- No web-pulled logos. No copyrighted assets.

### 6.2 Layout

```
┌───────────────────────────────────────────────────────────────────────┐
│  KPI strip: filter context + headline KPIs                            │
├──────────────┬─────────────────────────────────┬──────────────────────┤
│   REGIONS    │      GPU SKU FLOWS              │   TOP CUSTOMERS      │
│  (capacity   │  (Sankey/flow: region → SKU →   │  (ranked, expandable │
│   lanes,     │   utilization → revenue → margin│   per filter)        │
│   stacked)   │   bands)                        │                      │
│              │                                 │   EXCEPTION BUCKETS  │
│              │                                 │   (3 click-through   │
│              │                                 │    badges)           │
├──────────────┴─────────────────────────────────┴──────────────────────┤
│  TIME-SERIES STRIP: utilization & realized margin trend              │
├───────────────────────────────────────────────────────────────────────┤
│  Toggles: Time(7D|30D|90D|MTD|QTD)  Metric(Util|Rev|Margin|Risk)     │
│            Segment(Enterprise AI|Self-Service|SMB|Startup|Reseller)  │
└───────────────────────────────────────────────────────────────────────┘
```

### 6.3 Visualization stack — RESOLVED

Confirmed installed in `repo-b/package.json`. Stack:

- **`@xyflow/react` (React Flow ^12.10.2)** — drives the central interactive graph. Region / SKU / customer rendered as custom node types; edges between columns carry width proportional to the active metric (utilization / revenue / margin / risk). Native pan, zoom, selection, and edge animation. No custom SVG sankey needed.
- **Recharts ^2.15.4** — bottom time-series strip (`ComposedChart` with line + area), and KPI mini-sparklines if added.
- **Pure flex/grid CSS** — KPI strip, toggles.
- **Zustand ^5.0.12** — `useGpuCapacityFilters` store (region, sku, segment, period, metric). Preferred over React context for ergonomic access from sibling panels (KPI strip, customer table, exception drawer).
- **Geist** font + `--vultr-accent` CSS token — brand identity.

Custom React Flow node types to build:
- `RegionCapacityNode.tsx` — left column, stacked capacity lane with utilization bar
- `SkuFlowNode.tsx` — middle column, SKU bands with realized $/hr label
- `CustomerNode.tsx` — right column, customer with consumed-hours and concentration%
- `ExceptionBadgeNode.tsx` — clickable, opens reconciliation drawer

Custom edge type: `CapacityFlowEdge.tsx` — variable stroke width tied to active metric.

### 6.4 Interaction model

- **Click region** → updates `GpuCapacityFilterContext.region`; KPI strip, customer table, exception drawer, time-series all re-fetch with `?region=` filter
- **Click SKU** → adds `?sku=` filter
- **Click customer** → opens `CustomerDetailDrawer` overlaid
- **Click exception badge** → opens `GpuCapacityExceptionDrawer` showing the 6-stage bridge for that exception
- **Hover any flow band** → `GpuCapacityTooltip` shows: capacity, utilization%, revenue, margin%, realized $/GPU-hour, forecasted exhaustion date, source freshness, source_record_count
- **Toggle time range** → re-fetches `/api/vultr/gpu-command-graph?period=...`
- **Toggle metric** → swaps which dimension drives band width (utilization, revenue, margin, exhaustion-risk)
- **Toggle segment** → adds `?segment=` filter

All filter state lives in `GpuCapacityFilterContext`. URL query params reflect state so deep links work.

### 6.5 Backend endpoint

`GET /api/vultr/gpu-command-graph?env_id=...&period=30d&region=...&sku=...&segment=...`

Response:

```json
{
  "env_id": "env_...",
  "as_of": "2026-05-01T00:00:00Z",
  "filters": { "period": "30d", "region": null, "sku": null, "segment": null },
  "kpis": [
    { "key": "utilized_gpu_hours", "label": "Utilized GPU-Hours", "value": 8420000, "unit": "hours", "status": "ok", "null_reason": null, "provenance": { "source": "cloud_fact_gpu_utilization", "source_system": "platform_telemetry_demo" } },
    { "key": "gross_margin_per_gpu_hour", "label": "Gross Margin / GPU-Hour", "value": 1.42, "unit": "usd", "status": "ok" },
    { "key": "capacity_exhaustion_forecast_days", "label": "Forecast Exhaustion (FRA)", "value": 21, "unit": "days", "status": "ok" }
  ],
  "regions": [
    { "region_key": "fra", "name": "Frankfurt", "available_gpu_hours": 720000, "utilized_gpu_hours": 691000, "utilization_pct": 95.97, "capacity_risk": "high", "exhaustion_forecast_days": 21 }
  ],
  "sku_nodes": [
    { "sku_key": "h100-80gb", "gpu_model": "H100", "utilized_gpu_hours": 320000, "realized_price_per_hour_usd": 4.85, "cost_per_hour_usd": 2.15, "gross_margin_per_hour_usd": 2.70 }
  ],
  "customer_nodes": [
    { "customer_id": "cust_...", "name": "Helios AI", "segment": "ai_customer", "consumed_gpu_hours": 84000, "concentration_pct": 12.4 }
  ],
  "flows": [
    { "from": "fra", "to": "h100-80gb", "weight": 380000, "metric": "utilized_gpu_hours" },
    { "from": "h100-80gb", "to": "cust_helios", "weight": 84000 }
  ],
  "time_series": [
    { "ts": "2026-04-02", "utilization_pct": 87.1, "realized_margin_per_hour_usd": 2.61 }
  ],
  "exceptions": [
    { "exception_id": "exc_001", "type": "usage_not_invoiced", "amount_usd": 124300, "customer_id": "cust_helios", "severity": "warning" }
  ],
  "freshness": { "usage": "fresh", "billing": "fresh", "netsuite": "stale", "salesforce": "fresh" },
  "provenance": { "primary_source": "cloud_fact_gpu_utilization", "joined_with": ["cloud_fact_billing_line_item", "cloud_fact_reconciliation_exception"] }
}
```

### 6.6 Acceptance criteria

1. Renders on `/lab/env/[envId]/vultr` immediately below the hero strip
2. Vultr-inspired blue/cyan styling visible without official assets
3. Click region/SKU/customer updates the filter context and re-fetches
4. Hover tooltips show operational detail (capacity, util%, revenue, margin%, exhaustion forecast, freshness, record count)
5. Reconciliation exception badges open the bridge drawer
6. Zero frontend-only fake data — every node is backed by `/api/vultr/gpu-command-graph`
7. Missing values render as `<UnavailableMetric reason={null_reason} />`
8. Playwright test verifies render + at least one click changes the filter context
9. Receipt doc includes screenshot path and Playwright trace

---

## 7. Phased Execution Order

| Phase | Deliverable | Done when |
|---|---|---|
| 0 — Recon | Verify table-prefix policy in ARCHITECTURE.md, confirm Recharts/D3 in repo deps, locate nav registry, check for existing date dim, confirm `MetricTile`/`FreshnessBadge` reuse candidates | Open questions in §8 are resolved or escalated |
| 1 — Schema | Migration 537 (+ optional 538/539 split). All tables created, RLS applied, indexes named, comments added. Static reference data (regions, SKUs, products) seeded in SQL | `psql` against a fresh DB; `\d cloud_dim_customer` shows expected columns; RLS policy listed |
| 2 — Seed pack | `cloud_infra_starter.py` creates 50–150 customers, 90 days hourly GPU util, 200+ billing lines, 30+ invoices, 10+ opportunities, 50+ tickets, 5+ incidents, ≥5 reconciliation exceptions | Dry-run via `POST /v2/environments` with `dry_run: true` returns ok; full apply on a test slug populates expected counts |
| 3 — Backend services & routes | All 12 endpoints under `/api/vultr/*` returning `VultrEnvelope`-shaped data. Deterministic logic for margin, exhaustion, churn, reconciliation. Pydantic models complete | `pytest backend/tests/test_vultr_*.py` green; manual curl confirms shape |
| 4 — Frontend scaffolding | All page files exist with placeholder content; nav/route registration done; API clients typed | `npm run dev`; navigate to `/lab/env/<test-env>/vultr` and each subroute renders without crash |
| 5 — Flagship graph | `GpuCapacityCommandGraph.tsx` + supporting components; filter context wired; tooltip, customer table, exception drawer functional | Manual: filter interactions update visible state; console clean |
| 6 — Other surfaces | Reconciliation bridge, customer 360, sales, operations, data-model, BI architect workbench all rendering real data | Each page passes manual smoke; no `console.error` |
| 7 — Fail-closed polish | UnavailableMetric, FreshnessBadge, SourceProvenanceChip applied throughout; null cases verified | Grep confirms no metric returns silent zero; staleness deliberately introduced via env var still renders correctly |
| 8 — Tests | Backend pytest, frontend component tests, Playwright E2E, smoke script | All green in CI |
| 9 — Receipts & docs | `docs/receipts/vultr-cloud-intelligence-os.md`, `docs/vultr-cloud-intelligence-os.md`, screenshots, trace files | Receipt doc has all required sections per spec §13 |

---

## 8. Recon Findings (Phase 0 Complete — 2026-05-01)

Inventoried against the actual repo. Open questions resolved unless noted.

1. **Table prefix — RESOLVED.** `ARCHITECTURE.md` lines 25–26 explicitly approve `dim_` and `fact_` as durable prefixes. `dim_cloud_customer`, `fact_cloud_resource_usage_hourly`, etc. are valid as written. No prefix registration required. `dim_date` already exists at `repo-b/db/schema/020_reporting.sql:10` and is exempt from env_id per ARCHITECTURE.md line 97 — reuse it.

2. **Visualization library — UPGRADED.** Confirmed installed in `repo-b/package.json`:
   - `recharts ^2.15.4` (charts, time series, bars)
   - **`@xyflow/react ^12.10.2` (React Flow)** — node-edge graph library, native interactive flows with custom node/edge components
   - `react-leaflet ^4.2.1` + `leaflet ^1.9.4` (maps — usable for a region capacity map view)
   - `@dnd-kit/*` (drag/drop)
   - `geist ^1.7.0` (font)
   - `lucide-react ^0.539.0` (icons)
   - `zustand ^5.0.12` (lightweight state — preferred over React context for `GpuCapacityFilterContext`)
   - `zod` (response validation)
   No D3 or Visx. **Decision: build the GPU Capacity Command Graph on React Flow + Recharts.** React Flow handles region/SKU/customer nodes with custom edge widths driven by utilized GPU-hours. Recharts handles the bottom time-series strip and the KPI mini-sparklines. This is a significant upgrade over custom SVG sankey — much faster to build, native pan/zoom/select, animated edge transitions.

3. **Nav registry — CONFIRMED switch pattern.** `repo-b/src/components/domain/DomainWorkspaceShell.tsx` uses:
   - `DomainSlug` type imported from `DomainEnvProvider`
   - `DOMAIN_LABELS: Record<DomainSlug, string>` (line 16–37)
   - `navItems(domain, base): NavItem[]` switch function (line 39–217)

   Adding `vultr` requires three edits:
   1. Add `"vultr"` to the `DomainSlug` union in `repo-b/src/components/domain/DomainEnvProvider.tsx`
   2. Add `vultr: "Vultr Cloud Intelligence OS"` to `DOMAIN_LABELS`
   3. Add a `vultr` case in `navItems()` returning the 8 sub-route nav items

   No JSON-driven registry exists yet. This is the canonical pattern.

4. **Existing reusable components — NONE to reuse.** Grep across `repo-b/src/components/` for `MetricTile`, `FreshnessBadge`, `UnavailableMetric`, `ProvenanceChip`, `SourceProvenance` returned only inline references inside two REPE drawer tabs (`ValuationTab.tsx`, `ReturnsTab.tsx`) — no shared components by these names. Build them fresh under `repo-b/src/components/vultr/` for now; if they prove generally useful, hoist to `repo-b/src/components/ui/` in a follow-up PR.

5. **Authoritative-state lockdown — RECOMMENDED carve-out.** The lockdown rules (`docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`) are REPE-only and enforced by the lint at `verification/lint/no_legacy_repe_reads.py`. Vultr environment is **not REPE**, so the lint won't trip. Adopt the *pattern* (provenance on every metric, fail-closed nulls with reason, freshness stamps) without the snapshot machinery. Document the carve-out in `docs/vultr-cloud-intelligence-os.md`. Open question only if user wants snapshot lifecycle parity — otherwise resolved.

6. **Reconciliation determinism — DESIGN DECISION.** Recommend strict lock-step in seeded data: a single `period_month` drives `usage_date_max`, `billing_period`, `invoice_period_start`, `revenue_recognition_period`. Exception scenarios are then engineered explicitly (e.g., one customer's `cloud_fact_invoice` row deliberately omitted to create `usage_not_invoiced`). Spurious breaks are easier to debug when the baseline is exact.

7. **Date dimension — EXISTS, reuse.** `dim_date` lives in `020_reporting.sql:10`. Already exempt per `ARCHITECTURE.md` line 96. No action needed.

8. **v2 template vs. surface-only — DECISION NEEDED.** Plan assumes a new `cloud_infra` template + `cloud_infra_starter` seed pack via the v2 pipeline (so the env shows up at `/v2/environments/templates` and can be provisioned by name). This makes the demo reusable for sales calls and gives the env a real `env_id`. Alternative: drop the surface onto an existing env (e.g., create a one-off env named "vultr-demo" via the empty_lab template). **Recommendation: register the new template** — it's not much extra work, and it tells the BI Architect story better ("here's a template anyone can stamp out").

9. **Backend router registration — CONFIRMED pattern.** `backend/app/main.py:361–422` is a long sequence of `app.include_router(...)` calls. Add `app.include_router(vultr.router)` after the PDS block (~line 422). Trivial edit.

10. **Brand-asset risk — UNCHANGED.** Stick with `#007BFC` and "Vultr-inspired demo styling" text branding. No logo files committed to the repo.

### Outstanding decisions for the user

- (8) Confirm v2 template + seed pack route vs. one-off env creation.
- (5) Confirm REPE-style snapshot machinery is **out of scope** for this env (recommended).
- General: confirm two-week effort estimate is acceptable, or whether to descope to a v1 that ships the flagship graph + 3 surfaces only (executive landing, reconciliation, GPU economics) and defers customers/sales/operations/data-model to v2.

---

## 9. Backlog (Post-V1)

- BigQuery / Fivetran-style ingestion adapter stubs (read from external source instead of seed)
- NetSuite connector stub (real API shape)
- Salesforce connector stub
- Looker semantic model export (LookML for the canonical metrics)
- Power BI dataset export (`.pbix` / DAX measures)
- dbt-style metric layer with tests
- Forecast model for GPU demand (ARIMA or Prophet on `cloud_fact_capacity_daily`)
- Scenario simulation: "what if we add 24,000 MI355X in Frankfurt?"
- Row-level security by department / executive role on the read APIs
- Winston assistant actions:
  - "Why is GPU margin down?"
  - "Show customers with usage not invoiced"
  - "Draft a CFO memo on reconciliation exceptions"
  - "Find GPU capacity risk by region"
- Eval loop for report correctness (golden dataset → expected KPI values)
- Data quality alert scheduler (daily cron checking freshness staleness, anomaly detection)
- AI-generated narrative summaries grounded in the deterministic backend (same pattern as History Rhymes weekly brief)

---

## 10. Receipt & Doc Deliverables

### `docs/receipts/vultr-cloud-intelligence-os.md`

- Files changed (full list)
- Routes added (`/lab/env/[envId]/vultr/*`)
- API endpoints added (`/api/vultr/*`)
- SQL migrations added (537+)
- Seed data counts (customers, regions, SKUs, hourly usage rows, etc.)
- Metrics implemented (catalog with definitions)
- Reconciliation exception examples (3+ concrete cases by customer/period)
- Screenshot paths + Playwright trace path
- Test commands run + summary
- Known limitations
- Follow-up backlog (link to §9)

### `docs/vultr-cloud-intelligence-os.md`

- Purpose
- Data model (link to migration files, ER summary)
- Source systems modeled
- Metric definitions (canonical list with formulas)
- Reconciliation logic (6-stage bridge math)
- Governance model (source precedence, freshness rules, RLS)
- BI Architect narrative (the §8 spec storytelling)
- Future enhancements (link to §9)

---

## 11. Estimated Effort

| Phase | Hours |
|---|---|
| 0 — Recon | 2 |
| 1 — Schema | 6 |
| 2 — Seed pack | 8 |
| 3 — Backend services & routes | 14 |
| 4 — Frontend scaffolding | 4 |
| 5 — Flagship graph | 12 |
| 6 — Other surfaces | 14 |
| 7 — Fail-closed polish | 4 |
| 8 — Tests | 8 |
| 9 — Receipts & docs | 4 |
| **Total** | **~76 hours (≈2 weeks full-time)** |

Critical path: Phase 1 → Phase 2 → Phase 3 must finish before any frontend work. Phases 4 and 5 can run in parallel once 3 is done. Phase 6 surfaces can be parallelized across multiple sessions.

---

## 12. Critical Files Reference

| File | Purpose |
|---|---|
| `repo-b/db/schema/537_cloud_infrastructure_bi.sql` | Schema |
| `backend/app/services/environment_seed_packs_v2/cloud_infra_starter.py` | Seed pack |
| `backend/app/services/vultr_cloud_dataset.py` | Read layer |
| `backend/app/services/vultr_cloud_metrics.py` | Deterministic calculators |
| `backend/app/services/vultr_cloud_reconciliation.py` | Bridge logic |
| `backend/app/services/vultr_cloud_gpu_economics.py` | GPU graph data |
| `backend/app/routes/vultr.py` | FastAPI routes |
| `backend/app/schemas/vultr.py` | Pydantic models |
| `repo-b/src/app/lab/env/[envId]/vultr/page.tsx` | Landing page |
| `repo-b/src/components/vultr/GpuCapacityCommandGraph.tsx` | Flagship graph |
| `repo-b/src/lib/vultr-api.ts` | Client fetcher |
| `repo-b/src/components/domain/DomainWorkspaceShell.tsx` | Nav registration (verify) |
| `docs/receipts/vultr-cloud-intelligence-os.md` | Receipt |
| `docs/vultr-cloud-intelligence-os.md` | Architecture doc |

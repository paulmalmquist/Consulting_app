/**
 * Zod contracts for the Vultr Cloud Intelligence OS API.
 *
 * Mirrors backend/app/schemas/vultr.py. Decimal fields arrive as strings
 * (Pydantic Decimal serializer) — we coerce to number via z.coerce.number().
 * Use these schemas in the API client to validate every response.
 */
import { z } from "zod";

export const MetricStatus = z.enum(["ok", "stale", "unavailable", "blocked"]);
export type MetricStatus = z.infer<typeof MetricStatus>;

export const SourceFreshness = z.enum(["fresh", "stale", "unavailable"]);
export type SourceFreshness = z.infer<typeof SourceFreshness>;

export const MetricUnit = z.enum([
  "usd",
  "usd_per_hour",
  "pct",
  "count",
  "hours",
  "gpu_hours",
  "days",
  "ratio",
]);
export type MetricUnit = z.infer<typeof MetricUnit>;

export const MetricPeriod = z.enum(["7D", "30D", "90D", "MTD", "QTD", "YTD"]);
export type MetricPeriod = z.infer<typeof MetricPeriod>;

export const Provenance = z.object({
  source: z.string(),
  source_system: z.string().nullable().optional(),
  source_record_count: z.number().int().nullable().optional(),
  joined_with: z.array(z.string()).default([]),
});
export type Provenance = z.infer<typeof Provenance>;

export const MetricBlock = z.object({
  key: z.string(),
  label: z.string(),
  value: z.coerce.number().nullable(),
  unit: MetricUnit,
  period: MetricPeriod.nullable().optional(),
  status: MetricStatus,
  null_reason: z.string().nullable().optional(),
  provenance: Provenance,
});
export type MetricBlock = z.infer<typeof MetricBlock>;

export const FreshnessReport = z.object({
  usage: SourceFreshness,
  billing: SourceFreshness,
  netsuite: SourceFreshness,
  salesforce: SourceFreshness,
  support: SourceFreshness,
  last_synced_at: z.string().datetime({ offset: true }).nullable().optional(),
});
export type FreshnessReport = z.infer<typeof FreshnessReport>;

export const ReconciliationException = z.object({
  exception_id: z.string(),
  customer_id: z.string(),
  customer_name: z.string().nullable().optional(),
  exception_type: z.enum([
    "usage_not_invoiced",
    "invoice_no_usage",
    "contract_mismatch",
    "discount_mismatch",
    "recognition_lag",
    "cash_not_collected",
  ]),
  severity: z.enum(["info", "warning", "critical"]),
  period_start: z.string(),
  period_end: z.string(),
  amount_usd: z.coerce.number(),
  detected_at: z.string().datetime({ offset: true }).nullable().optional(),
  resolved_at: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type ReconciliationException = z.infer<typeof ReconciliationException>;

export const Warning = z.object({
  code: z.string(),
  message: z.string(),
  detail: z.record(z.string(), z.unknown()).default({}),
});
export type Warning = z.infer<typeof Warning>;

export const VultrEnvelope = z.object({
  env_id: z.string(),
  as_of: z.string().datetime({ offset: true }),
  freshness: FreshnessReport,
  metric_blocks: z.array(MetricBlock).default([]),
  data: z.record(z.string(), z.unknown()).default({}),
  exceptions: z.array(ReconciliationException).default([]),
  warnings: z.array(Warning).default([]),
});
export type VultrEnvelope = z.infer<typeof VultrEnvelope>;

// ── Reconciliation bridge ─────────────────────────────────────────────

export const BridgeStage = z.object({
  stage_key: z.enum([
    "platform_usage",
    "rated_billing",
    "issued_invoices",
    "recognized_revenue",
    "collected_cash",
    "contract_committed",
  ]),
  label: z.string(),
  amount_usd: z.coerce.number().nullable(),
  delta_from_previous_usd: z.coerce.number().nullable(),
  null_reason: z.string().nullable().optional(),
  source_system: z.string(),
  record_count: z.number().int().nullable().optional(),
});
export type BridgeStage = z.infer<typeof BridgeStage>;

export const ReconciliationBridgeOut = z.object({
  period_start: z.string(),
  period_end: z.string(),
  stages: z.array(BridgeStage),
  exceptions_total_usd: z.coerce.number(),
  exceptions_count: z.number().int(),
});
export type ReconciliationBridgeOut = z.infer<typeof ReconciliationBridgeOut>;

// ── GPU command graph ─────────────────────────────────────────────────

export const GpuRegionNode = z.object({
  region_key: z.string(),
  region_name: z.string(),
  available_gpu_hours: z.coerce.number(),
  utilized_gpu_hours: z.coerce.number(),
  utilization_pct: z.coerce.number().nullable(),
  capacity_risk: z.enum(["low", "medium", "high", "critical"]),
  exhaustion_forecast_days: z.number().int().nullable().optional(),
  exhaustion_null_reason: z.string().nullable().optional(),
});
export type GpuRegionNode = z.infer<typeof GpuRegionNode>;

export const GpuSkuNode = z.object({
  sku_key: z.string(),
  gpu_model: z.string().nullable(),
  utilized_gpu_hours: z.coerce.number(),
  realized_price_per_hour_usd: z.coerce.number().nullable(),
  cost_per_hour_usd: z.coerce.number().nullable(),
  gross_margin_per_hour_usd: z.coerce.number().nullable(),
  margin_null_reason: z.string().nullable().optional(),
});
export type GpuSkuNode = z.infer<typeof GpuSkuNode>;

export const GpuCustomerNode = z.object({
  customer_id: z.string(),
  name: z.string(),
  segment: z.string().nullable(),
  consumed_gpu_hours: z.coerce.number(),
  concentration_pct: z.coerce.number().nullable(),
});
export type GpuCustomerNode = z.infer<typeof GpuCustomerNode>;

export const GpuFlow = z.object({
  from: z.string(),
  to: z.string(),
  weight: z.coerce.number(),
  metric: z.enum(["utilized_gpu_hours", "revenue_usd", "margin_usd", "risk_score"]),
});
export type GpuFlow = z.infer<typeof GpuFlow>;

export const GpuTimePoint = z.object({
  ts: z.string(),
  utilization_pct: z.coerce.number().nullable(),
  realized_margin_per_hour_usd: z.coerce.number().nullable(),
});
export type GpuTimePoint = z.infer<typeof GpuTimePoint>;

export const GpuCommandGraphFilters = z.object({
  period: MetricPeriod.default("30D"),
  region: z.string().nullable(),
  sku: z.string().nullable(),
  segment: z.string().nullable(),
  metric: z.enum(["utilization", "revenue", "margin", "risk"]).default("utilization"),
});
export type GpuCommandGraphFilters = z.infer<typeof GpuCommandGraphFilters>;

export const GpuCommandGraphOut = z.object({
  env_id: z.string(),
  as_of: z.string().datetime({ offset: true }),
  filters: GpuCommandGraphFilters,
  kpis: z.array(MetricBlock),
  regions: z.array(GpuRegionNode),
  sku_nodes: z.array(GpuSkuNode),
  customer_nodes: z.array(GpuCustomerNode),
  flows: z.array(GpuFlow),
  time_series: z.array(GpuTimePoint),
  exceptions: z.array(ReconciliationException),
  freshness: FreshnessReport,
});
export type GpuCommandGraphOut = z.infer<typeof GpuCommandGraphOut>;

// ── Customer 360 ──────────────────────────────────────────────────────

export const CustomerSummary = z.object({
  customer_id: z.string(),
  display_name: z.string(),
  segment: z.string().nullable(),
  contract_type: z.string().nullable(),
  account_status: z.string().nullable(),
  support_tier: z.string().nullable(),
  signup_date: z.string().nullable(),
  country: z.string().nullable(),
  salesforce_owner_id: z.string().nullable(),
  risk_flags: z.array(z.string()).default([]),
  mtd_usage_revenue_usd: z.coerce.number().nullable(),
  mtd_recognized_revenue_usd: z.coerce.number().nullable(),
  outstanding_ar_usd: z.coerce.number().nullable(),
  open_tickets: z.number().int(),
  churn_risk_score: z.coerce.number().nullable(),
});
export type CustomerSummary = z.infer<typeof CustomerSummary>;

export const CustomerDetailOut = z.object({
  customer: CustomerSummary,
  contract: z.record(z.string(), z.unknown()).nullable().optional(),
  daily_snapshots: z.array(z.record(z.string(), z.unknown())).default([]),
  recent_invoices: z.array(z.record(z.string(), z.unknown())).default([]),
  recent_payments: z.array(z.record(z.string(), z.unknown())).default([]),
  open_exceptions: z.array(ReconciliationException).default([]),
});
export type CustomerDetailOut = z.infer<typeof CustomerDetailOut>;

// ── Domain context ────────────────────────────────────────────────────

export const VultrContext = z.object({
  env_id: z.string(),
  business_id: z.string(),
  created: z.boolean(),
  source: z.string(),
  diagnostics: z.record(z.string(), z.unknown()).default({}),
});
export type VultrContext = z.infer<typeof VultrContext>;

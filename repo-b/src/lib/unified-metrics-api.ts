/**
 * Unified Metrics API client.
 *
 * All metric KPI queries (UI + AI) route through this client to ensure
 * consistent values across the entire platform. Uses the /bos proxy
 * to reach POST /api/metrics/v2/query on the FastAPI backend.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface UnifiedMetricQueryRequest {
  business_id: string;
  env_id?: string;
  metric_keys: string[];
  entity_type?: string;
  entity_ids?: string[];
  quarter?: string;
  date_from?: string;
  date_to?: string;
  dimension?: string;
  scenario_id?: string;
  limit?: number;
}

export interface MetricResultItem {
  metric_key: string;
  display_name: string;
  metric_family: string | null;
  value: string | null;
  unit: string;
  format_hint: string | null;
  polarity: string;
  dimension_value?: string | null;
  entity_id?: string | null;
  entity_name?: string | null;
  quarter?: string | null;
  source: string;
  query_hash?: string | null;
  latency_ms?: number | null;
}

export interface UnifiedMetricQueryResponse {
  results: MetricResultItem[];
  query_hash: string;
  total_latency_ms: number;
  strategy_latencies: Record<string, number>;
  resolved_count: number;
  unresolved_keys: string[];
}

export interface MetricCatalogEntry {
  metric_key: string;
  display_name: string;
  description: string | null;
  aliases: string[];
  metric_family: string | null;
  query_strategy: string;
  template_key: string | null;
  unit: string;
  aggregation: string;
  format_hint_fe: string | null;
  polarity: string;
  entity_key: string | null;
  allowed_breakouts: string[];
  time_behavior: string;
}

// ── API functions ─────────────────────────────────────────────────────

export async function queryUnifiedMetrics(
  body: UnifiedMetricQueryRequest,
): Promise<UnifiedMetricQueryResponse> {
  const res = await fetch("/bos/api/metrics/v2/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Unified metrics query failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function fetchMetricCatalog(
  businessId: string,
): Promise<MetricCatalogEntry[]> {
  const res = await fetch(
    `/bos/api/metrics/v2/catalog?business_id=${encodeURIComponent(businessId)}`,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Metric catalog fetch failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Convert a MetricResultItem value to a number, or null if missing. */
export function metricValueAsNumber(item: MetricResultItem): number | null {
  if (item.value == null) return null;
  const n = Number(item.value);
  return Number.isFinite(n) ? n : null;
}

/** Group results by metric_key for easy lookup. */
export function groupByMetricKey(
  results: MetricResultItem[],
): Record<string, MetricResultItem[]> {
  const map: Record<string, MetricResultItem[]> = {};
  for (const r of results) {
    (map[r.metric_key] ??= []).push(r);
  }
  return map;
}

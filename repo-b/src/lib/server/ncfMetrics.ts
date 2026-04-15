import "server-only";
import { getPool } from "@/lib/server/db";
import type { ReportingLens } from "@/app/lab/env/[envId]/ncf/executive/fixture";

export type NCFLiveMetric = {
  metric_key: string;
  value_numeric: number | null;
  value_text: string | null;
  period_start: string | null;
  period_end: string | null;
  reporting_lens: ReportingLens;
  source_table: string;
  source_query_hash: string | null;
  owner_role: string | null;
  lineage_notes: string[];
  refreshed_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadNCFLiveMetrics(
  envIdParam: string
): Promise<Record<string, NCFLiveMetric>> {
  if (!envIdParam || !UUID_RE.test(envIdParam)) return {};

  const pool = getPool();
  if (!pool) return {};

  try {
    const res = await pool.query<{
      metric_key: string;
      value_numeric: string | null;
      value_text: string | null;
      period_start: Date | null;
      period_end: Date | null;
      reporting_lens: ReportingLens;
      source_table: string;
      source_query_hash: string | null;
      owner_role: string | null;
      lineage_notes: unknown;
      refreshed_at: Date;
    }>(
      `
        SELECT
          metric_key,
          value_numeric::text AS value_numeric,
          value_text,
          period_start,
          period_end,
          reporting_lens,
          source_table,
          source_query_hash,
          owner_role,
          lineage_notes,
          refreshed_at
        FROM ncf_metric
        WHERE env_id = $1::uuid
        ORDER BY refreshed_at DESC
      `,
      [envIdParam]
    );

    const out: Record<string, NCFLiveMetric> = {};
    for (const row of res.rows) {
      if (out[row.metric_key]) continue;
      const lineageNotes = Array.isArray(row.lineage_notes)
        ? (row.lineage_notes as unknown[]).filter(
            (n): n is string => typeof n === "string"
          )
        : [];
      out[row.metric_key] = {
        metric_key: row.metric_key,
        value_numeric:
          row.value_numeric == null ? null : Number(row.value_numeric),
        value_text: row.value_text,
        period_start: row.period_start
          ? row.period_start.toISOString().slice(0, 10)
          : null,
        period_end: row.period_end
          ? row.period_end.toISOString().slice(0, 10)
          : null,
        reporting_lens: row.reporting_lens,
        source_table: row.source_table,
        source_query_hash: row.source_query_hash,
        owner_role: row.owner_role,
        lineage_notes: lineageNotes,
        refreshed_at: row.refreshed_at.toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  getOperatorBudgetDrift,
  OperatorBudgetDriftBoard,
  OperatorBudgetDriftRow,
} from "@/lib/bos-api";

const SEVERITY_TONE: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/15 text-red-400",
  elevated: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  stable: "border-bm-border/50 bg-white/5 text-bm-muted2",
};

function fmtCost(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

function Sparkline({
  points,
  severity,
}: {
  points: number[];
  severity: string | null | undefined;
}) {
  if (!points || points.length < 2) return <span className="text-bm-muted2">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 80;
  const height = 24;
  const step = width / (points.length - 1);
  const pathPoints = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke =
    severity === "critical" ? "#f87171" : severity === "elevated" ? "#fcd34d" : "#94a3b8";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        points={pathPoints.join(" ")}
      />
    </svg>
  );
}

export function BudgetDriftWatch() {
  const { envId, businessId } = useDomainEnv();
  const [board, setBoard] = useState<OperatorBudgetDriftBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOperatorBudgetDrift(envId, businessId || undefined);
        if (!cancelled) setBoard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load budget drift.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envId, businessId]);

  if (loading) {
    return <p className="text-sm text-bm-muted2">Loading budget drift…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }
  if (!board || board.rows.length === 0) {
    return <p className="text-sm text-bm-muted2">No budget drift data available.</p>;
  }

  const { totals } = board;
  const firstCritical = board.rows.find((r) => r.drift_severity === "critical");

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div
        className="rounded-2xl border border-bm-border/60 bg-black/30 p-4"
        data-testid="budget-drift-headline"
      >
        <p className="text-sm text-bm-text">
          {totals.critical_count > 0 ? (
            <>
              <span className="font-semibold text-red-400">
                {totals.critical_count} project{totals.critical_count === 1 ? "" : "s"}
              </span>{" "}
              drifting critically ·{" "}
              <span className="font-semibold text-bm-text">
                {fmtCost(totals.total_forecast_overrun_usd)}
              </span>{" "}
              forecast overrun across the watchlist
              {firstCritical?.days_to_next_threshold != null && (
                <>
                  {" "}· <span className="text-red-400">
                    {firstCritical.days_to_next_threshold}d
                  </span>{" "}
                  to next threshold on {firstCritical.project_name}
                </>
              )}
            </>
          ) : (
            <>No projects currently drifting at critical severity.</>
          )}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Projects tracked" value={totals.project_count.toString()} />
        <KpiTile
          label="Critical drift"
          value={totals.critical_count.toString()}
          tone={totals.critical_count > 0 ? "warn" : undefined}
        />
        <KpiTile label="Watchlist" value={totals.watchlist_count.toString()} />
        <KpiTile
          label="Forecast overrun"
          value={fmtCost(totals.total_forecast_overrun_usd)}
          tone={totals.total_forecast_overrun_usd > 0 ? "warn" : undefined}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-bm-border/60">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/60 bg-black/40 text-left text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Current drift</th>
              <th className="px-3 py-2">30d trend</th>
              <th className="px-3 py-2">Spark</th>
              <th className="px-3 py-2">Forecast final</th>
              <th className="px-3 py-2">Forecast overrun</th>
              <th className="px-3 py-2">Severity</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r) => (
              <DriftRow key={r.project_id} row={r} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Critical detail — if any */}
      {firstCritical && firstCritical.impact?.if_ignored?.in_30_days && (
        <div
          data-testid="drift-if-ignored"
          className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-400">
                If ignored 30d — {firstCritical.project_name}
              </p>
              <p className="mt-1 text-sm text-bm-text">
                +{fmtCost(firstCritical.impact.if_ignored.in_30_days.estimated_cost_usd)} ·{" "}
                +{firstCritical.impact.if_ignored.in_30_days.estimated_delay_days}d
              </p>
              {firstCritical.impact.if_ignored.in_30_days.secondary_effects?.length ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-bm-muted2">
                  {firstCritical.impact.if_ignored.in_30_days.secondary_effects.map((eff, i) => (
                    <li key={i}>{eff}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            {firstCritical.next_threshold_label && (
              <div className="rounded-xl border border-red-500/30 bg-black/20 p-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Next threshold</p>
                <p className="mt-0.5 text-xs text-red-300">{firstCritical.next_threshold_label}</p>
              </div>
            )}
          </div>
          {firstCritical.key_driver && (
            <p className="mt-3 text-xs text-bm-muted2">Driver: {firstCritical.key_driver}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DriftRow({ row }: { row: OperatorBudgetDriftRow }) {
  const severity = row.drift_severity ?? "stable";
  const trendTone =
    row.drift_trend_30d_pct != null && row.drift_trend_30d_pct > 2
      ? "text-red-400"
      : row.drift_trend_30d_pct != null && row.drift_trend_30d_pct > 0
        ? "text-amber-300"
        : "text-bm-muted2";
  return (
    <tr className="border-b border-bm-border/40 last:border-b-0 align-top">
      <td className="px-3 py-2">
        <Link
          href={row.href ?? "#"}
          className="font-medium text-bm-text hover:underline"
        >
          {row.project_name}
        </Link>
        {row.entity_name && <div className="text-xs text-bm-muted2">{row.entity_name}</div>}
        {row.key_driver && (
          <div className="mt-1 text-[11px] text-bm-muted2 line-clamp-2">{row.key_driver}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          data-testid={`drift-current-${row.project_id}`}
          className={`font-medium ${row.current_drift_pct != null && row.current_drift_pct > 5 ? "text-red-400" : "text-bm-text"}`}
        >
          {fmtPct(row.current_drift_pct)}
        </span>
      </td>
      <td className={`px-3 py-2 ${trendTone}`}>{fmtPct(row.drift_trend_30d_pct)}</td>
      <td className="px-3 py-2">
        <Sparkline points={row.trend_points_pct} severity={row.drift_severity} />
      </td>
      <td className="px-3 py-2 text-bm-text">{fmtPct(row.forecast_final_drift_pct)}</td>
      <td className="px-3 py-2 text-bm-text">{fmtCost(row.forecast_cost_overrun_usd)}</td>
      <td className="px-3 py-2">
        <span
          data-testid={`drift-severity-${row.project_id}`}
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${SEVERITY_TONE[severity]}`}
        >
          {severity}
        </span>
      </td>
    </tr>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        tone === "warn"
          ? "border-red-500/30 bg-red-500/10"
          : "border-bm-border/60 bg-black/25"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "warn" ? "text-red-400" : "text-bm-text"}`}>
        {value}
      </p>
    </div>
  );
}

export default BudgetDriftWatch;

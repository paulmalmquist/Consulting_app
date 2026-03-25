"use client";

/**
 * BtcSpxCorrelationChart
 *
 * Displays the 30-day rolling Pearson correlation between BTC-USD and ^GSPC
 * daily log returns as a line chart with zero-crossing markers.
 *
 * Props:
 *   tenantId?  — filter to a specific tenant's data
 *   days?      — look-back window in calendar days (default 180)
 *   compact?   — true = badge only; false = full chart with history (default)
 *
 * Cross-vertical hooks (additive context, read-only):
 *   - Recoupling badge feeds credit decisioning advisory for crypto collateral
 *   - Correlation value available to RegimeClassifierWidget crypto signal row
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bosFetch } from "@/lib/bos-api";

// ── Types ─────────────────────────────────────────────────────────────────────

type CorrelationSeriesPoint = {
  calculated_date: string;
  correlation_30d: number;
  zero_crossing: boolean;
  crossing_direction: string | null;
  data_points_used: number;
};

type CorrelationHistory = {
  series: CorrelationSeriesPoint[];
  latest_correlation: number;
  regime_signal: string;
  total_rows: number;
};

type LatestCorrelation = {
  correlation_id: string | null;
  calculated_date: string | null;
  correlation_30d: number;
  btc_return_30d: number | null;
  spx_return_30d: number | null;
  zero_crossing: boolean;
  crossing_direction: string | null;
  data_points_used: number;
  metadata: Record<string, unknown>;
};

export interface BtcSpxCorrelationChartProps {
  tenantId?: string;
  days?: number;
  compact?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtCorr(v: number): string {
  return v >= 0 ? `+${v.toFixed(3)}` : v.toFixed(3);
}

function corrToColor(r: number): string {
  // Green = decoupled (negative), Red = recoupled/correlated (positive), grey = neutral
  if (r > 0.15) return "#ef4444";   // correlated — risk-asset behavior
  if (r < -0.15) return "#22c55e";  // decoupled — store of value
  return "#9ca3af";                  // neutral band
}

function corrToBgClass(r: number): string {
  if (r > 0.15) return "bg-red-100 text-red-800";
  if (r < -0.15) return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-700";
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CorrelationTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const r = payload[0].value;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-gray-800">{label}</p>
      <p className="mt-0.5">
        <span className="text-gray-500">Correlation (30d): </span>
        <span className="font-mono font-semibold" style={{ color: corrToColor(r) }}>
          {fmtCorr(r)}
        </span>
      </p>
      {r > 0.15 && (
        <p className="mt-0.5 text-red-600">⚠ BTC recoupled — risk-asset behavior</p>
      )}
      {r < -0.15 && (
        <p className="mt-0.5 text-green-600">✓ BTC decoupled — uncorrelated zone</p>
      )}
    </div>
  );
}

// ── Compact badge variant ─────────────────────────────────────────────────────

function CorrelationBadge({
  latest,
}: {
  latest: LatestCorrelation | null;
}) {
  const r = latest?.correlation_30d ?? 0;
  const signal =
    (latest?.metadata?.regime_signal as string) ??
    (r > 0.15 ? "Recoupling" : r < -0.15 ? "Decoupled" : "Neutral");
  const badgeClass = corrToBgClass(r);

  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
      <span className="font-mono">{fmtCorr(r)}</span>
      <span className="font-normal opacity-80">{signal}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BtcSpxCorrelationChart({
  tenantId,
  days = 180,
  compact = false,
}: BtcSpxCorrelationChartProps) {
  const [latest, setLatest] = useState<LatestCorrelation | null>(null);
  const [history, setHistory] = useState<CorrelationHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePoint, setActivePoint] = useState<CorrelationSeriesPoint | null>(null);

  const tenantParam = tenantId ? `&tenant_id=${tenantId}` : "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [latestRes, histRes] = await Promise.all([
        bosFetch<LatestCorrelation>(
          `/api/v1/market/correlation/btc-spx/latest${tenantId ? `?tenant_id=${tenantId}` : ""}`
        ),
        compact
          ? Promise.resolve(null)
          : bosFetch<CorrelationHistory>(
              `/api/v1/market/correlation/btc-spx?days=${days}${tenantParam}`
            ),
      ]);
      setLatest(latestRes);
      setHistory(histRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load correlation data");
    } finally {
      setLoading(false);
    }
  }, [tenantId, days, compact, tenantParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    if (compact) return <div className="h-7 w-32 animate-pulse rounded-full bg-gray-200" />;
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-6">
        <div className="space-y-3">
          <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-40 w-full animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        <span className="font-medium">BTC-SPX correlation:</span> {error}
      </div>
    );
  }

  // ── Compact mode ──────────────────────────────────────────────────────────
  if (compact) {
    return <CorrelationBadge latest={latest} />;
  }

  // ── Full chart mode ───────────────────────────────────────────────────────
  const r = latest?.correlation_30d ?? 0;
  const regimeSignal = history?.regime_signal ?? (latest?.metadata?.regime_signal as string) ?? "—";
  const seriesData = (history?.series ?? []).slice().reverse(); // oldest → newest for chart

  // Find zero-crossing dates for reference lines
  const crossingDates = seriesData
    .filter((p) => p.zero_crossing)
    .map((p) => ({ date: fmtDate(p.calculated_date), direction: p.crossing_direction }));

  return (
    <div className="rounded-xl border border-gray-100 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            BTC-SPX 30-Day Rolling Correlation
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Pearson r between BTC-USD and S&amp;P 500 daily log returns
          </p>
        </div>
        <CorrelationBadge latest={latest} />
      </div>

      {/* Regime signal line */}
      <div className="px-6 pb-3">
        <p className="text-xs text-gray-600">
          <span className="font-medium">Signal: </span>
          {regimeSignal}
        </p>
      </div>

      {/* Chart */}
      <div className="px-4 pb-4">
        {seriesData.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400">
            No correlation data yet. Run the fin-btc-spx-correlation task to populate.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart
              data={seriesData.map((p) => ({
                date: fmtDate(p.calculated_date),
                r: p.correlation_30d,
                zeroCrossing: p.zero_crossing,
                direction: p.crossing_direction,
              }))}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              onMouseLeave={() => setActivePoint(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[-1, 1]}
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip content={<CorrelationTooltip />} />

              {/* Zero line — the key threshold */}
              <ReferenceLine
                y={0}
                stroke="#6b7280"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: "0", position: "right", fontSize: 10, fill: "#6b7280" }}
              />

              {/* Neutral band reference lines */}
              <ReferenceLine y={0.15}  stroke="#ef4444" strokeDasharray="2 4" strokeWidth={1} strokeOpacity={0.4} />
              <ReferenceLine y={-0.15} stroke="#22c55e" strokeDasharray="2 4" strokeWidth={1} strokeOpacity={0.4} />

              {/* Correlation line — color shifts based on current regime */}
              <Line
                type="monotone"
                dataKey="r"
                stroke={corrToColor(r)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: corrToColor(r), strokeWidth: 2 }}
                name="30d Correlation"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Zero-crossing event log */}
      {crossingDates.length > 0 && (
        <div className="border-t border-gray-50 px-6 py-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Recent Crossing Events</p>
          <div className="flex flex-wrap gap-2">
            {crossingDates.slice(0, 5).map((c, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                  c.direction === "recoupling"
                    ? "bg-red-50 text-red-700"
                    : "bg-green-50 text-green-700"
                }`}
              >
                {c.direction === "recoupling" ? "↑ Recoupling" : "↓ Decoupling"}
                <span className="opacity-60">{c.date}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats footer */}
      {latest && (
        <div className="border-t border-gray-50 px-6 py-3 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-400">Current r</p>
            <p
              className="text-sm font-mono font-semibold mt-0.5"
              style={{ color: corrToColor(r) }}
            >
              {fmtCorr(r)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">BTC 30d Return</p>
            <p className="text-sm font-mono font-semibold mt-0.5 text-gray-700">
              {latest.btc_return_30d !== null && latest.btc_return_30d !== undefined
                ? `${(latest.btc_return_30d * 100).toFixed(1)}%`
                : "—"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">SPX 30d Return</p>
            <p className="text-sm font-mono font-semibold mt-0.5 text-gray-700">
              {latest.spx_return_30d !== null && latest.spx_return_30d !== undefined
                ? `${(latest.spx_return_30d * 100).toFixed(1)}%`
                : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Cross-vertical credit hook (additive advisory, read-only context) */}
      {r > 0.15 && (
        <div className="border-t border-orange-100 bg-orange-50 px-6 py-2 rounded-b-xl">
          <p className="text-xs text-orange-700">
            <span className="font-medium">💳 Credit advisory: </span>
            BTC correlation to equities elevated (r={fmtCorr(r)}) — apply conservative
            crypto collateral haircut for any crypto-collateralized loan evaluation.
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * RegimeClassifierWidget
 *
 * Displays the current multi-asset market regime label and optionally
 * the full signal breakdown, 90-day history timeline, and cross-vertical
 * implications panel.
 *
 * Props:
 *   tenantId?  — filter to a specific tenant's regime snapshots
 *   compact?   — true = badge only; false = full breakdown (default)
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { bosFetch } from "@/lib/bos-api";

// ── Types ─────────────────────────────────────────────────────────────────────

type SignalEntry = {
  name: string;
  value: number;
  unit?: string;
  score: number;
};

type AssetClassBreakdown = {
  score: number;
  weight: number;
  signals: SignalEntry[];
};

type RegimeSnapshot = {
  snapshot_id: string | null;
  calculated_at: string | null;
  regime_label: "risk_on" | "risk_off" | "transitional" | "stress";
  confidence: number;
  signal_breakdown: Record<string, AssetClassBreakdown>;
  cross_vertical_implications: Record<string, string>;
  source_metrics: Record<string, unknown>;
};

type RegimeHistoryEntry = {
  calculated_at: string;
  regime_label: string;
  confidence: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const REGIME_META: Record<
  string,
  { label: string; color: string; bgClass: string; textClass: string; description: string }
> = {
  risk_on: {
    label: "Risk-On",
    color: "#22c55e",
    bgClass: "bg-green-100",
    textClass: "text-green-800",
    description: "Positive momentum across equities, credit, and crypto. Normal underwriting conditions.",
  },
  transitional: {
    label: "Transitional",
    color: "#f59e0b",
    bgClass: "bg-amber-100",
    textClass: "text-amber-800",
    description: "Mixed signals. Monitor closely. Apply conservative assumptions.",
  },
  risk_off: {
    label: "Risk-Off",
    color: "#f97316",
    bgClass: "bg-orange-100",
    textClass: "text-orange-800",
    description: "Deteriorating conditions. Tighten underwriting. Stress-test assumptions.",
  },
  stress: {
    label: "Market Stress",
    color: "#ef4444",
    bgClass: "bg-red-100",
    textClass: "text-red-800",
    description: "Significant stress conditions. Defensive posture across all verticals.",
  },
};

const ASSET_CLASS_COLORS: Record<string, string> = {
  equities: "#6366f1",
  rates: "#06b6d4",
  credit: "#10b981",
  crypto: "#f59e0b",
};

const CROSS_VERTICAL_META: Record<string, { icon: string; label: string }> = {
  repe: { icon: "🏢", label: "REPE" },
  credit: { icon: "💳", label: "Credit" },
  pds: { icon: "🏗️", label: "PDS" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function scoreToColor(score: number): string {
  if (score >= 0.65) return "#22c55e";
  if (score >= 0.50) return "#f59e0b";
  if (score >= 0.35) return "#f97316";
  return "#ef4444";
}

// ── Compact badge variant ─────────────────────────────────────────────────────

function RegimeBadgeCompact({ snapshot }: { snapshot: RegimeSnapshot | null }) {
  const meta = REGIME_META[snapshot?.regime_label ?? "transitional"] ?? REGIME_META.transitional;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${meta.bgClass} ${meta.textClass}`}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
      {snapshot && (
        <span className="ml-1 font-normal opacity-70">
          {fmtPct(snapshot.confidence)} confidence
        </span>
      )}
    </span>
  );
}

// ── Full widget ───────────────────────────────────────────────────────────────

function SignalBarRow({ name, score }: { name: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs text-gray-500 truncate">{name}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${(score * 100).toFixed(1)}%`, backgroundColor: scoreToColor(score) }}
        />
      </div>
      <span className="w-10 text-right text-xs font-mono text-gray-600">{score.toFixed(2)}</span>
    </div>
  );
}

export interface RegimeClassifierWidgetProps {
  tenantId?: string;
  compact?: boolean;
}

export function RegimeClassifierWidget({
  tenantId,
  compact = false,
}: RegimeClassifierWidgetProps) {
  const [snapshot, setSnapshot] = useState<RegimeSnapshot | null>(null);
  const [history, setHistory] = useState<RegimeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const latestParams = tenantId ? `?tenant_id=${tenantId}` : "";
      const [latestRes, histRes] = await Promise.all([
        bosFetch<RegimeSnapshot>(`/api/v1/market/regime/latest${latestParams}`),
        compact
          ? Promise.resolve({ snapshots: [] as RegimeHistoryEntry[] })
          : bosFetch<{ snapshots: RegimeHistoryEntry[] }>(
              `/api/v1/market/regime/history?days=90${tenantId ? `&tenant_id=${tenantId}` : ""}`
            ),
      ]);
      setSnapshot(latestRes);
      setHistory((histRes as { snapshots: RegimeHistoryEntry[] }).snapshots ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load regime data");
    } finally {
      setLoading(false);
    }
  }, [tenantId, compact]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Compact mode ─────────────────────────────────────────────────────────
  if (compact) {
    if (loading) {
      return (
        <div className="h-7 w-28 animate-pulse rounded-full bg-gray-200" />
      );
    }
    return <RegimeBadgeCompact snapshot={snapshot} />;
  }

  // ── Full mode ─────────────────────────────────────────────────────────────
  const meta = REGIME_META[snapshot?.regime_label ?? "transitional"] ?? REGIME_META.transitional;
  const breakdown = snapshot?.signal_breakdown ?? {};
  const crossVertical = snapshot?.cross_vertical_implications ?? {};

  const historyChartData = [...history]
    .reverse()
    .map((h) => ({
      date: h.calculated_at.slice(5, 10), // MM-DD
      confidence: h.confidence,
      regime: h.regime_label,
    }));

  return (
    <div className="space-y-5">
      {/* Regime Header */}
      <div
        className="rounded-xl border p-5 shadow-sm"
        style={{ borderColor: meta.color + "40", backgroundColor: meta.color + "0a" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">
              Current Market Regime
            </p>
            <div className="flex items-center gap-3">
              <h2
                className="text-2xl font-bold"
                style={{ color: meta.color }}
              >
                {meta.label}
              </h2>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-gray-700">
                  {fmtPct(snapshot?.confidence ?? 0)} confidence
                </span>
                <span className="text-xs text-gray-400">
                  As of {fmtDate(snapshot?.calculated_at ?? null)}
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-600">{meta.description}</p>
          </div>
          {loading && (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />
          )}
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}

        {!snapshot?.snapshot_id && !loading && (
          <p className="mt-3 text-sm italic text-gray-400">
            No regime snapshots computed yet. Run the fin-research-sweep scheduled task to generate data.
          </p>
        )}
      </div>

      {/* Signal Breakdown */}
      {Object.keys(breakdown).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Signal Breakdown by Asset Class
          </h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {Object.entries(breakdown).map(([assetClass, data]) => (
              <div key={assetClass}>
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: ASSET_CLASS_COLORS[assetClass] ?? "#6366f1" }}
                  >
                    {assetClass}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      weight: {(data.weight * 100).toFixed(0)}%
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{ color: scoreToColor(data.score) }}
                    >
                      {data.score.toFixed(2)}
                    </span>
                  </div>
                </div>
                {/* Composite bar */}
                <div className="mb-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(data.score * 100).toFixed(1)}%`,
                      backgroundColor: ASSET_CLASS_COLORS[assetClass] ?? "#6366f1",
                    }}
                  />
                </div>
                {/* Individual signal bars */}
                <div className="space-y-1.5">
                  {data.signals.map((sig, i) => (
                    <SignalBarRow key={i} name={sig.name} score={sig.score} />
                  ))}
                  {data.signals.length === 0 && (
                    <p className="text-xs italic text-gray-400">No live signals — awaiting data feed</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 90-Day History Timeline */}
      {historyChartData.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            90-Day Confidence History
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={historyChartData}>
              <defs>
                <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={30} />
              <Tooltip
                formatter={(v, _name, props) => [
                  `${v}% confidence`,
                  props.payload?.regime ?? "regime",
                ]}
              />
              <Area
                type="monotone"
                dataKey="confidence"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#confGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cross-Vertical Implications */}
      {Object.keys(crossVertical).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Cross-Vertical Implications
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Object.entries(crossVertical).map(([key, text]) => {
              const vtMeta = CROSS_VERTICAL_META[key];
              return (
                <div
                  key={key}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <p className="mb-1 text-xs font-semibold text-gray-600">
                    {vtMeta?.icon ?? "🔗"} {vtMeta?.label ?? key.toUpperCase()}
                  </p>
                  <p className="text-xs text-gray-500 leading-relaxed">{text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default RegimeClassifierWidget;

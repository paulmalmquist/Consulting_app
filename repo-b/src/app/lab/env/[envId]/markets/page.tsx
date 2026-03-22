"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { RegimeClassifierWidget } from "@/components/market/RegimeClassifierWidget";

// ─── Types ───────────────────────────────────────────────────────────────────

type MarketSegment = {
  segment_id: string;
  category: "equities" | "crypto" | "derivatives" | "macro";
  subcategory: string;
  segment_name: string;
  tier: number;
  rotation_priority_score: number;
  last_rotated_at: string | null;
  rotation_cadence_days: number;
  is_active: boolean;
  cross_vertical: Record<string, unknown>;
};

type IntelBrief = {
  brief_id: string;
  segment_id: string;
  run_date: string;
  regime_tag: string | null;
  composite_score: number | null;
  key_findings: unknown[];
  cross_vertical_insights: Record<string, unknown>;
};

type FeatureCard = {
  card_id: string;
  segment_id: string | null;
  gap_category: string;
  title: string;
  description: string | null;
  priority_score: number;
  cross_vertical_flag: boolean;
  status: string;
  created_at: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const REGIME_COLORS: Record<string, string> = {
  RISK_ON_MOMENTUM: "#22c55e",
  RISK_ON_BROADENING: "#86efac",
  RISK_OFF_DEFENSIVE: "#f97316",
  RISK_OFF_PANIC: "#ef4444",
  TRANSITION_UP: "#3b82f6",
  TRANSITION_DOWN: "#f59e0b",
  RANGE_BOUND: "#8b5cf6",
};

const CATEGORY_COLORS: Record<string, string> = {
  equities: "#6366f1",
  crypto: "#f59e0b",
  derivatives: "#06b6d4",
  macro: "#10b981",
};

const GAP_COLORS: Record<string, string> = {
  data_source: "#6366f1",
  calculation: "#8b5cf6",
  screening: "#3b82f6",
  visualization: "#06b6d4",
  backtesting: "#10b981",
  risk_model: "#f59e0b",
  alert: "#f97316",
  cross_vertical: "#ef4444",
};

const STATUS_COLORS: Record<string, string> = {
  identified: "#6b7280",
  spec_ready: "#3b82f6",
  in_progress: "#f59e0b",
  shipped: "#22c55e",
  deferred: "#9ca3af",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysAgo(v: string | null | undefined): number | null {
  if (!v) return null;
  return Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
}

function overdueRatio(seg: MarketSegment): number {
  const d = daysAgo(seg.last_rotated_at) ?? 9999;
  return d / seg.rotation_cadence_days;
}

function regimeLabel(tag: string | null): string {
  if (!tag) return "Unknown";
  return tag.replace(/_/g, " ");
}

function scoreColor(score: number | null): string {
  if (score === null) return "#9ca3af";
  if (score >= 7) return "#22c55e";
  if (score >= 4) return "#f59e0b";
  return "#ef4444";
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RegimeBadge({ tag }: { tag: string | null }) {
  const color = tag ? (REGIME_COLORS[tag] ?? "#9ca3af") : "#9ca3af";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {regimeLabel(tag)}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: color ?? "#111827" }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {count !== undefined && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MarketIntelligencePage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId ?? "";

  const [segments, setSegments] = useState<MarketSegment[]>([]);
  const [briefs, setBriefs] = useState<IntelBrief[]>([]);
  const [featureCards, setFeatureCards] = useState<FeatureCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "regime" | "segments" | "briefs" | "pipeline">(
    "overview"
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = getSupabaseBrowserClient();
    if (!sb) {
      setError("Supabase not configured — check environment variables.");
      setLoading(false);
      return;
    }

    try {
      const [segRes, briefRes, cardRes] = await Promise.all([
        sb
          .from("market_segments")
          .select("*")
          .eq("is_active", true)
          .order("rotation_priority_score", { ascending: false }),
        sb
          .from("market_segment_intel_brief")
          .select("brief_id,segment_id,run_date,regime_tag,composite_score,key_findings,cross_vertical_insights")
          .order("run_date", { ascending: false })
          .limit(50),
        sb
          .from("trading_feature_cards")
          .select("card_id,segment_id,gap_category,title,description,priority_score,cross_vertical_flag,status,created_at")
          .order("priority_score", { ascending: false })
          .limit(50),
      ]);

      if (segRes.error) throw segRes.error;
      if (briefRes.error) throw briefRes.error;
      if (cardRes.error) throw cardRes.error;

      setSegments((segRes.data as MarketSegment[]) ?? []);
      setBriefs((briefRes.data as IntelBrief[]) ?? []);
      setFeatureCards((cardRes.data as FeatureCard[]) ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load market data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const latestRegime: string | null = briefs[0]?.regime_tag ?? null;

  const categoryBreakdown = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of segments) {
      counts[s.category] = (counts[s.category] ?? 0) + 1;
    }
    return Object.entries(counts).map(([cat, count]) => ({ cat, count }));
  }, [segments]);

  const scoreHistory = React.useMemo(() => {
    // Group by run_date, compute avg composite_score
    const byDate: Record<string, number[]> = {};
    for (const b of briefs) {
      if (b.composite_score !== null) {
        byDate[b.run_date] = byDate[b.run_date] ?? [];
        byDate[b.run_date].push(b.composite_score);
      }
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, scores]) => ({
        date,
        avg: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
      }));
  }, [briefs]);

  const gapBreakdown = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of featureCards) {
      counts[c.gap_category] = (counts[c.gap_category] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, count]) => ({ cat, count }));
  }, [featureCards]);

  const crossVerticalCount = featureCards.filter((c) => c.cross_vertical_flag).length;
  const overdueSegments = segments.filter((s) => overdueRatio(s) > 1).length;
  const topCard = featureCards[0];
  const latestBrief = briefs[0];

  // ── Render ────────────────────────────────────────────────────────────────

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "regime", label: "Regime Classifier" },
    { id: "segments", label: "Segments" },
    { id: "briefs", label: "Intel Briefs" },
    { id: "pipeline", label: "Feature Pipeline" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Market Intelligence Engine</h1>
            <p className="mt-1 text-sm text-gray-500">
              34 segments · Equities, Crypto, Derivatives, Macro · Daily rotation pipeline
            </p>
          </div>
          <div className="flex items-center gap-3">
            {latestRegime && <RegimeBadge tag={latestRegime} />}
            <button
              onClick={fetchData}
              disabled={loading}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="mx-6 mt-6 grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      )}

      {/* Content */}
      {!loading && (
        <div className="px-6 pt-6 space-y-6">

          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <>
              {/* KPI Strip */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  label="Active Segments"
                  value={segments.length}
                  sub="across 4 categories"
                />
                <StatCard
                  label="Intel Briefs"
                  value={briefs.length}
                  sub={latestBrief ? `Last: ${fmtDate(latestBrief.run_date)}` : "No briefs yet"}
                />
                <StatCard
                  label="Feature Cards"
                  value={featureCards.length}
                  sub={`${crossVerticalCount} cross-vertical`}
                  color="#6366f1"
                />
                <StatCard
                  label="Overdue Rotations"
                  value={overdueSegments}
                  sub="need research sweep"
                  color={overdueSegments > 0 ? "#f97316" : "#22c55e"}
                />
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Composite score trend */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Avg Composite Score — Last 14 Days
                  </h3>
                  {scoreHistory.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No score history yet</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={scoreHistory}>
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => v.slice(5)}
                        />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} width={30} />
                        <Tooltip
                          formatter={(v) => [`${v}`, "Avg Score"]}
                          labelFormatter={(l) => `Date: ${l}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="avg"
                          stroke="#6366f1"
                          strokeWidth={2}
                          fill="url(#scoreGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Segment category breakdown */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Segments by Category
                  </h3>
                  {categoryBreakdown.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No segments loaded</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={categoryBreakdown} barSize={40}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="cat" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} width={25} />
                        <Tooltip formatter={(v) => [`${v} segments`, "Count"]} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {categoryBreakdown.map((entry) => (
                            <Cell
                              key={entry.cat}
                              fill={CATEGORY_COLORS[entry.cat] ?? "#6366f1"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Feature gap breakdown */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-gray-700">
                  Feature Gaps by Category
                </h3>
                {gapBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No feature cards yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={gapBreakdown} layout="vertical" barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="cat"
                        tick={{ fontSize: 12 }}
                        tickFormatter={capFirst}
                        width={120}
                      />
                      <Tooltip formatter={(v) => [`${v} cards`, "Count"]} labelFormatter={capFirst} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {gapBreakdown.map((entry) => (
                          <Cell
                            key={entry.cat}
                            fill={GAP_COLORS[entry.cat] ?? "#6366f1"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Latest intel brief summary */}
              {latestBrief && (
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Latest Intelligence Brief</h3>
                    <span className="text-xs text-gray-400">{fmtDate(latestBrief.run_date)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <RegimeBadge tag={latestBrief.regime_tag} />
                    {latestBrief.composite_score !== null && (
                      <span
                        className="text-lg font-bold"
                        style={{ color: scoreColor(latestBrief.composite_score) }}
                      >
                        {latestBrief.composite_score.toFixed(1)} / 10
                      </span>
                    )}
                  </div>
                  {Array.isArray(latestBrief.key_findings) && latestBrief.key_findings.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {(latestBrief.key_findings as string[]).slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Top feature card */}
              {topCard && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-indigo-400 mb-1">
                        Top Priority Feature
                      </p>
                      <h3 className="text-sm font-bold text-gray-900">{topCard.title}</h3>
                      {topCard.description && (
                        <p className="mt-1 text-sm text-gray-600">{topCard.description}</p>
                      )}
                    </div>
                    <div className="ml-4 text-right shrink-0">
                      <p className="text-xl font-bold text-indigo-600">
                        {topCard.priority_score.toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-400">priority</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: GAP_COLORS[topCard.gap_category] ?? "#6366f1" }}
                    >
                      {capFirst(topCard.gap_category)}
                    </span>
                    {topCard.cross_vertical_flag && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        Cross-vertical
                      </span>
                    )}
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: STATUS_COLORS[topCard.status] ?? "#6b7280" }}
                    >
                      {capFirst(topCard.status)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── REGIME CLASSIFIER TAB ── */}
          {activeTab === "regime" && (
            <div>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900">Multi-Asset Regime Classifier</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Composite regime label derived from equities, rates, credit, and crypto signals.
                  Updates daily at 6:00 AM UTC.
                </p>
              </div>
              <RegimeClassifierWidget compact={false} />
            </div>
          )}

          {/* ── SEGMENTS TAB ── */}
          {activeTab === "segments" && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <SectionHeader title="Active Market Segments" count={segments.length} />
              {segments.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-gray-400 italic">No segments found. Run the fin-research-sweep task to populate.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-3">Segment</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Tier</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3">Last Rotated</th>
                        <th className="px-4 py-3">Cadence</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {segments.map((seg) => {
                        const ratio = overdueRatio(seg);
                        const isOverdue = ratio > 1;
                        return (
                          <tr key={seg.segment_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {seg.segment_name}
                              {seg.cross_vertical && Object.keys(seg.cross_vertical).length > 0 && (
                                <span className="ml-2 rounded-full bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600">
                                  CV
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                style={{ backgroundColor: CATEGORY_COLORS[seg.category] ?? "#6366f1" }}
                              >
                                {seg.category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">T{seg.tier}</td>
                            <td className="px-4 py-3 font-mono text-gray-700">
                              {seg.rotation_priority_score?.toFixed(1) ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{fmtDate(seg.last_rotated_at)}</td>
                            <td className="px-4 py-3 text-gray-500">{seg.rotation_cadence_days}d</td>
                            <td className="px-4 py-3">
                              {isOverdue ? (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                                  Overdue ({ratio.toFixed(1)}×)
                                </span>
                              ) : (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                  Current
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── INTEL BRIEFS TAB ── */}
          {activeTab === "briefs" && (
            <div className="space-y-4">
              <SectionHeader title="Intelligence Briefs" count={briefs.length} />
              {briefs.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400 italic">
                  No intelligence briefs yet. Run the fin-research-sweep task to generate briefs.
                </div>
              ) : (
                briefs.map((b) => (
                  <div
                    key={b.brief_id}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-mono text-gray-400">{b.segment_id}</span>
                          <RegimeBadge tag={b.regime_tag} />
                          {b.composite_score !== null && (
                            <span
                              className="text-sm font-bold"
                              style={{ color: scoreColor(b.composite_score) }}
                            >
                              {b.composite_score.toFixed(1)} / 10
                            </span>
                          )}
                        </div>
                        {Array.isArray(b.key_findings) && b.key_findings.length > 0 && (
                          <ul className="mt-3 space-y-1">
                            {(b.key_findings as string[]).slice(0, 3).map((f, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                        {b.cross_vertical_insights &&
                          Object.keys(b.cross_vertical_insights).length > 0 && (
                            <div className="mt-3 rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
                              <p className="text-xs font-semibold text-orange-700 mb-1">
                                Cross-vertical insights
                              </p>
                              {Object.entries(b.cross_vertical_insights)
                                .slice(0, 2)
                                .map(([k, v]) => (
                                  <p key={k} className="text-xs text-orange-600">
                                    <span className="font-medium capitalize">{k}:</span>{" "}
                                    {String(v)}
                                  </p>
                                ))}
                            </div>
                          )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-gray-400">{fmtDate(b.run_date)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── FEATURE PIPELINE TAB ── */}
          {activeTab === "pipeline" && (
            <div className="space-y-4">
              <SectionHeader title="Feature Pipeline" count={featureCards.length} />
              {featureCards.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400 italic">
                  No feature cards yet. Run the fin-gap-detection task to generate feature cards.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Gap Type</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Flags</th>
                        <th className="px-4 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {featureCards.map((card) => (
                        <tr key={card.card_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900 max-w-xs truncate" title={card.title}>
                              {card.title}
                            </p>
                            {card.description && (
                              <p className="text-xs text-gray-400 truncate max-w-xs" title={card.description}>
                                {card.description}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                              style={{ backgroundColor: GAP_COLORS[card.gap_category] ?? "#6366f1" }}
                            >
                              {capFirst(card.gap_category)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold" style={{ color: scoreColor(card.priority_score) }}>
                            {card.priority_score.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                              style={{ backgroundColor: STATUS_COLORS[card.status] ?? "#6b7280" }}
                            >
                              {capFirst(card.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {card.cross_vertical_flag && (
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                                CV
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {fmtDate(card.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

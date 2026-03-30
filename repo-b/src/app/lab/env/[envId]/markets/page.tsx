"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getStoredThemeMode, type ThemeMode } from "@/lib/theme";
import { useParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { NewPositionModal } from "@/components/trading/NewPositionModal";
import { ClosePositionModal } from "@/components/trading/ClosePositionModal";
import { EditPositionModal } from "@/components/trading/EditPositionModal";
import { CommandCenterLayout } from "@/components/market/CommandCenterLayout";
import { DecisionEngineSidebar } from "@/components/market/DecisionEngineSidebar";
import type { DecisionTab, AssetScope } from "@/lib/trading-lab/decision-engine-types";
import type {
  TradingHypothesis,
  TradingPosition,
  TradingPerformanceSnapshot,
  TradingResearchNote,
} from "@/lib/trading-lab/types";

/* ── Theme tokens ─────────────────────────────────────────────────── */

function buildTheme(mode: ThemeMode) {
  const dark = mode === "dark";
  return {
    // Page
    pageBg: dark ? "bg-gray-900" : "bg-gray-50",
    pageText: dark ? "text-gray-100" : "text-gray-900",

    // Cards / surfaces
    cardBg: dark ? "bg-gray-800" : "bg-white",
    cardBorder: dark ? "border-gray-700" : "border-gray-200",
    cardHover: dark ? "hover:bg-gray-700/30" : "hover:bg-gray-50",

    // Header bar
    headerBg: dark ? "bg-gray-900" : "bg-white",
    headerBorder: dark ? "border-gray-800" : "border-gray-200",
    statBarBg: dark ? "bg-gray-800/50" : "bg-gray-100",

    // Text hierarchy
    textPrimary: dark ? "text-gray-100" : "text-gray-900",
    textSecondary: dark ? "text-gray-300" : "text-gray-600",
    textMuted: dark ? "text-gray-400" : "text-gray-500",
    textFaint: dark ? "text-gray-500" : "text-gray-400",

    // Accent
    accent: dark ? "text-green-400" : "text-green-600",
    accentBold: dark ? "text-green-400" : "text-green-700",
    accentBlue: dark ? "text-blue-300" : "text-blue-600",

    // Tabs
    tabActive: dark ? "border-green-400 text-green-400" : "border-green-600 text-green-700",
    tabInactive: dark ? "border-transparent text-gray-500 hover:text-gray-300" : "border-transparent text-gray-400 hover:text-gray-700",
    tabBg: dark ? "bg-gray-900" : "bg-white",

    // Badges
    badgeBullish: dark ? "bg-green-900 text-green-300" : "bg-green-100 text-green-700",
    badgeBearish: dark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-700",
    badgeNeutral: dark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600",
    badgeActive: dark ? "bg-blue-900 text-blue-300" : "bg-blue-100 text-blue-700",
    badgePending: dark ? "bg-yellow-900 text-yellow-300" : "bg-yellow-100 text-yellow-700",
    badgeClosed: dark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600",

    // Direction badges (positions)
    longBadge: dark ? "bg-green-900 text-green-300" : "bg-green-100 text-green-700",
    shortBadge: dark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-700",

    // Tags
    tagBg: dark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600",
    tagBlueBg: dark ? "bg-blue-900 text-blue-300" : "bg-blue-100 text-blue-700",
    tagYellowBg: dark ? "bg-yellow-900 text-yellow-300" : "bg-yellow-100 text-yellow-700",

    // PnL colors
    pnlUp: dark ? "text-green-400" : "text-green-600",
    pnlDown: dark ? "text-red-400" : "text-red-600",

    // Notice/error bar
    noticeBg: dark ? "bg-red-900/30 border-red-800/50 text-red-300" : "bg-red-50 border-red-200 text-red-700",

    // Table
    tableDivider: dark ? "border-gray-700" : "border-gray-200",
    theadBg: dark ? "bg-gray-900" : "bg-gray-50",

    // Input
    inputBg: dark ? "bg-gray-800 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900",

    // Skeleton
    skeletonBg: dark ? "bg-gray-800" : "bg-gray-200",

    // Progress bars
    progressTrack: dark ? "bg-gray-700" : "bg-gray-200",

    // Chart tokens (raw hex for recharts inline styles)
    chart: {
      gridStroke: dark ? "#444" : "#e5e7eb",
      axisStroke: dark ? "#666" : "#9ca3af",
      tooltipBg: dark ? "#1f2937" : "#ffffff",
      tooltipBorder: dark ? "#444" : "#d1d5db",
      green: "#22c55e",
      greenGradientStart: dark ? 0.3 : 0.15,
      red: "#ef4444",
    },
  } as const;
}

/* ── Component ────────────────────────────────────────────────────── */

export default function TradingLabPage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId;

  const [activeTab, setActiveTab] = useState<DecisionTab>("command-center");
  const [assetScope, setAssetScope] = useState<AssetScope>("global");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    typeof window !== "undefined" ? getStoredThemeMode() : "dark"
  );

  // Stay in sync with the global theme toggle
  useEffect(() => {
    setThemeMode(getStoredThemeMode());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "bm_theme_mode") setThemeMode(getStoredThemeMode());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const t = useMemo(() => buildTheme(themeMode), [themeMode]);

  const [hypotheses, setHypotheses] = useState<TradingHypothesis[]>([]);
  const [positions, setPositions] = useState<TradingPosition[]>([]);
  const [perfSnapshots, setPerfSnapshots] = useState<TradingPerformanceSnapshot[]>([]);
  const [researchNotes, setResearchNotes] = useState<TradingResearchNote[]>([]);

  // Position management modals
  const [showNewPosition, setShowNewPosition] = useState(false);
  const [closingPosition, setClosingPosition] = useState<TradingPosition | null>(null);
  const [editingPosition, setEditingPosition] = useState<TradingPosition | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const res = await fetch(`/api/v1/trading?env_id=${encodeURIComponent(envId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      setHypotheses(data.hypotheses || []);
      setPositions(data.positions || []);
      setPerfSnapshots(data.performanceSnapshots || []);
      setResearchNotes(data.researchNotes || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setNotice(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Helper: coerce pg string numerics to number
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Helper functions
  const fmtPnl = (v: unknown): { text: string; color: string } => {
    const n = num(v);
    if (n === null) return { text: "$0", color: t.textMuted };
    const sign = n >= 0 ? "+" : "";
    const color = n >= 0 ? t.pnlUp : t.pnlDown;
    return { text: `${sign}$${Math.abs(n).toLocaleString()}`, color };
  };

  const fmtPct = (v: unknown): string => {
    const n = num(v);
    if (n === null) return "0%";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  };

  const fmtDate = (v: string | null): string => {
    if (!v) return "—";
    const d = new Date(v);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const statusBadge = (s: string): string => {
    if (s === "active") return t.badgeActive;
    if (s === "closed") return t.badgeClosed;
    if (s === "pending") return t.badgePending;
    return t.badgeNeutral;
  };

  // Computed data
  const openPositions = positions.filter((p) => p.status === "open");
  const totalPnL = openPositions.reduce((sum, p) => sum + (num(p.unrealized_pnl) || 0), 0);
  const equityCurveData = perfSnapshots
    .slice()
    .reverse()
    .map((snap) => ({
      date: fmtDate(snap.snapshot_date),
      equity: snap.equity_value,
    }));

  const closedPnLData = perfSnapshots
    .slice()
    .reverse()
    .map((snap) => ({
      date: fmtDate(snap.snapshot_date),
      pnl: snap.realized_pnl,
    }));

  const latestPerf = perfSnapshots.length > 0 ? perfSnapshots[0] : null;
  const winRate = latestPerf?.win_rate?.toFixed(1) ?? "0";

  const tooltipStyle = {
    backgroundColor: t.chart.tooltipBg,
    border: `1px solid ${t.chart.tooltipBorder}`,
    borderRadius: "4px",
    color: themeMode === "dark" ? "#e5e7eb" : "#111827",
  };

  if (loading) {
    return (
      <div className={`flex-1 ${t.pageBg} p-6`}>
        <div className="space-y-4">
          <div className={`h-8 ${t.skeletonBg} rounded w-48 animate-pulse`} />
          <div className={`h-32 ${t.skeletonBg} rounded animate-pulse`} />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`h-24 ${t.skeletonBg} rounded animate-pulse`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col ${t.pageBg} ${t.pageText} font-sans min-h-full transition-colors duration-200`}>
      {/* Header */}
      <div className={`border-b ${t.headerBorder} px-6 py-3 ${t.headerBg} sticky top-0 z-10 flex items-center justify-between`}>
        <div>
          <h1 className={`text-xl font-bold ${t.accentBold} font-mono`}>
            DECISION ENGINE
            <span className={`text-xs ${t.textFaint} ml-4`}>ENV: {envId || "—"}</span>
          </h1>
          {notice && (
            <div className={`mt-2 flex items-center gap-2 ${t.noticeBg} border rounded px-3 py-1.5 text-xs font-mono`}>
              <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              {notice}
            </div>
          )}
        </div>
        <Link
          href={`/lab/env/${envId}/markets/execution`}
          className={`rounded-full border px-4 py-2 text-xs font-mono uppercase tracking-[0.24em] ${t.cardBorder} ${t.cardHover} ${t.textSecondary}`}
        >
          Execution Workspace
        </Link>
      </div>

      {/* Main content area: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <DecisionEngineSidebar
          activeTab={activeTab}
          assetScope={assetScope}
          onTabChange={setActiveTab}
          onScopeChange={setAssetScope}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* COMMAND CENTER */}
          {activeTab === "command-center" && (
            <CommandCenterLayout assetScope={assetScope} />
          )}

          {/* PAPER PORTFOLIO TAB (was positions) */}
          {activeTab === "paper-portfolio" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => setShowNewPosition(true)}
                className="px-3 py-1.5 rounded text-xs font-bold bg-blue-600 text-white hover:bg-blue-700"
              >
                + New Position
              </button>
            </div>
            <div className={`${t.cardBg} border ${t.cardBorder} rounded overflow-auto max-h-96`}>
              <table className="w-full text-xs font-mono">
                <thead className={`sticky top-0 ${t.theadBg} border-b ${t.tableDivider}`}>
                  <tr>
                    <th className={`text-left py-2 px-3 ${t.textFaint}`}>Ticker</th>
                    <th className={`text-left py-2 px-3 ${t.textFaint}`}>Direction</th>
                    <th className={`text-right py-2 px-3 ${t.textFaint}`}>Entry</th>
                    <th className={`text-right py-2 px-3 ${t.textFaint}`}>Current</th>
                    <th className={`text-right py-2 px-3 ${t.textFaint}`}>P&L</th>
                    <th className={`text-right py-2 px-3 ${t.textFaint}`}>Return %</th>
                    <th className={`text-left py-2 px-3 ${t.textFaint}`}>Status</th>
                    <th className={`text-center py-2 px-3 ${t.textFaint}`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr key={pos.position_id} className={`border-b ${t.tableDivider} ${t.cardHover}`}>
                      <td className={`py-2 px-3 ${t.accentBlue} font-bold`}>{pos.ticker}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            pos.direction === "long" ? t.longBadge : t.shortBadge
                          }`}
                        >
                          {pos.direction}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">${pos.entry_price?.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">${pos.current_price?.toFixed(2)}</td>
                      <td className={`py-2 px-3 text-right font-bold ${fmtPnl(pos.unrealized_pnl).color}`}>
                        {fmtPnl(pos.unrealized_pnl).text}
                      </td>
                      <td className={`py-2 px-3 text-right ${fmtPnl(pos.return_pct).color}`}>
                        {fmtPct(pos.return_pct)}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-1 rounded text-xs ${statusBadge(pos.status)}`}>{pos.status}</span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {pos.status === "open" && (
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => setEditingPosition(pos)}
                              className={`px-2 py-0.5 rounded text-xs border ${t.cardBorder} ${t.textSecondary} hover:${t.textPrimary}`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setClosingPosition(pos)}
                              className="px-2 py-0.5 rounded text-xs bg-red-600/20 text-red-400 hover:bg-red-600/40"
                            >
                              Close
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Position modals */}
            <NewPositionModal
              open={showNewPosition}
              onClose={() => setShowNewPosition(false)}
              onCreated={fetchData}
              hypotheses={hypotheses}
              theme={t}
            />
            <ClosePositionModal
              open={!!closingPosition}
              position={closingPosition}
              onClose={() => setClosingPosition(null)}
              onClosed={fetchData}
              theme={t}
            />
            <EditPositionModal
              open={!!editingPosition}
              position={editingPosition}
              onClose={() => setEditingPosition(null)}
              onUpdated={fetchData}
              theme={t}
            />
          </div>
        )}

          {/* CALIBRATION TAB (was performance) */}
          {activeTab === "calibration" && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-5 gap-4">
              {[
                {
                  label: "Total Trades",
                  value: `${(latestPerf?.win_count || 0) + (latestPerf?.loss_count || 0)}`,
                },
                { label: "Win Rate", value: `${winRate}%` },
                {
                  label: "Profit Factor",
                  value: latestPerf?.avg_win && latestPerf?.avg_loss
                    ? (Math.abs(latestPerf.avg_win / latestPerf.avg_loss)).toFixed(2)
                    : "—",
                },
                {
                  label: "Avg Win / Loss",
                  value: `${fmtPnl(latestPerf?.avg_win ?? null).text} / ${fmtPnl(latestPerf?.avg_loss ?? null).text}`,
                },
                {
                  label: "Total P&L",
                  value: fmtPnl(latestPerf?.total_pnl ?? null).text,
                  color: fmtPnl(latestPerf?.total_pnl ?? null).color,
                },
              ].map((stat, i) => (
                <div key={i} className={`${t.cardBg} border ${t.cardBorder} p-4 rounded`}>
                  <div className={`text-xs ${t.textFaint} uppercase tracking-wider mb-2`}>{stat.label}</div>
                  <div className={`text-lg font-mono font-bold ${stat.color || t.accent}`}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Equity Curve */}
            <div className={`${t.cardBg} border ${t.cardBorder} p-4 rounded`}>
              <h2 className={`text-sm font-mono uppercase tracking-wider ${t.accent} mb-4`}>Equity Curve</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={equityCurveData}>
                  <defs>
                    <linearGradient id="colorEquity2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={t.chart.green} stopOpacity={t.chart.greenGradientStart} />
                      <stop offset="95%" stopColor={t.chart.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.chart.gridStroke} />
                  <XAxis dataKey="date" stroke={t.chart.axisStroke} style={{ fontSize: "11px" }} />
                  <YAxis stroke={t.chart.axisStroke} style={{ fontSize: "11px" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="equity" stroke={t.chart.green} fillOpacity={1} fill="url(#colorEquity2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Closed Trades P&L */}
            <div className={`${t.cardBg} border ${t.cardBorder} p-4 rounded`}>
              <h2 className={`text-sm font-mono uppercase tracking-wider ${t.accent} mb-4`}>Closed Trade P&L</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={closedPnLData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.chart.gridStroke} />
                  <XAxis dataKey="date" stroke={t.chart.axisStroke} style={{ fontSize: "11px" }} />
                  <YAxis stroke={t.chart.axisStroke} style={{ fontSize: "11px" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="pnl" stroke={t.chart.green} fill={t.chart.green}>
                    {closedPnLData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={(entry.pnl || 0) >= 0 ? t.chart.green : t.chart.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

          {/* RESEARCH BRIEFS TAB */}
          {activeTab === "research-briefs" && (
          <div className="grid grid-cols-2 gap-4">
            {researchNotes.map((note) => (
              <div key={note.note_id} className={`${t.cardBg} border ${t.cardBorder} p-4 rounded`}>
                <div className="flex items-start justify-between mb-3">
                  <h3 className={`font-bold text-sm ${t.accentBlue}`}>{note.title}</h3>
                  <span className={`${t.tagBg} px-2 py-1 rounded text-xs`}>{note.note_type}</span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {note.ticker && (
                    <span className={`${t.tagBlueBg} px-2 py-1 rounded text-xs`}>{note.ticker}</span>
                  )}
                  {note.tags?.map((tag, i) => (
                    <span key={i} className={`${t.tagBg} px-2 py-1 rounded text-xs`}>{tag}</span>
                  ))}
                </div>

                <p className={`text-sm ${t.textMuted} line-clamp-4`}>{note.content || "No content"}</p>
                <div className={`text-xs ${t.textFaint} mt-3`}>{fmtDate(note.created_at)}</div>
              </div>
            ))}
          </div>
        )}

          {/* HISTORY RHYMES TAB (placeholder) */}
          {activeTab === "history-rhymes" && (
            <div className={`${t.cardBg} border ${t.cardBorder} p-8 rounded text-center`}>
              <p className={`text-sm font-mono uppercase tracking-wider ${t.accent} mb-2`}>History Rhymes</p>
              <p className={`text-xs ${t.textMuted}`}>Episode library, analog matching, and temporal pattern analysis. Coming soon.</p>
            </div>
          )}

          {/* MACHINE FORECASTS TAB (placeholder) */}
          {activeTab === "machine-forecasts" && (
            <div className={`${t.cardBg} border ${t.cardBorder} p-8 rounded text-center`}>
              <p className={`text-sm font-mono uppercase tracking-wider ${t.accent} mb-2`}>Machine Forecasts</p>
              <p className={`text-xs ${t.textMuted}`}>Multi-agent probabilistic forecasts with walk-forward evaluation. Coming soon.</p>
            </div>
          )}

          {/* TRAP DETECTOR TAB (placeholder) */}
          {activeTab === "trap-detector" && (
            <div className={`${t.cardBg} border ${t.cardBorder} p-8 rounded text-center`}>
              <p className={`text-sm font-mono uppercase tracking-wider ${t.accent} mb-2`}>Trap Detector</p>
              <p className={`text-xs ${t.textMuted}`}>Full adversarial analysis: honeypot patterns, crowding unwinds, narrative traps. Coming soon.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

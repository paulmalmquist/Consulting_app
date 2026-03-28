"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { RegimeClassifierWidget } from "@/components/market/RegimeClassifierWidget";
import { BtcSpxCorrelationChart } from "@/components/market/BtcSpxCorrelationChart";
import type {
  TradingTheme,
  TradingSignal,
  TradingHypothesis,
  TradingPosition,
  TradingPerformanceSnapshot,
  TradingResearchNote,
  TradingDailyBrief,
  TradingWatchlistItem,
  SignalDirection,
  SignalStatus,
  HypothesisStatus,
  PositionStatus,
  AssetClass,
} from "@/lib/trading-lab/types";

type Tab = "overview" | "signals" | "hypotheses" | "positions" | "performance" | "research" | "watchlist";
type ThemeMode = "dark" | "light";

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

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  const t = useMemo(() => buildTheme(themeMode), [themeMode]);

  const [themes, setThemes] = useState<TradingTheme[]>([]);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [hypotheses, setHypotheses] = useState<TradingHypothesis[]>([]);
  const [positions, setPositions] = useState<TradingPosition[]>([]);
  const [perfSnapshots, setPerfSnapshots] = useState<TradingPerformanceSnapshot[]>([]);
  const [researchNotes, setResearchNotes] = useState<TradingResearchNote[]>([]);
  const [dailyBrief, setDailyBrief] = useState<TradingDailyBrief | null>(null);
  const [watchlist, setWatchlist] = useState<TradingWatchlistItem[]>([]);

  const [signalFilter, setSignalFilter] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const res = await fetch("/api/v1/trading");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      setThemes(data.themes || []);
      setSignals(data.signals || []);
      setHypotheses(data.hypotheses || []);
      setPositions(data.positions || []);
      setPerfSnapshots(data.performanceSnapshots || []);
      setResearchNotes(data.researchNotes || []);
      setDailyBrief(data.dailyBrief || null);
      setWatchlist(data.watchlist || []);
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

  const directionColor = (d: SignalDirection): string => {
    switch (d) {
      case "bullish":
        return t.badgeBullish;
      case "bearish":
        return t.badgeBearish;
      default:
        return t.badgeNeutral;
    }
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
  const topSignals = signals.slice(0, 5);
  const filteredSignals = signals.filter((s) => (signalFilter ? s.category?.includes(signalFilter) : true));

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
      <div className={`border-b ${t.headerBorder} px-6 py-4 ${t.headerBg} sticky top-0 z-10 flex items-center justify-between`}>
        <div>
          <h1 className={`text-2xl font-bold ${t.accentBold} font-mono`}>
            WINSTON TRADING LAB
            <span className={`text-xs ${t.textFaint} ml-4`}>ENV: {envId || "—"}</span>
          </h1>
          {notice && (
            <div className={`mt-2 flex items-center gap-2 ${t.noticeBg} border rounded px-3 py-1.5 text-xs font-mono`}>
              <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              {notice}
            </div>
          )}
        </div>
        {/* Theme Toggle */}
        <button
          onClick={() => setThemeMode((m) => (m === "dark" ? "light" : "dark"))}
          className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-mono transition-colors ${
            themeMode === "dark"
              ? "border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
          }`}
          title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
        >
          {themeMode === "dark" ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              Light
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              Dark
            </>
          )}
        </button>
      </div>

      {/* Command Header (Stats Row) */}
      {activeTab === "overview" && (
        <div className={`border-b ${t.headerBorder} px-6 py-3 ${t.statBarBg} grid grid-cols-5 gap-4 font-mono text-sm`}>
          <div>
            <div className={`${t.textFaint} text-xs uppercase tracking-wider`}>Regime</div>
            <div className={`${t.accentBlue} font-bold`}>
              {dailyBrief?.regime_label || "—"}
            </div>
          </div>
          <div>
            <div className={`${t.textFaint} text-xs uppercase tracking-wider`}>Net P&L</div>
            <div className={`font-bold ${fmtPnl(totalPnL).color}`}>{fmtPnl(totalPnL).text}</div>
          </div>
          <div>
            <div className={`${t.textFaint} text-xs uppercase tracking-wider`}>Top Signal</div>
            <div className={`${t.accent} font-bold`}>{topSignals[0]?.strength?.toFixed(1) || "—"}</div>
          </div>
          <div>
            <div className={`${t.textFaint} text-xs uppercase tracking-wider`}>Equity</div>
            <div className={`${t.accentBlue} font-bold`}>
              ${perfSnapshots[0]?.equity_value?.toLocaleString() || "—"}
            </div>
          </div>
          <div>
            <div className={`${t.textFaint} text-xs uppercase tracking-wider`}>Win Rate</div>
            <div className={`${t.accent} font-bold`}>{winRate}%</div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className={`border-b ${t.headerBorder} px-6 flex gap-8 ${t.tabBg} sticky top-14 z-9`}>
        {(["overview", "signals", "hypotheses", "positions", "performance", "research", "watchlist"] as Tab[]).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-2 text-sm font-mono uppercase tracking-wider border-b-2 transition-colors ${
                activeTab === tab ? t.tabActive : t.tabInactive
              }`}
            >
              {tab}
            </button>
          )
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* What Changed Panel */}
            {dailyBrief && (
              <div className={`${t.cardBg} border ${t.cardBorder} p-4 rounded`}>
                <h2 className={`text-sm font-mono uppercase tracking-wider ${t.accent} mb-3`}>What Changed</h2>
                <div className={`text-sm ${t.textSecondary} space-y-2`}>
                  <p className={`text-xs ${t.textFaint}`}>Brief Date: {fmtDate(dailyBrief.brief_date)}</p>
                  {dailyBrief.what_changed && (
                    <p>{dailyBrief.what_changed}</p>
                  )}
                  {dailyBrief.market_summary && (
                    <p className={t.textMuted}>{dailyBrief.market_summary}</p>
                  )}
                  {dailyBrief.top_risks && (
                    <div className="mt-2">
                      <span className={`${t.pnlDown} text-xs font-mono uppercase`}>Top Risks:</span>
                      <p className={`${t.textMuted} text-xs mt-1`}>
                        {typeof dailyBrief.top_risks === "string"
                          ? dailyBrief.top_risks
                          : Array.isArray(dailyBrief.top_risks)
                            ? (dailyBrief.top_risks as string[]).join(", ")
                            : "—"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-6">
              {/* Equity Curve */}
              <div className={`col-span-2 ${t.cardBg} border ${t.cardBorder} p-4 rounded`}>
                <h2 className={`text-sm font-mono uppercase tracking-wider ${t.accent} mb-4`}>Equity Curve</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={equityCurveData}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={t.chart.green} stopOpacity={t.chart.greenGradientStart} />
                        <stop offset="95%" stopColor={t.chart.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.chart.gridStroke} />
                    <XAxis dataKey="date" stroke={t.chart.axisStroke} style={{ fontSize: "11px" }} />
                    <YAxis stroke={t.chart.axisStroke} style={{ fontSize: "11px" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="equity" stroke={t.chart.green} fillOpacity={1} fill="url(#colorEquity)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Top Signals */}
              <div className={`${t.cardBg} border ${t.cardBorder} p-4 rounded overflow-y-auto max-h-96`}>
                <h2 className={`text-sm font-mono uppercase tracking-wider ${t.accent} mb-4`}>Top Signals</h2>
                <div className="space-y-3">
                  {topSignals.map((sig) => (
                    <div key={sig.signal_id} className={`${themeMode === "dark" ? "bg-gray-700" : "bg-gray-100"} p-2 rounded text-xs`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`font-mono ${t.accent}`}>{sig.asset_class || "—"}</span>
                        <span className={directionColor(sig.direction)}>{sig.direction}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={t.textMuted}>Strength</span>
                        <span className={`${t.accentBlue} font-mono`}>{sig.strength?.toFixed(1) || "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Open Positions */}
            <div className={`${t.cardBg} border ${t.cardBorder} p-4 rounded`}>
              <h2 className={`text-sm font-mono uppercase tracking-wider ${t.accent} mb-4`}>Open Positions</h2>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className={`border-b ${t.tableDivider}`}>
                    <th className={`text-left py-2 ${t.textFaint}`}>Ticker</th>
                    <th className={`text-right py-2 ${t.textFaint}`}>Entry</th>
                    <th className={`text-right py-2 ${t.textFaint}`}>Current</th>
                    <th className={`text-right py-2 ${t.textFaint}`}>P&L</th>
                    <th className={`text-right py-2 ${t.textFaint}`}>Return</th>
                    <th className={`text-left py-2 ${t.textFaint}`}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.slice(0, 10).map((pos) => (
                    <tr key={pos.position_id} className={`border-b ${t.tableDivider} ${t.cardHover}`}>
                      <td className="py-2">{pos.ticker}</td>
                      <td className="text-right">${pos.entry_price?.toFixed(2)}</td>
                      <td className="text-right">${pos.current_price?.toFixed(2)}</td>
                      <td className={`text-right font-bold ${fmtPnl(pos.unrealized_pnl).color}`}>
                        {fmtPnl(pos.unrealized_pnl).text}
                      </td>
                      <td className={`text-right ${fmtPnl(pos.return_pct).color}`}>
                        {fmtPct(pos.return_pct)}
                      </td>
                      <td>
                        <span className={`px-2 py-1 rounded text-xs ${statusBadge(pos.status)}`}>{pos.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SIGNALS TAB */}
        {activeTab === "signals" && (
          <div className="space-y-4">
            <div className="flex gap-4 mb-4">
              <input
                type="text"
                placeholder="Filter by category..."
                value={signalFilter}
                onChange={(e) => setSignalFilter(e.target.value)}
                className={`px-3 py-2 ${t.inputBg} border rounded text-sm font-mono`}
              />
            </div>

            <div className={`${t.cardBg} border ${t.cardBorder} rounded overflow-auto max-h-96`}>
              <table className="w-full text-xs font-mono">
                <thead className={`sticky top-0 ${t.theadBg} border-b ${t.tableDivider}`}>
                  <tr>
                    <th className={`text-left py-2 px-3 ${t.textFaint}`}>Asset Class</th>
                    <th className={`text-left py-2 px-3 ${t.textFaint}`}>Category</th>
                    <th className={`text-right py-2 px-3 ${t.textFaint}`}>Strength</th>
                    <th className={`text-left py-2 px-3 ${t.textFaint}`}>Direction</th>
                    <th className={`text-left py-2 px-3 ${t.textFaint}`}>Status</th>
                    <th className={`text-left py-2 px-3 ${t.textFaint}`}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSignals.map((sig) => (
                    <tr key={sig.signal_id} className={`border-b ${t.tableDivider} ${t.cardHover}`}>
                      <td className={`py-2 px-3 ${t.accentBlue}`}>{sig.asset_class}</td>
                      <td className={`py-2 px-3 ${t.textSecondary}`}>{sig.category}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className={`w-24 ${t.progressTrack} h-2 rounded`}>
                            <div
                              className="h-2 bg-green-500 rounded"
                              style={{ width: `${Math.min((sig.strength || 0) * 20, 100)}%` }}
                            />
                          </div>
                          <span className={`${t.accent} font-bold`}>{sig.strength?.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-1 rounded text-xs ${directionColor(sig.direction)}`}>
                          {sig.direction}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-1 rounded text-xs ${statusBadge(sig.status)}`}>{sig.status}</span>
                      </td>
                      <td className={`py-2 px-3 ${t.textFaint}`}>{sig.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* HYPOTHESES TAB */}
        {activeTab === "hypotheses" && (
          <div className="grid grid-cols-2 gap-4">
            {hypotheses.map((hyp) => (
              <div key={hyp.hypothesis_id} className={`${t.cardBg} border ${t.cardBorder} p-4 rounded`}>
                <div className="flex justify-between items-start mb-3">
                  <h3 className={`text-sm font-mono font-bold ${t.accentBlue}`}>{hyp.thesis}</h3>
                  <span className={`px-2 py-1 rounded text-xs ${statusBadge(hyp.status)}`}>{hyp.status}</span>
                </div>

                <div className={`text-xs ${t.textMuted} mb-3`}>
                  <div className="mb-2">
                    <span className={t.accent}>Confidence:</span>
                    <div className={`w-full ${t.progressTrack} h-2 rounded mt-1`}>
                      <div
                        className="h-2 bg-blue-500 rounded"
                        style={{ width: `${hyp.confidence || 0}%` }}
                      />
                    </div>
                    <span className={t.accentBlue}>{hyp.confidence}%</span>
                  </div>
                  <div>Timeframe: {hyp.timeframe}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {hyp.proves_right && (
                    <div>
                      <div className={`${t.pnlUp} font-bold mb-1`}>Proves Right</div>
                      <p className={t.textMuted}>
                        {Array.isArray(hyp.proves_right) ? hyp.proves_right.join("; ") : String(hyp.proves_right)}
                      </p>
                    </div>
                  )}
                  {hyp.proves_wrong && (
                    <div>
                      <div className={`${t.pnlDown} font-bold mb-1`}>Proves Wrong</div>
                      <p className={t.textMuted}>
                        {Array.isArray(hyp.proves_wrong) ? hyp.proves_wrong.join("; ") : String(hyp.proves_wrong)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* POSITIONS TAB */}
        {activeTab === "positions" && (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PERFORMANCE TAB */}
        {activeTab === "performance" && (
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

        {/* RESEARCH TAB */}
        {activeTab === "research" && (
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

        {/* WATCHLIST TAB */}
        {activeTab === "watchlist" && (
          <div className={`${t.cardBg} border ${t.cardBorder} rounded overflow-auto max-h-96`}>
            <table className="w-full text-xs font-mono">
              <thead className={`sticky top-0 ${t.theadBg} border-b ${t.tableDivider}`}>
                <tr>
                  <th className={`text-left py-2 px-3 ${t.textFaint}`}>Ticker</th>
                  <th className={`text-left py-2 px-3 ${t.textFaint}`}>Asset Name</th>
                  <th className={`text-right py-2 px-3 ${t.textFaint}`}>Price</th>
                  <th className={`text-right py-2 px-3 ${t.textFaint}`}>1D Change</th>
                  <th className={`text-right py-2 px-3 ${t.textFaint}`}>1W Change</th>
                  <th className={`text-left py-2 px-3 ${t.textFaint}`}>Alerts</th>
                  <th className={`text-left py-2 px-3 ${t.textFaint}`}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((item) => (
                  <tr key={item.ticker} className={`border-b ${t.tableDivider} ${t.cardHover}`}>
                    <td className={`py-2 px-3 ${t.accentBlue} font-bold`}>{item.ticker}</td>
                    <td className={`py-2 px-3 ${t.textSecondary}`}>{item.asset_name}</td>
                    <td className="py-2 px-3 text-right">${item.current_price?.toFixed(2)}</td>
                    <td className={`py-2 px-3 text-right ${fmtPnl(item.price_change_1d).color}`}>
                      {fmtPct(item.price_change_1d)}
                    </td>
                    <td className={`py-2 px-3 text-right ${fmtPnl(item.price_change_1w).color}`}>
                      {fmtPct(item.price_change_1w)}
                    </td>
                    <td className="py-2 px-3">
                      {(item.alert_above || item.alert_below) ? (
                        <span className={`${t.tagYellowBg} px-2 py-1 rounded text-xs`}>
                          {[item.alert_above && `↑${item.alert_above}`, item.alert_below && `↓${item.alert_below}`].filter(Boolean).join(" ")}
                        </span>
                      ) : (
                        <span className={t.textFaint}>—</span>
                      )}
                    </td>
                    <td className={`py-2 px-3 ${t.textFaint}`}>{item.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

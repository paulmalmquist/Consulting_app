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

export default function TradingLabPage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId;

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

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
    if (n === null) return { text: "$0", color: "text-gray-400" };
    const sign = n >= 0 ? "+" : "";
    const color = n >= 0 ? "text-green-400" : "text-red-400";
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
        return "bg-green-900 text-green-300";
      case "bearish":
        return "bg-red-900 text-red-300";
      default:
        return "bg-gray-700 text-gray-300";
    }
  };

  const statusBadge = (s: string): string => {
    if (s === "active") return "bg-blue-900 text-blue-300";
    if (s === "closed") return "bg-gray-700 text-gray-300";
    if (s === "pending") return "bg-yellow-900 text-yellow-300";
    return "bg-gray-700 text-gray-300";
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

  // Daily brief fields are top-level on TradingDailyBrief

  if (loading) {
    return (
      <div className="flex-1 bg-gray-900 p-6">
        <div className="space-y-4">
          <div className="h-8 bg-gray-800 rounded w-48 animate-pulse" />
          <div className="h-32 bg-gray-800 rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 text-gray-100 font-sans min-h-full">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 bg-gray-900 sticky top-0 z-10">
        <h1 className="text-2xl font-bold text-green-400 font-mono">
          WINSTON TRADING LAB
          <span className="text-xs text-gray-500 ml-4">ENV: {envId || "—"}</span>
        </h1>
        {notice && (
          <div className="mt-2 flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded px-3 py-1.5 text-xs text-red-300 font-mono">
            <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            {notice}
          </div>
        )}
      </div>

      {/* Command Header (Stats Row) */}
      {activeTab === "overview" && (
        <div className="border-b border-gray-800 px-6 py-3 bg-gray-800/50 grid grid-cols-5 gap-4 font-mono text-sm">
          <div>
            <div className="text-gray-500 text-xs uppercase tracking-wider">Regime</div>
            <div className="text-blue-300 font-bold">
              {dailyBrief?.regime_label || "—"}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase tracking-wider">Net P&L</div>
            <div className={`font-bold ${fmtPnl(totalPnL).color}`}>{fmtPnl(totalPnL).text}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase tracking-wider">Top Signal</div>
            <div className="text-green-400 font-bold">{topSignals[0]?.strength?.toFixed(1) || "—"}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase tracking-wider">Equity</div>
            <div className="text-blue-300 font-bold">
              ${perfSnapshots[0]?.equity_value?.toLocaleString() || "—"}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase tracking-wider">Win Rate</div>
            <div className="text-green-400 font-bold">{winRate}%</div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-800 px-6 flex gap-8 bg-gray-900 sticky top-14 z-9">
        {(["overview", "signals", "hypotheses", "positions", "performance", "research", "watchlist"] as Tab[]).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-2 text-sm font-mono uppercase tracking-wider border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-green-400 text-green-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
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
              <div className="bg-gray-800 border border-gray-700 p-4 rounded">
                <h2 className="text-sm font-mono uppercase tracking-wider text-green-400 mb-3">What Changed</h2>
                <div className="text-sm text-gray-300 space-y-2">
                  <p className="text-xs text-gray-500">Brief Date: {fmtDate(dailyBrief.brief_date)}</p>
                  {dailyBrief.what_changed && (
                    <p>{dailyBrief.what_changed}</p>
                  )}
                  {dailyBrief.market_summary && (
                    <p className="text-gray-400">{dailyBrief.market_summary}</p>
                  )}
                  {dailyBrief.top_risks && (
                    <div className="mt-2">
                      <span className="text-red-400 text-xs font-mono uppercase">Top Risks:</span>
                      <p className="text-gray-400 text-xs mt-1">
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
              <div className="col-span-2 bg-gray-800 border border-gray-700 p-4 rounded">
                <h2 className="text-sm font-mono uppercase tracking-wider text-green-400 mb-4">Equity Curve</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={equityCurveData}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis dataKey="date" stroke="#666" style={{ fontSize: "11px" }} />
                    <YAxis stroke="#666" style={{ fontSize: "11px" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #444",
                        borderRadius: "4px",
                      }}
                    />
                    <Area type="monotone" dataKey="equity" stroke="#22c55e" fillOpacity={1} fill="url(#colorEquity)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Top Signals */}
              <div className="bg-gray-800 border border-gray-700 p-4 rounded overflow-y-auto max-h-96">
                <h2 className="text-sm font-mono uppercase tracking-wider text-green-400 mb-4">Top Signals</h2>
                <div className="space-y-3">
                  {topSignals.map((sig) => (
                    <div key={sig.signal_id} className="bg-gray-700 p-2 rounded text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-mono text-green-400">{sig.asset_class || "—"}</span>
                        <span className={directionColor(sig.direction)}>{sig.direction}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Strength</span>
                        <span className="text-blue-300 font-mono">{sig.strength?.toFixed(1) || "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Open Positions */}
            <div className="bg-gray-800 border border-gray-700 p-4 rounded">
              <h2 className="text-sm font-mono uppercase tracking-wider text-green-400 mb-4">Open Positions</h2>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 text-gray-500">Ticker</th>
                    <th className="text-right py-2 text-gray-500">Entry</th>
                    <th className="text-right py-2 text-gray-500">Current</th>
                    <th className="text-right py-2 text-gray-500">P&L</th>
                    <th className="text-right py-2 text-gray-500">Return</th>
                    <th className="text-left py-2 text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.slice(0, 10).map((pos) => (
                    <tr key={pos.position_id} className="border-b border-gray-700 hover:bg-gray-700/30">
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
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm font-mono text-gray-100"
              />
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded overflow-auto max-h-96">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
                  <tr>
                    <th className="text-left py-2 px-3 text-gray-500">Asset Class</th>
                    <th className="text-left py-2 px-3 text-gray-500">Category</th>
                    <th className="text-right py-2 px-3 text-gray-500">Strength</th>
                    <th className="text-left py-2 px-3 text-gray-500">Direction</th>
                    <th className="text-left py-2 px-3 text-gray-500">Status</th>
                    <th className="text-left py-2 px-3 text-gray-500">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSignals.map((sig) => (
                    <tr key={sig.signal_id} className="border-b border-gray-700 hover:bg-gray-700/30">
                      <td className="py-2 px-3 text-blue-300">{sig.asset_class}</td>
                      <td className="py-2 px-3 text-gray-300">{sig.category}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 bg-gray-700 h-2 rounded">
                            <div
                              className="h-2 bg-green-500 rounded"
                              style={{ width: `${Math.min((sig.strength || 0) * 20, 100)}%` }}
                            />
                          </div>
                          <span className="text-green-400 font-bold">{sig.strength?.toFixed(1)}</span>
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
                      <td className="py-2 px-3 text-gray-500">{sig.source}</td>
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
              <div key={hyp.hypothesis_id} className="bg-gray-800 border border-gray-700 p-4 rounded">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-sm font-mono font-bold text-blue-300">{hyp.thesis}</h3>
                  <span className={`px-2 py-1 rounded text-xs ${statusBadge(hyp.status)}`}>{hyp.status}</span>
                </div>

                <div className="text-xs text-gray-400 mb-3">
                  <div className="mb-2">
                    <span className="text-green-400">Confidence:</span>
                    <div className="w-full bg-gray-700 h-2 rounded mt-1">
                      <div
                        className="h-2 bg-blue-500 rounded"
                        style={{ width: `${hyp.confidence || 0}%` }}
                      />
                    </div>
                    <span className="text-blue-300">{hyp.confidence}%</span>
                  </div>
                  <div>Timeframe: {hyp.timeframe}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {hyp.proves_right && (
                    <div>
                      <div className="text-green-400 font-bold mb-1">Proves Right</div>
                      <p className="text-gray-400">
                        {Array.isArray(hyp.proves_right) ? hyp.proves_right.join("; ") : String(hyp.proves_right)}
                      </p>
                    </div>
                  )}
                  {hyp.proves_wrong && (
                    <div>
                      <div className="text-red-400 font-bold mb-1">Proves Wrong</div>
                      <p className="text-gray-400">
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
          <div className="bg-gray-800 border border-gray-700 rounded overflow-auto max-h-96">
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
                <tr>
                  <th className="text-left py-2 px-3 text-gray-500">Ticker</th>
                  <th className="text-left py-2 px-3 text-gray-500">Direction</th>
                  <th className="text-right py-2 px-3 text-gray-500">Entry</th>
                  <th className="text-right py-2 px-3 text-gray-500">Current</th>
                  <th className="text-right py-2 px-3 text-gray-500">P&L</th>
                  <th className="text-right py-2 px-3 text-gray-500">Return %</th>
                  <th className="text-left py-2 px-3 text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <tr key={pos.position_id} className="border-b border-gray-700 hover:bg-gray-700/30">
                    <td className="py-2 px-3 text-blue-300 font-bold">{pos.ticker}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          pos.direction === "long"
                            ? "bg-green-900 text-green-300"
                            : "bg-red-900 text-red-300"
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
                <div key={i} className="bg-gray-800 border border-gray-700 p-4 rounded">
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{stat.label}</div>
                  <div className={`text-lg font-mono font-bold ${stat.color || "text-green-400"}`}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Equity Curve */}
            <div className="bg-gray-800 border border-gray-700 p-4 rounded">
              <h2 className="text-sm font-mono uppercase tracking-wider text-green-400 mb-4">Equity Curve</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={equityCurveData}>
                  <defs>
                    <linearGradient id="colorEquity2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="date" stroke="#666" style={{ fontSize: "11px" }} />
                  <YAxis stroke="#666" style={{ fontSize: "11px" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #444",
                      borderRadius: "4px",
                    }}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#22c55e" fillOpacity={1} fill="url(#colorEquity2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Closed Trades P&L */}
            <div className="bg-gray-800 border border-gray-700 p-4 rounded">
              <h2 className="text-sm font-mono uppercase tracking-wider text-green-400 mb-4">Closed Trade P&L</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={closedPnLData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="date" stroke="#666" style={{ fontSize: "11px" }} />
                  <YAxis stroke="#666" style={{ fontSize: "11px" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #444",
                      borderRadius: "4px",
                    }}
                  />
                  <Bar dataKey="pnl" stroke="#22c55e" fill="#22c55e">
                    {closedPnLData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={(entry.pnl || 0) >= 0 ? "#22c55e" : "#ef4444"} />
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
              <div key={note.note_id} className="bg-gray-800 border border-gray-700 p-4 rounded">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-sm text-blue-300">{note.title}</h3>
                  <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs">{note.note_type}</span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {note.ticker && (
                    <span className="bg-blue-900 text-blue-300 px-2 py-1 rounded text-xs">{note.ticker}</span>
                  )}
                  {note.tags?.map((tag, i) => (
                    <span key={i} className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs">{tag}</span>
                  ))}
                </div>

                <p className="text-sm text-gray-400 line-clamp-4">{note.content || "No content"}</p>
                <div className="text-xs text-gray-500 mt-3">{fmtDate(note.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {/* WATCHLIST TAB */}
        {activeTab === "watchlist" && (
          <div className="bg-gray-800 border border-gray-700 rounded overflow-auto max-h-96">
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
                <tr>
                  <th className="text-left py-2 px-3 text-gray-500">Ticker</th>
                  <th className="text-left py-2 px-3 text-gray-500">Asset Name</th>
                  <th className="text-right py-2 px-3 text-gray-500">Price</th>
                  <th className="text-right py-2 px-3 text-gray-500">1D Change</th>
                  <th className="text-right py-2 px-3 text-gray-500">1W Change</th>
                  <th className="text-left py-2 px-3 text-gray-500">Alerts</th>
                  <th className="text-left py-2 px-3 text-gray-500">Notes</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((item) => (
                  <tr key={item.ticker} className="border-b border-gray-700 hover:bg-gray-700/30">
                    <td className="py-2 px-3 text-blue-300 font-bold">{item.ticker}</td>
                    <td className="py-2 px-3 text-gray-300">{item.asset_name}</td>
                    <td className="py-2 px-3 text-right">${item.current_price?.toFixed(2)}</td>
                    <td className={`py-2 px-3 text-right ${fmtPnl(item.price_change_1d).color}`}>
                      {fmtPct(item.price_change_1d)}
                    </td>
                    <td className={`py-2 px-3 text-right ${fmtPnl(item.price_change_1w).color}`}>
                      {fmtPct(item.price_change_1w)}
                    </td>
                    <td className="py-2 px-3">
                      {(item.alert_above || item.alert_below) ? (
                        <span className="bg-yellow-900 text-yellow-300 px-2 py-1 rounded text-xs">
                          {[item.alert_above && `↑${item.alert_above}`, item.alert_below && `↓${item.alert_below}`].filter(Boolean).join(" ")}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-gray-500">{item.notes || "—"}</td>
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

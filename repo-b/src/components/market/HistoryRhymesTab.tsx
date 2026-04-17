"use client";

import React, { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  getChartColors, getTooltipStyle, getAxisTickStyle, getGridStyle,
  CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE, GRID_STYLE,
} from "@/components/charts/chart-theme";
import type { RealitySignal, DataSignal, NarrativeItem } from "@/lib/trading-lab/decision-engine-types";
import {
  HistoryRhymesDataStateBanner,
  type HistoryRhymesDataState,
} from "@/components/market/HistoryRhymesDataStateBanner";
import { fetchRhymesEpisodes, RhymesClientError } from "@/lib/trading-lab/rhymes-client";

/* ── Chart hex helper (reads CSS vars at render time for theme-awareness) ── */

function useCH() {
  const colors = getChartColors();
  return {
    cyan: colors.primary,
    green: colors.success,
    red: colors.danger,
    amber: colors.warning,
    purple: colors.secondary,
    blue: colors.primary,
    pink: "#EC4899",
    grid: colors.grid,
    axis: colors.axis,
  };
}

// Static fallback for module-level references
const CH = {
  cyan: CHART_COLORS.scenario[0],
  green: CHART_COLORS.noi,
  red: CHART_COLORS.opex,
  amber: CHART_COLORS.warning,
  purple: CHART_COLORS.scenario[4] ?? "#A78BFA",
  blue: CHART_COLORS.scenario[0],
  pink: "#EC4899",
  grid: CHART_COLORS.grid,
  axis: CHART_COLORS.axis,
} as const;

/* ── Layer color map (Tailwind classes for theme awareness) ── */

const LAYER_CLASSES: Record<string, { text: string; bg: string; dot: string }> = {
  reality:     { text: "text-emerald-500", bg: "bg-emerald-500", dot: "bg-emerald-500" },
  data:        { text: "text-sky-400", bg: "bg-sky-400", dot: "bg-sky-400" },
  narrative:   { text: "text-amber-400", bg: "bg-amber-400", dot: "bg-amber-400" },
  positioning: { text: "text-violet-400", bg: "bg-violet-400", dot: "bg-violet-400" },
  meta:        { text: "text-red-400", bg: "bg-red-400", dot: "bg-red-400" },
};

/* ── Mock Data (exported for panel decomposition) ─────────── */

export const analogOverlay = Array.from({ length: 60 }, (_, i) => {
  const b = Math.sin(i * 0.1) * 5;
  return {
    day: i - 30,
    current: 100 + b + i * 0.3 + (Math.random() - .5) * 2,
    gfc: 100 + b * 1.2 - i * 0.8 + (Math.random() - .5) * 3,
    crypto22: 100 + b * .8 - i * .4 + (Math.random() - .5) * 2.5,
  };
});

export const realitySignals = [
  { domain: "Labor", signal: "Tech job postings", value: -12, accel: -3.2, trend: "down", confidence: 0.82 },
  { domain: "Labor", signal: "Construction hiring", value: -8, accel: -1.1, trend: "down", confidence: 0.74 },
  { domain: "Logistics", signal: "Freight rates (Drewry WCI)", value: -22, accel: +4.5, trend: "decel. decline", confidence: 0.88 },
  { domain: "Energy", signal: "Industrial elec. demand", value: +1.3, accel: -0.8, trend: "flat", confidence: 0.71 },
  { domain: "Consumer", signal: "Airfare pricing index", value: +6, accel: +2.1, trend: "up", confidence: 0.79 },
  { domain: "Housing", signal: "Crane count (top 20 MSAs)", value: -15, accel: -5.3, trend: "down", confidence: 0.85 },
  { domain: "Consumer", signal: "BNPL usage growth", value: +18, accel: +6.7, trend: "accelerating", confidence: 0.77 },
];

export const dataSignals = [
  { metric: "CPI YoY", reported: 3.1, expected: 3.0, surprise: +0.1, trend: "sticky", revision: "none" },
  { metric: "Core PCE", reported: 2.8, expected: 2.7, surprise: +0.1, trend: "sticky", revision: "none" },
  { metric: "Nonfarm Payrolls", reported: 151, expected: 170, surprise: -19, trend: "cooling", revision: "-26K prior" },
  { metric: "PMI Mfg", reported: 49.2, expected: 50.1, surprise: -0.9, trend: "contraction", revision: "none" },
  { metric: "Housing Starts", reported: 1.37, expected: 1.42, surprise: -0.05, trend: "declining", revision: "-30K prior" },
  { metric: "CMBS Delinq.", reported: 12.3, expected: 11.8, surprise: +0.5, trend: "rising", revision: "+0.2 prior" },
];

export const narrativeState = [
  { label: "Soft Landing", intensity: 72, velocity: -8, lifecycle: "exhaustion", crowding: 85, manipulation: 0.3 },
  { label: "AI Bubble", intensity: 61, velocity: +12, lifecycle: "emerging", crowding: 45, manipulation: 0.2 },
  { label: "CRE Apocalypse", intensity: 58, velocity: -3, lifecycle: "crowded", crowding: 78, manipulation: 0.4 },
  { label: "Crypto Supercycle", intensity: 44, velocity: +22, lifecycle: "early", crowding: 31, manipulation: 0.5 },
  { label: "Stagflation Risk", intensity: 35, velocity: +7, lifecycle: "emerging", crowding: 22, manipulation: 0.1 },
  { label: "Rate Cut Rally", intensity: 68, velocity: -15, lifecycle: "exhaustion", crowding: 91, manipulation: 0.6 },
];

export const positioningData = [
  { asset: "SPY", metric: "Put/Call", value: "0.82", crowding: 62, extreme: false, direction: "neutral" },
  { asset: "QQQ", metric: "Net Gamma", value: "-2.1B", crowding: 78, extreme: true, direction: "negative" },
  { asset: "BTC", metric: "Funding Rate", value: "0.012%", crowding: 55, extreme: false, direction: "long" },
  { asset: "ETH", metric: "Exchange Flows", value: "-42K", crowding: 38, extreme: false, direction: "accumulation" },
  { asset: "Office REITs", metric: "Short Interest", value: "18.2%", crowding: 89, extreme: true, direction: "short" },
  { asset: "HY Credit", metric: "Fund Flows", value: "-$1.2B", crowding: 71, extreme: true, direction: "outflows" },
  { asset: "Stablecoins", metric: "Supply +30d", value: "+$3.8B", crowding: 25, extreme: false, direction: "expansion" },
  { asset: "Gold", metric: "CFTC Net Long", value: "312K", crowding: 82, extreme: true, direction: "crowded long" },
];

export const silenceEvents = [
  { label: "China Property Crisis", priorIntensity: 78, currentIntensity: 12, dropoff: -85, significance: 0.91 },
  { label: "Bank Term Funding", priorIntensity: 65, currentIntensity: 8, dropoff: -88, significance: 0.87 },
  { label: "Japan Carry Trade", priorIntensity: 71, currentIntensity: 15, dropoff: -79, significance: 0.83 },
  { label: "CMBS Maturity Wall", priorIntensity: 55, currentIntensity: 18, dropoff: -67, significance: 0.76 },
  { label: "Student Loan Restart", priorIntensity: 60, currentIntensity: 5, dropoff: -92, significance: 0.72 },
];

export const mismatchData = [
  { topic: "Consumer Health", reality: "BNPL +18%, card delinq rising", data: "Retail sales +0.4%", narrative: "Consumer resilient", mismatch: 0.78 },
  { topic: "Labor Market", reality: "Tech freeze, construction -8%", data: "NFP +151K (miss)", narrative: "Jobs still strong", mismatch: 0.72 },
  { topic: "Office CRE", reality: "Cranes -15%, leasing quiet", data: "CMBS delinq 12.3%", narrative: "Bottom forming", mismatch: 0.85 },
  { topic: "Crypto Cycle", reality: "Stablecoin supply expanding", data: "ETF flows positive", narrative: "Bear market", mismatch: 0.69 },
  { topic: "Rate Path", reality: "BNPL stress, freight falling", data: "CPI sticky 3.1%", narrative: "Higher for longer", mismatch: 0.55 },
];

export const agentData = [
  { agent: "Macro", dir: "Bearish", conf: 68, brier: 0.19, wt: 28 },
  { agent: "Quant", dir: "Neutral", conf: 52, brier: 0.21, wt: 22 },
  { agent: "Narrative", dir: "Bearish", conf: 71, brier: 0.17, wt: 24 },
  { agent: "Contrarian", dir: "Bullish", conf: 61, brier: 0.23, wt: 14 },
  { agent: "Red Team", dir: "TRAP", conf: 73, brier: 0.15, wt: 12 },
];

export const radarDims = [
  { d: "Reality", current: 0.78, gfc: 0.88, crypto22: 0.72 },
  { d: "Data", current: 0.65, gfc: 0.91, crypto22: 0.55 },
  { d: "Narrative", current: 0.71, gfc: 0.81, crypto22: 0.85 },
  { d: "Positioning", current: 0.82, gfc: 0.95, crypto22: 0.88 },
  { d: "Meta-Game", current: 0.58, gfc: 0.72, crypto22: 0.69 },
  { d: "Acceleration", current: 0.73, gfc: 0.85, crypto22: 0.76 },
];

export const brierHist = Array.from({ length: 24 }, (_, i) => ({
  w: `W${i + 1}`,
  agg: 0.21 - i * 0.0008 + (Math.random() - .5) * 0.03,
  base: 0.25,
  narrative: 0.17 + (Math.random() - .5) * 0.04,
}));

export const trapChecks = [
  { check: "Consensus Divergence", status: "CLEAR", variant: "success" as const, value: "3/5 agents agree" },
  { check: "Flow / Narrative", status: "MISMATCH", variant: "warning" as const, value: "Bearish narrative, buying flows" },
  { check: "Crowding Score", status: "ELEVATED", variant: "warning" as const, value: "0.68 - Office REIT shorts" },
  { check: "Honeypot Match", status: "CLEAR", variant: "success" as const, value: "Nearest: 0.61 (FTX bottom)" },
  { check: "Info Provenance", status: "WARNING", variant: "danger" as const, value: "3 low-origin sources amplified" },
  { check: "Meta Level", status: "L2", variant: "accent" as const, value: "Crowd-aware, not institution-modeled" },
];

/* ── Section Components ───────────────────────────────────── */

export function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">{title}</h3>
      {children}
    </div>
  );
}

interface MarketStateStripProps {
  agents?: { direction: string; confidence: number; current_weight: number }[];
  trapChecks?: { status: string; variant: string; value: string }[];
  forecast?: { scenario_bull_prob: number; scenario_base_prob: number; scenario_bear_prob: number; synthesis_narrative: string; direction: string; direction_confidence: number } | null;
  signalCounts?: { reality: number; data: number; narrative: number; episodes: number; analogs: number; traps: number };
}

export function MarketStateStrip({ agents, trapChecks, forecast, signalCounts }: MarketStateStripProps = {}) {
  // Derive regime from agent consensus
  const agentList = agents ?? [];
  const bearish = agentList.filter((a) => a.direction === "Bearish").length;
  const bullish = agentList.filter((a) => a.direction === "Bullish").length;
  const totalWeight = agentList.reduce((s, a) => s + (a.current_weight || 0), 0);
  const weightedConf = totalWeight > 0
    ? agentList.reduce((s, a) => s + (a.confidence || 0) * (a.current_weight || 0), 0) / totalWeight
    : 0;
  const regimeLabel = bearish >= 3 ? "Late-Cycle Tightening" : bullish >= 3 ? "Risk-On Expansion" : "Transitional";
  const agreeCount = Math.max(bearish, bullish);
  const agreeTotal = agentList.length || 5;

  const trapsActive = (trapChecks ?? []).filter((t) => t.variant === "warning" || t.variant === "danger").length;
  const conf = forecast?.direction_confidence ?? weightedConf / 100;
  const counts = signalCounts;

  return (
    <section data-testid="market-state">
      {/* Regime Card */}
      <Card className="p-5 mb-4">
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex-1 min-w-[200px]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-1">Current Regime</p>
            <p className="text-lg font-bold text-bm-text">{regimeLabel}</p>
            <div className="flex items-center gap-4 mt-2">
              <div>
                <span className="text-[9px] text-bm-muted2 block">Confidence</span>
                <span className="font-mono text-sm text-bm-accent">{(conf * 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-[9px] text-bm-muted2 block">Signal Agreement</span>
                <span className="font-mono text-sm text-bm-text">{agreeCount} / {agreeTotal} aligned</span>
              </div>
              <div>
                <span className="text-[9px] text-bm-muted2 block">Active Traps</span>
                <span className={`font-mono text-sm ${trapsActive > 0 ? "text-amber-400" : "text-emerald-400"}`}>{trapsActive}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-1">Direction</p>
            <p className={`text-lg font-bold font-mono ${bearish > bullish ? "text-red-400" : bullish > bearish ? "text-emerald-400" : "text-amber-400"}`}>
              {bearish > bullish ? "Bearish Lean" : bullish > bearish ? "Bullish Lean" : "Mixed"}
            </p>
          </div>
        </div>
        {forecast?.synthesis_narrative && (
          <p className="text-xs text-bm-muted mt-3 leading-relaxed">{forecast.synthesis_narrative}</p>
        )}
      </Card>

      {/* Decision Basis Strip */}
      {counts && (
        <div className="flex flex-wrap items-center gap-4 px-2 mb-4 text-[10px] text-bm-muted2">
          <span className="font-mono">{counts.reality + counts.data + counts.narrative} signals ingested</span>
          <span className="text-bm-border">|</span>
          <span className="font-mono">{counts.episodes} episodes compared</span>
          <span className="text-bm-border">|</span>
          <span className="font-mono">{counts.analogs} analogs surfaced</span>
          <span className="text-bm-border">|</span>
          <span className="font-mono">{counts.traps} trap checks active</span>
          <span className="text-bm-border">|</span>
          <span className="font-mono">last refresh: {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        </div>
      )}
    </section>
  );
}

export function DecisionLayer({ agentData: propAgents }: { agentData?: typeof agentData } = {}) {
  const agents = propAgents ?? agentData;
  const bearishCount = agents.filter(a => a.dir === "Bearish").length;
  const totalConf = agents.reduce((s, a) => s + a.conf * a.wt, 0) / agents.reduce((s, a) => s + a.wt, 0);
  const trapsActive = trapChecks.filter(t => t.variant === "warning" || t.variant === "danger").length;

  return (
    <section data-testid="decision-layer">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[10px] text-bm-muted2 uppercase tracking-wider">System Bias</p>
            <p className="text-lg font-mono font-bold text-bm-warning">Bearish Lean</p>
          </div>
          <div>
            <p className="text-[10px] text-bm-muted2 uppercase tracking-wider">Confidence</p>
            <p className="text-lg font-mono font-bold text-bm-text">{totalConf.toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-bm-muted2 uppercase tracking-wider">Action</p>
            <p className="text-lg font-mono font-bold text-bm-danger">Reduce Risk</p>
          </div>
          <p className="text-xs text-bm-muted italic flex-1 min-w-[200px]">
            Late cycle with sticky inflation and deteriorating labor. {trapsActive} traps active.
            {bearishCount}/5 agents bearish. Narrative exhaustion on soft landing.
          </p>
        </div>
      </Card>
    </section>
  );
}

interface AnalogForecastProps {
  analogOverlay?: typeof analogOverlay;
  radarDims?: typeof radarDims;
  topMatch?: { matches: Array<{
    episode_name: string; rhyme_score: number; key_similarity: string; key_divergence: string;
    cosine_sim: number; dtw_distance: number; categorical_match: number;
    match_dimensions?: Record<string, number>; what_would_break_it?: string; rank: number;
  }> } | null;
  forecast?: { scenario_bull_prob: number; scenario_base_prob: number; scenario_bear_prob: number; synthesis_narrative: string } | null;
}

export function AnalogForecast({ analogOverlay: propOverlay, radarDims: propRadar, topMatch, forecast }: AnalogForecastProps = {}) {
  const [expandedAnalog, setExpandedAnalog] = useState(0);
  const overlayData = propOverlay ?? analogOverlay;
  const radarData = propRadar ?? radarDims;
  const matches = topMatch?.matches ?? [];
  const topAnalog = matches[0];

  const scenarios = [
    { label: "BULL", prob: forecast ? Math.round(forecast.scenario_bull_prob * 100) : 20, ret: "+12%", variant: "success" as const, note: "Requires dovish pivot + CRE stabilization" },
    { label: "BASE", prob: forecast ? Math.round(forecast.scenario_base_prob * 100) : 52, ret: "-3%", variant: "accent" as const, note: "Grinding chop, data-dependent Fed, slow deterioration" },
    { label: "BEAR", prob: forecast ? Math.round(forecast.scenario_bear_prob * 100) : 28, ret: "-18%", variant: "danger" as const, note: "CRE contagion, credit tightening, positioning unwind" },
  ];

  // Chart line names from actual matches
  const matchNames = matches.map((m) => m.episode_name.split(" ").slice(0, 3).join(" "));
  const analogColors = [CH.purple, CH.red, CH.amber];

  return (
    <section data-testid="analog-forecast">
      <SectionHeader title="Analog Forecast">
        <Badge variant="accent">LIVE</Badge>
      </SectionHeader>

      {/* Top 3 Analogs */}
      <div className="space-y-2 mb-4">
        {(matches.length > 0 ? matches : [{ episode_name: "2022 Rate Cycle", rhyme_score: 0.78, key_similarity: "tightening + leverage stress", key_divergence: "labor market holding longer", cosine_sim: 0.84, dtw_distance: 0.31, categorical_match: 0.65, rank: 1 }]).map((m, idx) => (
          <Card key={m.episode_name} className={`p-4 cursor-pointer transition-all ${expandedAnalog === idx ? "ring-1 ring-bm-accent/40" : ""}`} onClick={() => setExpandedAnalog(idx)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`font-mono text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${idx === 0 ? "bg-bm-accent/20 text-bm-accent" : "bg-bm-surface text-bm-muted2"}`}>
                  {m.rank ?? idx + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-bm-text">{m.episode_name}</p>
                  {expandedAnalog !== idx && (
                    <p className="text-[10px] text-bm-muted mt-0.5">{m.key_similarity}</p>
                  )}
                </div>
              </div>
              <p className="text-xl font-bold font-mono text-bm-accent">{m.rhyme_score.toFixed(2)}</p>
            </div>

            {/* Expanded: score breakdown + reasoning */}
            {expandedAnalog === idx && (
              <div className="mt-4 space-y-3">
                {/* Score breakdown bars */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Structural", score: m.cosine_sim, desc: "Cosine similarity" },
                    { label: "Path", score: 1 - m.dtw_distance, desc: "1 - DTW distance" },
                    { label: "Context", score: m.categorical_match, desc: "Regime + category" },
                  ].map((bar) => (
                    <div key={bar.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-bm-muted2 uppercase">{bar.label}</span>
                        <span className="text-[10px] font-mono text-bm-muted">{(bar.score * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-bm-bg overflow-hidden">
                        <div className="h-full rounded-full bg-bm-accent/60" style={{ width: `${bar.score * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Match dimensions if available */}
                {m.match_dimensions && (
                  <div>
                    <p className="text-[9px] text-bm-muted2 uppercase tracking-wider mb-2">Dimension Scores</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(m.match_dimensions).map(([dim, score]) => (
                        <span key={dim} className="inline-flex items-center gap-1 bg-bm-surface/40 rounded px-2 py-1 text-[10px]">
                          <span className="text-bm-muted2">{dim}</span>
                          <span className={`font-mono ${score >= 0.75 ? "text-emerald-400" : score >= 0.6 ? "text-amber-400" : "text-red-400"}`}>{(score * 100).toFixed(0)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Why matched / What's different */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-bm-surface/20 rounded-lg p-3">
                    <p className="text-[9px] text-emerald-400 uppercase tracking-wider mb-1">Why This Matched</p>
                    <p className="text-xs text-bm-text leading-relaxed">{m.key_similarity}</p>
                  </div>
                  <div className="bg-bm-surface/20 rounded-lg p-3">
                    <p className="text-[9px] text-amber-400 uppercase tracking-wider mb-1">Key Differences</p>
                    <p className="text-xs text-bm-text leading-relaxed">{m.key_divergence}</p>
                  </div>
                </div>

                {/* What would break it */}
                {m.what_would_break_it && (
                  <div className="bg-bm-surface/20 rounded-lg p-3">
                    <p className="text-[9px] text-red-400 uppercase tracking-wider mb-1">What Would Break This Analog</p>
                    <p className="text-xs text-bm-text leading-relaxed">{m.what_would_break_it}</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Scenario probabilities */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {scenarios.map(s => (
          <Card key={s.label} className="p-4 text-center">
            <Badge variant={s.variant} className="mb-2">{s.label}</Badge>
            <p className="text-2xl font-bold font-mono text-bm-text">{s.prob}%</p>
            <p className="text-xs text-bm-text mt-1">{s.ret}</p>
            <p className="text-[10px] text-bm-muted2 mt-2 leading-relaxed">{s.note}</p>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Trajectory Overlay</p>
            <Badge>60-DAY</Badge>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={overlayData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="day" tick={AXIS_TICK_STYLE} tickLine={false} axisLine={{ stroke: CH.grid }} />
              <YAxis tick={AXIS_TICK_STYLE} tickLine={false} axisLine={{ stroke: CH.grid }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="current" stroke={CH.cyan} strokeWidth={2.5} dot={false} name="Current" />
              <Line type="monotone" dataKey="crypto22" stroke={analogColors[0]} strokeWidth={1.5} strokeDasharray="6 3" dot={false} name={matchNames[0] ?? "Analog 1"} opacity={0.7} />
              <Line type="monotone" dataKey="gfc" stroke={analogColors[1]} strokeWidth={1.5} strokeDasharray="4 4" dot={false} name={matchNames[1] ?? "Analog 2"} opacity={0.7} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">5-Layer Dimensional Match</p>
            <Badge variant="accent">RADAR</Badge>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={CH.grid} />
              <PolarAngleAxis dataKey="d" tick={{ fill: CH.axis, fontSize: 9 }} />
              <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 1]} />
              <Radar name="Current" dataKey="current" stroke={CH.cyan} fill={CH.cyan} fillOpacity={0.12} strokeWidth={2} />
              <Radar name={matchNames[1] ?? "GFC"} dataKey="gfc" stroke={CH.red} fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
              <Radar name={matchNames[0] ?? "Crypto 22"} dataKey="crypto22" stroke={CH.purple} fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </section>
  );
}

interface PositioningSectionProps {
  positioningData?: typeof positioningData;
  agentData?: typeof agentData;
  trapChecks?: typeof trapChecks;
}

export function PositioningSection({ positioningData: propPos, agentData: propAgents, trapChecks: propTraps }: PositioningSectionProps = {}) {
  const posData = propPos ?? positioningData;
  const agentRows = propAgents ?? agentData;
  const trapRows = propTraps ?? trapChecks;
  return (
    <section data-testid="positioning-traps">
      <SectionHeader title="Positioning & Traps">
        <Badge variant="accent">LIVE</Badge>
      </SectionHeader>

      {/* Crowding heatmap */}
      <Card className="p-4 mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-3">Crowding Heatmap</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {posData.map(p => {
            const crowdColor = p.crowding > 80 ? "text-red-400" : p.crowding > 60 ? "text-amber-400" : p.crowding > 40 ? "text-sky-400" : "text-emerald-400";
            return (
              <div key={p.asset + p.metric} className="rounded-lg border border-bm-border/70 bg-bm-surface/20 p-3 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-bm-text">{p.asset}</span>
                  {p.extreme && <Badge variant="danger">EXTREME</Badge>}
                </div>
                <div className="flex gap-4 text-xs">
                  <div>
                    <span className="text-bm-muted2 block text-[9px]">{p.metric}</span>
                    <span className="font-mono text-bm-text">{p.value}</span>
                  </div>
                  <div>
                    <span className="text-bm-muted2 block text-[9px]">Direction</span>
                    <span className={`font-mono ${crowdColor}`}>{p.direction}</span>
                  </div>
                  <div className="ml-auto text-right">
                    <span className="text-bm-muted2 block text-[9px]">Crowding</span>
                    <span className={`text-lg font-bold font-mono ${crowdColor}`}>{p.crowding}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Agent consensus + Trap detector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Agent Consensus</p>
            <Badge>5 AGENTS</Badge>
          </div>
          <div className="grid grid-cols-[70px_60px_40px_40px_40px] text-[9px] text-bm-muted2 pb-1">
            <span>Agent</span><span>Dir</span><span>Conf</span><span>Brier</span><span>Wt</span>
          </div>
          {agentRows.map(a => (
            <div key={a.agent} className="grid grid-cols-[70px_60px_40px_40px_40px] py-1.5 border-b border-bm-border/50 items-center">
              <span className="text-xs font-semibold text-bm-text">{a.agent}</span>
              <span className={`text-[10px] font-bold ${a.dir === "Bullish" ? "text-emerald-400" : a.dir === "Bearish" ? "text-red-400" : a.dir === "TRAP" ? "text-amber-400" : "text-bm-muted"}`}>{a.dir}</span>
              <span className="font-mono text-xs text-bm-muted">{a.conf}%</span>
              <span className={`font-mono text-xs ${a.brier < 0.2 ? "text-emerald-400" : "text-bm-muted"}`}>{a.brier}</span>
              <span className="font-mono text-xs text-bm-muted2">{a.wt}%</span>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Trap Detector</p>
            <Badge variant="danger">6 CHECKS</Badge>
          </div>
          {trapRows.map(t => (
            <div key={t.check} className="flex items-center justify-between py-1.5 border-b border-bm-border/50">
              <span className="text-xs font-semibold text-bm-text">{t.check}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-bm-muted2">{t.value}</span>
                <Badge variant={t.variant}>{t.status}</Badge>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </section>
  );
}

interface SignalStackProps {
  realitySignals?: RealitySignal[];
  dataSignals?: DataSignal[];
  narrativeState?: NarrativeItem[];
}

export function SignalStack({ realitySignals: propReality, dataSignals: propData, narrativeState: propNarrative }: SignalStackProps = {}) {
  const [open, setOpen] = useState(true);
  const realityRows: RealitySignal[] = propReality ?? realitySignals;
  const dataRows: DataSignal[] = propData ?? dataSignals;
  const narrativeRows: NarrativeItem[] = propNarrative ?? narrativeState;

  return (
    <section data-testid="signal-stack">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bm-glass rounded-lg p-4 text-left transition-colors hover:bg-bm-surface/40"
      >
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Signal Layers</h3>
          <p className="text-xs text-bm-muted mt-1">
            {realityRows.length + dataRows.length + narrativeRows.length} signals across reality, data, and narrative layers
          </p>
        </div>
        <span className="text-bm-muted2 text-sm ml-4 shrink-0">{open ? "Collapse" : "Expand"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Reality Layer */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Reality (Pre-Data Behavioral Signals)</p>
              </div>
              <Badge variant="success">LIVE</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] text-bm-muted2 border-b border-bm-border/50">
                    <th className="text-left py-1 pr-3 font-normal">Signal</th>
                    <th className="text-right py-1 px-3 font-normal">Current</th>
                    <th className="text-right py-1 px-3 font-normal">Z-Score</th>
                    <th className="text-right py-1 px-3 font-normal">Delta</th>
                    <th className="text-left py-1 px-3 font-normal">Direction</th>
                    <th className="text-right py-1 pl-3 font-normal">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {realityRows.map(s => {
                    const z = s.zScore ?? s.accel;
                    const zColor = z <= -1.5 ? "text-red-400" : z >= 1.5 ? "text-emerald-400" : "text-bm-muted";
                    const delta = s.delta;
                    const deltaColor = delta != null ? (delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-bm-muted2") : "text-bm-muted2";
                    const dateStr = s.signalDate ? new Date(s.signalDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
                    return (
                      <tr key={s.signal} className="border-b border-bm-border/30">
                        <td className="py-2 pr-3">
                          <span className="font-semibold text-bm-text">{s.signal}</span>
                          <span className="ml-2 text-[9px] text-bm-muted2">{s.domain}</span>
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${s.value > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {s.value > 0 ? "+" : ""}{s.value}%
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${zColor}`}>
                          {z > 0 ? "+" : ""}{z.toFixed(1)}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${deltaColor}`}>
                          {delta != null ? `${delta > 0 ? "\u2191" : delta < 0 ? "\u2193" : "\u2192"} ${Math.abs(delta).toFixed(1)}` : "—"}
                        </td>
                        <td className="py-2 px-3 font-mono text-bm-muted">{s.trend}</td>
                        <td className="py-2 pl-3 text-right text-bm-muted2">{dateStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Data Layer */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Data (Reported Metrics + Surprises)</p>
              </div>
              <Badge>BATCH</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] text-bm-muted2 border-b border-bm-border/50">
                    <th className="text-left py-1 pr-3 font-normal">Metric</th>
                    <th className="text-right py-1 px-3 font-normal">Reported</th>
                    <th className="text-right py-1 px-3 font-normal">Expected</th>
                    <th className="text-right py-1 px-3 font-normal">Surprise</th>
                    <th className="text-left py-1 px-3 font-normal">Trend</th>
                    <th className="text-left py-1 px-3 font-normal">Revision</th>
                    <th className="text-right py-1 pl-3 font-normal">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map(d => {
                    const dateStr = d.signalDate ? new Date(d.signalDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
                    return (
                      <tr key={d.metric} className="border-b border-bm-border/30">
                        <td className="py-1.5 pr-3 font-semibold text-bm-text">{d.metric}</td>
                        <td className="py-1.5 px-3 text-right font-mono text-bm-muted">{d.reported}</td>
                        <td className="py-1.5 px-3 text-right font-mono text-bm-muted2">{d.expected}</td>
                        <td className={`py-1.5 px-3 text-right font-mono ${d.surprise > 0 ? "text-red-400" : "text-emerald-400"}`}>{d.surprise > 0 ? "+" : ""}{d.surprise}</td>
                        <td className="py-1.5 px-3 font-mono text-bm-muted">{d.trend}</td>
                        <td className={`py-1.5 px-3 font-mono ${d.revision !== "none" ? "text-amber-400" : "text-bm-muted2"}`}>{d.revision}</td>
                        <td className="py-1.5 pl-3 text-right text-bm-muted2">{dateStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Narrative Layer */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Narrative (Lifecycle + Crowding)</p>
              </div>
              <Badge variant="warning">NLP</Badge>
            </div>
            <div className="space-y-1.5">
              {narrativeRows.map(n => (
                <div key={n.label} className="flex items-center gap-3 rounded-lg bg-bm-surface/20 p-2.5">
                  <div className="w-[130px] shrink-0">
                    <span className="text-xs font-semibold text-bm-text">{n.label}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-bm-bg overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${n.intensity}%` }} />
                    </div>
                    <span className="font-mono text-xs text-amber-400 w-7 text-right">{n.intensity}</span>
                  </div>
                  <div className="text-center w-14">
                    <span className="text-[9px] text-bm-muted2 block">Vel</span>
                    <span className={`font-mono text-xs ${n.velocity > 0 ? "text-emerald-400" : "text-red-400"}`}>{n.velocity > 0 ? "+" : ""}{n.velocity}</span>
                  </div>
                  <div className="w-20 text-center">
                    <Badge variant={n.lifecycle === "exhaustion" ? "danger" : n.lifecycle === "crowded" ? "warning" : "success"}>{n.lifecycle}</Badge>
                  </div>
                  <div className="text-center w-12">
                    <span className="text-[9px] text-bm-muted2 block">Crowd</span>
                    <span className={`font-mono text-xs ${n.crowding > 70 ? "text-red-400" : "text-bm-muted"}`}>{n.crowding}</span>
                  </div>
                  <div className="text-center w-12">
                    <span className="text-[9px] text-bm-muted2 block">Manip</span>
                    <span className={`font-mono text-xs ${n.manipulation > 0.4 ? "text-red-400" : "text-bm-muted2"}`}>{n.manipulation.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}

/* ── Compact Trap / Adversarial Card ──────────────────────── */

interface TrapSummaryCardProps {
  trapChecks?: Array<{ check: string; status: string; variant: string; value: string }>;
}

export function TrapSummaryCard({ trapChecks: checks }: TrapSummaryCardProps = {}) {
  if (!checks || checks.length === 0) return null;

  const variantColor: Record<string, string> = {
    success: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-red-400",
    accent: "text-bm-accent",
  };
  const variantDot: Record<string, string> = {
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-red-400",
    accent: "bg-bm-accent",
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Adversarial Check</p>
        <Badge variant="warning">ACTIVE</Badge>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {checks.map((t) => (
          <div key={t.check} className="flex items-center gap-2 bg-bm-surface/20 rounded-lg px-3 py-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${variantDot[t.variant] ?? "bg-bm-muted2"}`} />
            <div className="min-w-0">
              <p className="text-[10px] text-bm-muted2 truncate">{t.check}</p>
              <p className={`text-xs font-mono truncate ${variantColor[t.variant] ?? "text-bm-muted"}`}>{t.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface SupportingDetailProps {
  mismatchData?: typeof mismatchData;
  silenceEvents?: typeof silenceEvents;
  brierHist?: typeof brierHist;
}

export function SupportingDetail({ mismatchData: propMismatch, silenceEvents: propSilence, brierHist: propBrier }: SupportingDetailProps = {}) {
  const [open, setOpen] = useState(true);
  const mismatchRows = propMismatch ?? mismatchData;
  const silenceRows = propSilence ?? silenceEvents;
  const brierRows = propBrier ?? brierHist;

  return (
    <section data-testid="supporting-detail">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bm-glass rounded-lg p-4 text-left transition-colors hover:bg-bm-surface/40"
      >
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Supporting Detail</h3>
          <p className="text-xs text-bm-muted mt-1">
            Mismatch engine, silence detector, and calibration metrics.
          </p>
        </div>
        <span className="text-bm-muted2 text-sm ml-4 shrink-0">{open ? "Collapse" : "Expand"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Mismatch Engine */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Mismatch Engine</p>
              <Badge variant="danger">DIVERGENCE</Badge>
            </div>
            <div className="space-y-3">
              {mismatchRows.map(m => (
                <div key={m.topic} className={`rounded-lg border p-3 bg-bm-surface/20 ${m.mismatch > 0.7 ? "border-red-400/30" : "border-bm-border/70"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-bm-text">{m.topic}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-bm-muted2">MISMATCH</span>
                      <span className={`text-sm font-bold font-mono ${m.mismatch > 0.7 ? "text-red-400" : m.mismatch > 0.5 ? "text-amber-400" : "text-emerald-400"}`}>{m.mismatch.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { layer: "reality", text: m.reality },
                      { layer: "data", text: m.data },
                      { layer: "narrative", text: m.narrative },
                    ] as const).map(l => (
                      <div key={l.layer} className={`rounded-md bg-bm-surface/30 p-2 border-l-2 ${l.layer === "reality" ? "border-emerald-500" : l.layer === "data" ? "border-sky-400" : "border-amber-400"}`}>
                        <div className="flex items-center gap-1 mb-1">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${LAYER_CLASSES[l.layer]?.dot}`} />
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${LAYER_CLASSES[l.layer]?.text}`}>{l.layer}</span>
                        </div>
                        <p className="text-xs text-bm-text leading-relaxed">{l.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Silence Detector */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Silence Detector</p>
              <Badge>SCAN</Badge>
            </div>
            <p className="text-[10px] text-bm-muted2 mb-3">Narratives that were dominant and suddenly went quiet - often signals that positioning is complete.</p>
            {silenceRows.map(s => (
              <div key={s.label} className="flex items-center gap-3 py-2 border-b border-bm-border/30">
                <div className="flex-1">
                  <span className="text-xs font-semibold text-bm-text">{s.label}</span>
                </div>
                <div className="w-24">
                  <div className="h-1.5 flex items-center"><div className="h-1 rounded bg-amber-400/50" style={{ width: `${s.priorIntensity}%` }} /></div>
                  <div className="h-1.5 flex items-center"><div className="h-1 rounded bg-pink-400" style={{ width: `${s.currentIntensity}%` }} /></div>
                  <div className="flex justify-between text-[8px] text-bm-muted2"><span>Before</span><span>Now</span></div>
                </div>
                <span className="font-mono text-xs text-red-400 w-10 text-right">{s.dropoff}%</span>
                <div className="text-right w-16">
                  <span className="text-[9px] text-bm-muted2 block">Signif.</span>
                  <span className={`font-mono text-xs ${s.significance > 0.8 ? "text-red-400" : "text-amber-400"}`}>{s.significance.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </Card>

          {/* Brier Calibration */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">Brier Score Calibration</p>
              <Badge variant="success">24W ROLLING</Badge>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={brierRows} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="w" tick={AXIS_TICK_STYLE} tickLine={false} axisLine={{ stroke: CH.grid }} interval={3} />
                <YAxis tick={AXIS_TICK_STYLE} tickLine={false} axisLine={{ stroke: CH.grid }} domain={[0.05, 0.35]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="base" stroke={CH.red} fill={CH.red} fillOpacity={0.04} strokeDasharray="4 4" name="Coin Flip" />
                <Area type="monotone" dataKey="agg" stroke={CH.cyan} fill={CH.cyan} fillOpacity={0.08} strokeWidth={2} name="Aggregate" />
                <Line type="monotone" dataKey="narrative" stroke={CH.green} strokeWidth={1} dot={false} name="Narrative Agent" opacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-bm-muted2 mt-2">Lower = better. Red dashed = 50/50 coin flip. Target: &lt;0.20</p>
          </Card>

          {/* Model Track Record Strip */}
          <div className="flex flex-wrap items-center gap-4 px-3 py-3 bg-bm-surface/20 rounded-lg text-[10px]">
            <span className="font-bold uppercase tracking-wider text-bm-muted2">Model Track Record</span>
            <span className="text-bm-border">|</span>
            <span className="text-bm-text">30-day accuracy: <span className="font-mono text-emerald-400">61%</span></span>
            <span className="text-bm-border">|</span>
            <span className="text-bm-text">Baseline: <span className="font-mono text-bm-muted">50%</span></span>
            <span className="text-bm-border">|</span>
            <span className="text-bm-text">Brier score: <span className="font-mono text-bm-accent">0.21</span></span>
            <span className="text-bm-border">|</span>
            <span className="text-bm-text">Predictions resolved: <span className="font-mono text-bm-muted">24</span></span>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Main Export ───────────────────────────────────────────── */

export function HistoryRhymesTab() {
  const [episodeCount, setEpisodeCount] = useState<number | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRhymesEpisodes({ limit: 20 })
      .then((result) => {
        if (cancelled) return;
        setEpisodeCount(result.count);
        setErrorNote(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setEpisodeCount(null);
        const message =
          err instanceof RhymesClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unable to reach the rhymes backend.";
        setErrorNote(message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subcomponents still read fixture data, so banner stays "preview" until
  // they're wired to real backend responses.
  const bannerState: HistoryRhymesDataState = "preview";

  return (
    <div className="space-y-6 text-bm-text" data-testid="command-center">
      <HistoryRhymesDataStateBanner
        state={bannerState}
        episodeCount={episodeCount ?? undefined}
        errorNote={errorNote}
      />
      <MarketStateStrip />
      <DecisionLayer />
      <AnalogForecast />
      <PositioningSection />
      <SignalStack />
      <SupportingDetail />
    </div>
  );
}

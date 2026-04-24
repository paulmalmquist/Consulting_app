"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  fmtCompact,
  getAxisTickStyle,
  getChartColors,
  getGridStyle,
  getTooltipStyle,
} from "@/components/charts/chart-theme";
import { DissensusPanel } from "@/components/history-rhymes/DissensusPanel";
import type { DecisionEngineResult } from "@/components/market/hooks/useDecisionEngine";
import {
  CreditBreakdownPanel,
  VolatilityDivergencePanel,
} from "@/components/market/ResearchStateCards";
import type {
  ClosedPortfolioPosition,
  OpenPortfolioPosition,
  PortfolioAttribution,
  PortfolioOverview,
  PortfolioSnapshotPoint,
} from "@/lib/trades/types";

export type PortfolioRangeKey = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

interface MarketsHomeSurfaceProps {
  envId: string;
  overview: PortfolioOverview | null;
  history: PortfolioSnapshotPoint[];
  openPositions: OpenPortfolioPosition[];
  attribution: PortfolioAttribution | null;
  decisionEngine: DecisionEngineResult;
  loading: boolean;
  error: string | null;
  rangeKey: PortfolioRangeKey;
  onRangeChange: (next: PortfolioRangeKey) => void;
}

interface PaperPortfolioSurfaceProps {
  overview: PortfolioOverview | null;
  history: PortfolioSnapshotPoint[];
  openPositions: OpenPortfolioPosition[];
  closedPositions: ClosedPortfolioPosition[];
  attribution: PortfolioAttribution | null;
  loading: boolean;
  error: string | null;
  rangeKey: PortfolioRangeKey;
  onRangeChange: (next: PortfolioRangeKey) => void;
}

const RANGE_ITEMS: PortfolioRangeKey[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"];

function money(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

function pct(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(2)}%`;
}

function fmtDateLabel(value: string): string {
  const d = new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function seedBadge(label?: string | null) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
      {label}
    </span>
  );
}

function StaleBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      {value}
    </div>
  );
}

function KpiCard({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function buildChartRows(history: PortfolioSnapshotPoint[]) {
  if (history.length === 0) return [];
  const first = history[0];
  const basePortfolio = Number(first.portfolio_value || 0);
  const baseSpy = Number(first.benchmark_spy || 0);
  const baseBtc = Number(first.benchmark_btc || 0);
  return history.map((row) => ({
    ...row,
    label: fmtDateLabel(row.as_of),
    normalized_portfolio:
      basePortfolio > 0 ? Number((((row.portfolio_value - basePortfolio) / basePortfolio) * 100).toFixed(2)) : 0,
    normalized_spy:
      baseSpy > 0 && row.benchmark_spy != null ? Number((((row.benchmark_spy - baseSpy) / baseSpy) * 100).toFixed(2)) : null,
    normalized_btc:
      baseBtc > 0 && row.benchmark_btc != null ? Number((((row.benchmark_btc - baseBtc) / baseBtc) * 100).toFixed(2)) : null,
  }));
}

// ── Action posture badge ──────────────────────────────────────────────────────

type Posture = "deploy" | "reduce" | "hold" | "paper_only" | "abstain" | string;

function postureMeta(posture: Posture): { label: string; tone: string; bg: string } {
  switch (posture) {
    case "deploy":
      return { label: "DEPLOY", tone: "text-emerald-100", bg: "border-emerald-400/30 bg-emerald-500/15" };
    case "reduce":
      return { label: "REDUCE", tone: "text-rose-100", bg: "border-rose-400/30 bg-rose-500/15" };
    case "hold":
      return { label: "HOLD", tone: "text-amber-100", bg: "border-amber-400/30 bg-amber-500/15" };
    case "paper_only":
      return { label: "PAPER ONLY", tone: "text-sky-100", bg: "border-sky-400/30 bg-sky-500/15" };
    case "abstain":
    default:
      return { label: posture.replaceAll("_", " ").toUpperCase(), tone: "text-slate-200", bg: "border-white/15 bg-white/5" };
  }
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.32em] text-emerald-200/60">{children}</div>;
}

// ── ChangeDeltaStrip ──────────────────────────────────────────────────────────

function ChangeDeltaStrip({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
        No confidence deltas since last run.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.slice(0, 4).map((item, i) => (
        <div key={i} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
          <span className="text-sm leading-6 text-slate-200">{item}</span>
        </div>
      ))}
    </div>
  );
}

// ── AnalogSummary ─────────────────────────────────────────────────────────────

function AnalogSummary({
  analogs,
  topAnalogName,
  divergenceNote,
}: {
  analogs: Array<{ episode_name: string; rhyme_score: number; rank: number; key_similarity: string; key_divergence: string }>;
  topAnalogName?: string | null;
  divergenceNote?: string | null;
}) {
  if (analogs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-slate-400">
        No analog matches available yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {analogs.map((analog) => (
        <div key={`${analog.episode_name}-${analog.rank}`} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-white">{analog.episode_name}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                Rhyme {analog.rhyme_score.toFixed(2)} · Rank {analog.rank}
              </div>
            </div>
            <div
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                analog.rhyme_score >= 0.85
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  : analog.rhyme_score >= 0.65
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              {analog.rhyme_score >= 0.85 ? "Confirmed" : analog.rhyme_score >= 0.65 ? "Partial" : "Weak"}
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Rhymes</div>
              <div className="mt-1.5 text-sm leading-6 text-slate-200">{analog.key_similarity}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Diverges</div>
              <div className="mt-1.5 text-sm leading-6 text-slate-200">
                {topAnalogName === analog.episode_name && divergenceNote ? divergenceNote : analog.key_divergence}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main surface ──────────────────────────────────────────────────────────────

export function MarketsHomeSurface({
  envId,
  overview,
  history,
  openPositions,
  attribution,
  decisionEngine,
  loading,
  error,
  rangeKey,
  onRangeChange,
}: MarketsHomeSurfaceProps) {
  const colors = getChartColors();
  const chartRows = useMemo(() => buildChartRows(history), [history]);
  const [showSpy, setShowSpy] = useState(true);
  const [showBtc, setShowBtc] = useState(true);

  const topAnalogs = decisionEngine.raw?.analogs.topMatch?.matches?.slice(0, 3) ?? [];
  const researchState = (decisionEngine.raw?.researchState as Record<string, unknown> | null) ?? null;
  const deterministicDecision = decisionEngine.raw?.deterministicDecision ?? null;
  const confidenceDelta = decisionEngine.raw?.confidenceDelta ?? null;
  const topBar = decisionEngine.raw?.topBar ?? null;
  const systemWarnings = decisionEngine.raw?.systemWarnings ?? [];
  const whatChanged = decisionEngine.raw?.whatChanged ?? [];
  const scenarioDistribution = decisionEngine.raw?.scenarioDistribution ?? null;
  const volatility = ((researchState?.volatility_regime_json as Record<string, unknown>) ?? null) as {
    vix_level?: number | null;
    move_level?: number | null;
    vol_divergence_score?: number | null;
  } | null;
  const credit = ((researchState?.credit_regime_json as Record<string, unknown>) ?? null) as {
    cre_stress?: number;
    corporate_stress?: number;
    consumer_stress?: number;
  } | null;

  if (loading) {
    return <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-8 text-slate-300">Loading portfolio decision surface…</div>;
  }

  if (error) {
    return <div className="rounded-[28px] border border-rose-400/30 bg-rose-500/10 p-8 text-rose-100">{error}</div>;
  }

  if (!overview) {
    return <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-8 text-slate-300">No BOS portfolio data is available yet for this business.</div>;
  }

  const hero = overview.hero;
  const decision = overview.decision;
  const realizedVsUnrealized = attribution?.realized_vs_unrealized ?? {};
  const bestContributors = (attribution?.best_contributors ?? []) as Array<Record<string, unknown>>;
  const worstContributors = (attribution?.worst_contributors ?? []) as Array<Record<string, unknown>>;

  const rawPosture = String(deterministicDecision?.action_posture ?? decision.action_posture ?? "paper_only");
  const pm = postureMeta(rawPosture);
  const sizeMultiplier = Number(deterministicDecision?.size_multiplier ?? decision.size_multiplier ?? 0);
  const confidence = Number(topBar?.confidence ?? decision.confidence ?? 0);
  const regime = String(topBar?.regimeLabel ?? decision.current_regime ?? "Unknown");
  const postureReasons = (deterministicDecision?.action_posture_reasons ?? decision.action_posture_reasons ?? []) as string[];

  return (
    <div className="space-y-8">

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* SECTION 1 — PORTFOLIO + DECISION HERO                               */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel>Markets · Decision Engine</SectionLabel>
              {seedBadge(hero.seed_mode_label)}
            </div>
            <h1 className="mt-3 font-serif text-4xl tracking-tight text-white">What is happening? What should I do?</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Five seconds to a decision. Portfolio performance, machine posture, confidence, and the one thing that would break it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/lab/env/${envId}/markets/portfolio`} className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
              Paper Portfolio
            </Link>
            <Link href={`/lab/env/${envId}/markets/execution`} className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/20">
              Execution Workspace
            </Link>
            <Link href={`/lab/env/${envId}/markets/podcast-intel`} className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-500/20">
              Podcast Intelligence
            </Link>
          </div>
        </div>

        {/* Equity curve + decision column */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.75fr_0.95fr]">
          {/* Left — equity curve */}
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Equity Curve</div>
                <div className="mt-2 text-4xl font-semibold text-white">{money(hero.portfolio_value)}</div>
                <div className="mt-1 text-sm text-slate-400">As of {hero.as_of ? new Date(hero.as_of).toLocaleString() : "latest available snapshot"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {RANGE_ITEMS.map((item) => (
                  <button
                    key={item}
                    onClick={() => onRangeChange(item)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                      rangeKey === item
                        ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100"
                        : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setShowSpy((c) => !c)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                  showSpy ? "border-sky-300/40 bg-sky-500/10 text-sky-100" : "border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                SPY
              </button>
              <button
                onClick={() => setShowBtc((c) => !c)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                  showBtc ? "border-amber-300/40 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                BTC-USD
              </button>
            </div>
            <div className="mt-5 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows}>
                  <CartesianGrid vertical={false} {...getGridStyle()} />
                  <XAxis dataKey="label" tick={getAxisTickStyle()} axisLine={false} tickLine={false} />
                  <YAxis tick={getAxisTickStyle()} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={54} />
                  <Tooltip
                    contentStyle={getTooltipStyle()}
                    formatter={(v: number | string, name: string) => [
                      typeof v === "number" ? `${v.toFixed(2)}%` : v,
                      name === "normalized_portfolio" ? "Portfolio" : name === "normalized_spy" ? "SPY" : "BTC-USD",
                    ]}
                  />
                  <Line type="monotone" dataKey="normalized_portfolio" stroke={colors.primary} strokeWidth={3} dot={false} name="Portfolio" />
                  {showSpy ? <Line type="monotone" dataKey="normalized_spy" stroke={colors.secondary} strokeWidth={2} dot={false} name="SPY" /> : null}
                  {showBtc ? <Line type="monotone" dataKey="normalized_btc" stroke={colors.warning} strokeWidth={2} dot={false} name="BTC-USD" /> : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
              <KpiCard label="Day P&L" value={money(hero.day_pnl)} tone={hero.day_pnl >= 0 ? "text-emerald-300" : "text-rose-300"} />
              <KpiCard label="Total P&L" value={money(hero.total_pnl)} tone={hero.total_pnl >= 0 ? "text-emerald-300" : "text-rose-300"} />
              <KpiCard label="Total Return" value={pct(hero.total_return_pct)} tone={hero.total_return_pct >= 0 ? "text-emerald-300" : "text-rose-300"} />
              <KpiCard label="vs SPY" value={pct(hero.benchmark_relative_return_pct)} tone={(hero.benchmark_relative_return_pct ?? 0) >= 0 ? "text-sky-200" : "text-rose-300"} />
              <KpiCard label="Unrealized" value={money(hero.unrealized_pnl)} />
              <KpiCard label="Realized" value={money(hero.realized_pnl)} />
              <KpiCard label="Net Exposure" value={money(hero.net_exposure)} />
              <KpiCard label="Max Drawdown" value={pct(-hero.max_drawdown_pct)} tone="text-amber-200" />
            </div>
          </div>

          {/* Right — posture + dissensus-aware confidence */}
          <div className="space-y-4">
            {/* Regime + posture hero */}
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Regime</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{regime}</div>
                </div>
                <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${pm.bg} ${pm.tone}`}>
                  {pm.label}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Confidence</div>
                  <div className="mt-1.5 text-3xl font-semibold text-white">{confidence.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Size multiplier</div>
                  <div className="mt-1.5 text-2xl font-semibold text-slate-100">{sizeMultiplier.toFixed(2)}×</div>
                </div>
              </div>
              {postureReasons.length > 0 && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm leading-6 text-slate-300">
                  {postureReasons.join("; ")}
                </div>
              )}
            </div>

            {/* Confidence delta — why it moved */}
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Why confidence moved</div>
              <div className="mt-1 text-sm text-slate-500">
                {confidenceDelta?.delta_points != null
                  ? `Δ ${Number(confidenceDelta.delta_points) >= 0 ? "+" : ""}${Number(confidenceDelta.delta_points).toFixed(1)} pts since last run`
                  : "No delta data yet"}
              </div>
              <div className="mt-3">
                <ChangeDeltaStrip items={(confidenceDelta?.reasons ?? []) as string[]} />
              </div>
            </div>

            {/* Scenario probabilities */}
            <div className="grid gap-3 md:grid-cols-3">
              <KpiCard label="Bull" value={pct(((scenarioDistribution?.bull ?? decision.bull_probability ?? 0) as number) * 100)} />
              <KpiCard label="Base" value={pct(((scenarioDistribution?.base ?? decision.base_probability ?? 0) as number) * 100)} />
              <KpiCard label="Bear" value={pct(((scenarioDistribution?.bear ?? decision.bear_probability ?? 0) as number) * 100)} />
            </div>
          </div>
        </div>

        <StaleBadge value={hero.stale_warning} />
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* SECTION 2 — WHY (MODEL INTELLIGENCE)                                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-xl shadow-black/20 backdrop-blur">
        <SectionLabel>Why · Model Intelligence</SectionLabel>
        <h2 className="mt-2 font-serif text-2xl tracking-tight text-white">What does the system believe and why?</h2>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          {/* Dissensus panel — agent disagreement */}
          <div>
            <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">Agent Dissensus</div>
            <DissensusPanel symbol="SPX" horizon="1m" />
          </div>

          {/* Analog summary */}
          <div>
            <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">Top Analogs</div>
            <AnalogSummary
              analogs={topAnalogs}
              topAnalogName={decision.top_analog_name}
              divergenceNote={decision.divergence_note}
            />
          </div>
        </div>

        {/* ChangeDeltaStrip — full width */}
        <div className="mt-6">
          <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">What Changed This Run</div>
          <ChangeDeltaStrip items={whatChanged as string[]} />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* SECTION 3 — RISK / ADVERSARIAL LAYER                                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-xl shadow-black/20 backdrop-blur">
        <SectionLabel>Risk · Adversarial Layer</SectionLabel>
        <h2 className="mt-2 font-serif text-2xl tracking-tight text-white">Where could this be wrong?</h2>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          {/* Trap warning */}
          <div className="rounded-[28px] border border-amber-400/20 bg-amber-500/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300/70">Trap Detection</div>
            <div className="mt-3 text-sm leading-7 text-amber-50">
              {decision.trap_warning ?? "No active trap warning on the current regime view."}
            </div>
          </div>

          {/* Adversarial view / red team */}
          <div className="rounded-[28px] border border-rose-400/20 bg-rose-500/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-rose-300/70">Red Team</div>
            <div className="mt-3 text-sm leading-7 text-rose-50">
              {decisionEngine.raw?.adversarialView ?? "Adversarial view is not available yet."}
            </div>
          </div>

          {/* System warnings */}
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">System Warnings</div>
            <div className="mt-3 space-y-2">
              {systemWarnings.length === 0 ? (
                <div className="text-sm text-slate-400">No active warnings.</div>
              ) : (
                (systemWarnings as string[]).slice(0, 4).map((w) => (
                  <div key={w} className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-50">
                    {w}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr_1fr]">
          {/* Metric separation */}
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Metric Separation</div>
            <div className="mt-4 space-y-2.5 text-sm text-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Rhyme Score</span>
                <span className="font-semibold">{Number(decisionEngine.raw?.metrics?.rhymeScore ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Forecast Confidence</span>
                <span className="font-semibold">{(Number(decisionEngine.raw?.metrics?.forecastConfidence ?? 0) * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Scenario Dispersion</span>
                <span className="font-semibold">{(Number(decisionEngine.raw?.metrics?.scenarioDispersion ?? 0) * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Adversarial Risk</span>
                <span className={`font-semibold ${Number(decisionEngine.raw?.metrics?.adversarialRisk ?? 0) > 0.6 ? "text-rose-300" : "text-slate-200"}`}>
                  {(Number(decisionEngine.raw?.metrics?.adversarialRisk ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <CreditBreakdownPanel credit={credit} />
          <VolatilityDivergencePanel volatility={volatility} />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* SECTION 4 — ACTION GUIDANCE                                          */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-xl shadow-black/20 backdrop-blur">
        <SectionLabel>Action Guidance</SectionLabel>
        <h2 className="mt-2 font-serif text-2xl tracking-tight text-white">What should I do?</h2>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.5fr]">
          {/* Posture + sizing */}
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-base font-semibold ${pm.bg} ${pm.tone}`}>
              {pm.label}
            </div>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Size multiplier</div>
                <div className="mt-2 text-2xl font-semibold text-white">{sizeMultiplier.toFixed(2)}×</div>
                <div className="mt-1.5 text-sm text-slate-300">{decision.sizing_guidance ?? "No sizing guidance recorded."}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Invalidation trigger</div>
                <div className="mt-2 text-sm leading-6 text-slate-200">{decision.invalidation_trigger ?? "No invalidation trigger captured."}</div>
              </div>
            </div>
          </div>

          {/* Open positions table */}
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Open Positions</div>
              <Link href={`/lab/env/${envId}/markets/portfolio`} className="text-xs uppercase tracking-[0.16em] text-sky-200">
                Full account
              </Link>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm text-slate-200">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    <th className="pb-3">Ticker</th>
                    <th className="pb-3">Dir</th>
                    <th className="pb-3 text-right">Value</th>
                    <th className="pb-3 text-right">Unrealized</th>
                    <th className="pb-3 text-right">Return</th>
                    <th className="pb-3">Thesis</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.slice(0, 6).map((position) => (
                    <tr key={position.portfolio_position_id} className="border-b border-white/5">
                      <td className="py-3 font-semibold text-white">{position.symbol}</td>
                      <td className="py-3 uppercase text-slate-300">{position.direction}</td>
                      <td className="py-3 text-right">{money(position.market_value)}</td>
                      <td className={`py-3 text-right ${Number(position.unrealized_pnl ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(position.unrealized_pnl)}</td>
                      <td className={`py-3 text-right ${Number(position.unrealized_return_pct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(position.unrealized_return_pct)}</td>
                      <td className="py-3 max-w-[180px] truncate text-sm text-slate-400">{position.thesis_summary ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Attribution */}
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Best Contributors</div>
            <div className="mt-4 space-y-2">
              {bestContributors.slice(0, 4).map((row) => (
                <div key={String(row.portfolio_position_id ?? row.symbol)} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
                  <div className="font-semibold text-white">{String(row.symbol ?? "Unknown")}</div>
                  <div className="text-emerald-300">{money(Number(row.unrealized_pnl ?? 0))}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Biggest Drags</div>
            <div className="mt-4 space-y-2">
              {worstContributors.slice(0, 4).map((row) => (
                <div key={String(row.portfolio_position_id ?? row.symbol)} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
                  <div className="font-semibold text-white">{String(row.symbol ?? "Unknown")}</div>
                  <div className="text-rose-300">{money(Number(row.unrealized_pnl ?? 0))}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Realized vs Unrealized</div>
            <div className="mt-4 grid gap-3">
              <KpiCard label="Realized" value={money(realizedVsUnrealized.realized)} />
              <KpiCard label="Unrealized" value={money(realizedVsUnrealized.unrealized)} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PaperPortfolioSurface({
  overview,
  history,
  openPositions,
  closedPositions,
  attribution,
  loading,
  error,
  rangeKey,
  onRangeChange,
}: PaperPortfolioSurfaceProps) {
  const colors = getChartColors();
  const chartRows = useMemo(() => buildChartRows(history), [history]);

  if (loading) {
    return <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-8 text-slate-300">Loading paper portfolio…</div>;
  }

  if (error) {
    return <div className="rounded-[28px] border border-rose-400/30 bg-rose-500/10 p-8 text-rose-100">{error}</div>;
  }

  if (!overview) {
    return <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-8 text-slate-300">No BOS portfolio data is available yet for this business.</div>;
  }

  const hero = overview.hero;
  const contributionByAssetClass = (attribution?.contribution_by_asset_class ?? []) as Array<Record<string, unknown>>;
  const contributionByStrategy = (attribution?.contribution_by_strategy ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs uppercase tracking-[0.32em] text-emerald-200/80">Paper Portfolio</div>
              {seedBadge(hero.seed_mode_label)}
            </div>
            <h1 className="mt-3 font-serif text-4xl tracking-tight text-white">An account surface, not a research table.</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {RANGE_ITEMS.map((item) => (
              <button
                key={item}
                onClick={() => onRangeChange(item)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                  rangeKey === item
                    ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartRows}>
              <defs>
                <linearGradient id="portfolio-equity-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.primary} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={colors.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} {...getGridStyle()} />
              <XAxis dataKey="label" tick={getAxisTickStyle()} axisLine={false} tickLine={false} />
              <YAxis tick={getAxisTickStyle()} axisLine={false} tickLine={false} tickFormatter={(value: number) => fmtCompact(value, "$")} width={72} />
              <Tooltip contentStyle={getTooltipStyle()} formatter={(value: number) => [money(value), "Portfolio value"]} />
              <Area type="monotone" dataKey="portfolio_value" stroke={colors.primary} fill="url(#portfolio-equity-fill)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Portfolio Value" value={money(hero.portfolio_value)} />
          <KpiCard label="Cash" value={money(hero.cash)} />
          <KpiCard label="Gross Exposure" value={money(hero.gross_exposure)} />
          <KpiCard label="Net Exposure" value={money(hero.net_exposure)} />
          <KpiCard label="Max Drawdown" value={pct(-hero.max_drawdown_pct)} tone="text-amber-200" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Open Positions</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="pb-3">Ticker</th>
                  <th className="pb-3">Direction</th>
                  <th className="pb-3 text-right">Qty</th>
                  <th className="pb-3 text-right">Entry</th>
                  <th className="pb-3 text-right">Current</th>
                  <th className="pb-3 text-right">Market Value</th>
                  <th className="pb-3 text-right">Unrealized</th>
                  <th className="pb-3 text-right">Return</th>
                  <th className="pb-3">Days Held</th>
                  <th className="pb-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((position) => (
                  <tr key={position.portfolio_position_id} className="border-b border-white/5">
                    <td className="py-3 font-semibold text-white">{position.symbol}</td>
                    <td className="py-3 uppercase">{position.direction}</td>
                    <td className="py-3 text-right">{position.quantity.toFixed(2)}</td>
                    <td className="py-3 text-right">{money(position.entry_price)}</td>
                    <td className="py-3 text-right">{money(position.current_price)}</td>
                    <td className="py-3 text-right">{money(position.market_value)}</td>
                    <td className={`py-3 text-right ${Number(position.unrealized_pnl ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(position.unrealized_pnl)}</td>
                    <td className={`py-3 text-right ${Number(position.unrealized_return_pct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(position.unrealized_return_pct)}</td>
                    <td className="py-3">{position.days_held ?? "—"}</td>
                    <td className="py-3">
                      <div className="text-xs text-slate-200">{position.quote_source ?? "Unknown"}</div>
                      <div className="text-[11px] text-slate-500">{position.quote_timestamp ? new Date(position.quote_timestamp).toLocaleString() : "No timestamp"}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Closed Positions</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="pb-3">Ticker</th>
                  <th className="pb-3">Direction</th>
                  <th className="pb-3 text-right">Entry</th>
                  <th className="pb-3 text-right">Exit</th>
                  <th className="pb-3 text-right">Realized</th>
                  <th className="pb-3 text-right">Return</th>
                  <th className="pb-3 text-right">Holding</th>
                  <th className="pb-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {closedPositions.map((position) => (
                  <tr key={position.portfolio_closed_position_id} className="border-b border-white/5">
                    <td className="py-3 font-semibold text-white">{position.symbol}</td>
                    <td className="py-3 uppercase">{position.direction}</td>
                    <td className="py-3 text-right">{money(position.entry_price)}</td>
                    <td className="py-3 text-right">{money(position.exit_price)}</td>
                    <td className={`py-3 text-right ${Number(position.realized_pnl ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(position.realized_pnl)}</td>
                    <td className={`py-3 text-right ${Number(position.realized_return_pct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(position.realized_return_pct)}</td>
                    <td className="py-3 text-right">{position.holding_period_days ?? "—"}d</td>
                    <td className="py-3 text-slate-300">{position.close_reason ?? "Not recorded"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Contribution by Asset Class</div>
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contributionByAssetClass}>
                <CartesianGrid vertical={false} {...getGridStyle()} />
                <XAxis dataKey="asset_class" tick={getAxisTickStyle()} axisLine={false} tickLine={false} />
                <YAxis tick={getAxisTickStyle()} axisLine={false} tickLine={false} tickFormatter={(value: number) => fmtCompact(value, "$")} width={72} />
                <Tooltip contentStyle={getTooltipStyle()} formatter={(value: number) => [money(value), "Contribution"]} />
                <Bar dataKey="pnl" fill={colors.primary}>
                  {contributionByAssetClass.map((row, index) => (
                    <Cell key={`asset-${index}`} fill={Number(row.pnl ?? 0) >= 0 ? colors.success : colors.danger} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Contribution by Strategy</div>
          <div className="mt-4 space-y-3">
            {contributionByStrategy.slice(0, 6).map((row) => (
              <div key={String(row.strategy)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm text-white">{String(row.strategy)}</div>
                  <div className={Number(row.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}>{money(Number(row.pnl ?? 0))}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Accountability</div>
          <div className="mt-4 grid gap-3">
            <KpiCard label="Resolved Reviews" value={String(overview.accountability.resolved_count)} />
            <KpiCard label="Unresolved Reviews" value={String(overview.accountability.unresolved_count)} />
            <KpiCard label="Review Win Rate" value={pct(overview.accountability.win_rate)} />
            <KpiCard label="Average Brier" value={overview.accountability.avg_brier_score != null ? overview.accountability.avg_brier_score.toFixed(3) : "N/A"} />
            <KpiCard label="Promotion Ready" value={overview.accountability.promotion_ready ? "Yes" : "No"} tone={overview.accountability.promotion_ready ? "text-emerald-300" : "text-amber-200"} />
          </div>
        </div>
      </div>
    </div>
  );
}

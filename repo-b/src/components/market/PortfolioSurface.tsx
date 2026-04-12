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
  Legend,
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
import type { DecisionEngineResult } from "@/components/market/hooks/useDecisionEngine";
import {
  CoherenceMeter,
  CreditBreakdownPanel,
  ShockClassificationBadge,
  SignalFreshnessCard,
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

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs uppercase tracking-[0.32em] text-emerald-200/80">Markets Home</div>
              {seedBadge(hero.seed_mode_label)}
            </div>
            <h1 className="mt-3 font-serif text-4xl tracking-tight text-white">Portfolio performance first. Machine view second. Debug nowhere near the hero.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              In five seconds this page should tell you whether the book is making money, what the system believes, the best portfolio-level action, how confident that is, and what could break it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/lab/env/${envId}/markets/portfolio`} className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
              Paper Portfolio
            </Link>
            <Link href={`/lab/env/${envId}/markets/execution`} className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/20">
              Execution Workspace
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          <KpiCard label="Regime Label" value={String(topBar?.regimeLabel ?? decision.current_regime ?? "Unknown")} />
          <KpiCard label="Confidence" value={`${Number(topBar?.confidence ?? decision.confidence ?? 0).toFixed(1)}`} tone="text-sky-100" />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Shock Type</div>
            <div className="mt-2">
              <ShockClassificationBadge
                shockType={String(researchState?.shock_type ?? topBar?.shockType ?? "")}
                dominance={Number(researchState?.shock_dominance_score ?? 0)}
              />
            </div>
          </div>
          <KpiCard label="Signal Coherence" value={`${(Number(topBar?.signalCoherence ?? 0) * 100).toFixed(0)}%`} tone="text-emerald-200" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.75fr_0.95fr]">
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
                onClick={() => setShowSpy((current) => !current)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                  showSpy ? "border-sky-300/40 bg-sky-500/10 text-sky-100" : "border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                SPY
              </button>
              <button
                onClick={() => setShowBtc((current) => !current)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                  showBtc ? "border-amber-300/40 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                BTC-USD
              </button>
            </div>

            <div className="mt-5 h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows}>
                  <CartesianGrid vertical={false} {...getGridStyle()} />
                  <XAxis dataKey="label" tick={getAxisTickStyle()} axisLine={false} tickLine={false} />
                  <YAxis tick={getAxisTickStyle()} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${value.toFixed(0)}%`} width={54} />
                  <Tooltip
                    contentStyle={getTooltipStyle()}
                    formatter={(value: number | string, name: string) => [
                      typeof value === "number" ? `${value.toFixed(2)}%` : value,
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
              <KpiCard label="Benchmark Relative" value={pct(hero.benchmark_relative_return_pct)} tone={(hero.benchmark_relative_return_pct ?? 0) >= 0 ? "text-sky-200" : "text-rose-300"} />
              <KpiCard label="Unrealized P&L" value={money(hero.unrealized_pnl)} />
              <KpiCard label="Realized P&L" value={money(hero.realized_pnl)} />
              <KpiCard label="Cash" value={money(hero.cash)} />
              <KpiCard label="Gross Exposure" value={money(hero.gross_exposure)} />
              <KpiCard label="Net Exposure" value={money(hero.net_exposure)} />
              <KpiCard label="Win Rate" value={pct(hero.win_rate)} />
              <KpiCard label="Max Drawdown" value={pct(-hero.max_drawdown_pct)} tone="text-amber-200" />
              <KpiCard label="Since Inception vs SPY" value={pct(hero.benchmark_relative_return_since_inception_pct)} tone="text-sky-200" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Should We Act?</div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div className="text-3xl font-semibold text-white">{decision.recommended_action.toUpperCase()}</div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-200">
                  Confidence {decision.confidence.toFixed(1)}
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Deterministic Posture</div>
                    <div className="mt-2 text-xl font-semibold text-white">{String(deterministicDecision?.action_posture ?? decision.action_posture ?? "paper_only").replaceAll("_", " ")}</div>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.14em] text-slate-300">
                    Size {Number(deterministicDecision?.size_multiplier ?? decision.size_multiplier ?? 0).toFixed(2)}x
                  </div>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-300">
                  {((deterministicDecision?.action_posture_reasons ?? decision.action_posture_reasons ?? []) as string[]).join("; ") || "No posture reasons captured yet."}
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Why Confidence Moved</div>
                <div className="mt-2 text-sm leading-6 text-slate-200">
                  {confidenceDelta?.delta_points != null
                    ? `Delta ${Number(confidenceDelta.delta_points).toFixed(1)} pts.`
                    : "No prior confidence delta available."}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300">
                  {(confidenceDelta?.reasons ?? []).join("; ") || "No confidence movement reasons captured yet."}
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Current Regime</div>
                  <div className="mt-2 text-lg font-semibold text-white">{decision.current_regime ?? "Unknown"}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Trap Warning</div>
                  <div className="mt-2 text-sm leading-6 text-slate-200">{decision.trap_warning ?? "No active trap warning on the current portfolio view."}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Sizing Guidance</div>
                  <div className="mt-2 text-sm leading-6 text-slate-200">{decision.sizing_guidance ?? "No sizing guidance yet."}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Invalidation Trigger</div>
                  <div className="mt-2 text-sm leading-6 text-slate-200">{decision.invalidation_trigger ?? "No invalidation trigger captured yet."}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-3">
                <KpiCard label="Bull" value={pct(((scenarioDistribution?.bull ?? decision.bull_probability ?? 0) as number) * 100)} />
                <KpiCard label="Base" value={pct(((scenarioDistribution?.base ?? decision.base_probability ?? 0) as number) * 100)} />
                <KpiCard label="Bear" value={pct(((scenarioDistribution?.bear ?? decision.bear_probability ?? 0) as number) * 100)} />
              </div>
            </div>

            <div id="history-rhymes" className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">History Rhymes</div>
                  <div className="mt-2 text-xl font-semibold text-white">Top analogs and what is different this time</div>
                </div>
                <a href="#history-rhymes" className="text-xs uppercase tracking-[0.16em] text-sky-200">
                  Full view
                </a>
              </div>
              <div className="mt-4 space-y-3">
                {topAnalogs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-300">
                    History Rhymes is available, but no analogs are ready on this environment yet.
                  </div>
                ) : (
                  topAnalogs.map((analog) => (
                    <div key={`${analog.episode_name}-${analog.rank}`} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-lg font-semibold text-white">{analog.episode_name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">Rhyme score {analog.rhyme_score.toFixed(2)}</div>
                        </div>
                        <div className="rounded-full border border-sky-300/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-100">Rank {analog.rank}</div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">What Rhymes</div>
                          <div className="mt-2 text-sm leading-6 text-slate-200">{analog.key_similarity}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">What&apos;s Different</div>
                          <div className="mt-2 text-sm leading-6 text-slate-200">{analog.key_divergence}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Expected Implication</div>
                          <div className="mt-2 text-sm leading-6 text-slate-200">{decision.top_analog_name === analog.episode_name ? decision.divergence_note : "Use this analog as context, not certainty."}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">What Changed</div>
              <div className="mt-4 space-y-3">
                {whatChanged.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-300">
                    No confidence-delta explanations are available yet.
                  </div>
                ) : (
                  whatChanged.slice(0, 4).map((item) => (
                    <div key={item} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm leading-6 text-slate-200">
                      {item}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">System Warnings</div>
              <div className="mt-4 space-y-3">
                {systemWarnings.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-300">
                    No active system warnings.
                  </div>
                ) : (
                  systemWarnings.slice(0, 5).map((warning) => (
                    <div key={warning} className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50">
                      {warning}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <SignalFreshnessCard
              freshness={Number(researchState?.signal_freshness_score ?? 0)}
              staleness={String(deterministicDecision?.state_staleness_status ?? decision.state_staleness_status ?? "")}
            />
            <CoherenceMeter coherence={Number(researchState?.signal_coherence_index ?? 0)} />
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Metric Separation</div>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <div>Rhyme Score {Number(decisionEngine.raw?.metrics?.rhymeScore ?? 0).toFixed(2)}</div>
                <div>Forecast Confidence {(Number(decisionEngine.raw?.metrics?.forecastConfidence ?? 0) * 100).toFixed(0)}%</div>
                <div>Scenario Dispersion {(Number(decisionEngine.raw?.metrics?.scenarioDispersion ?? 0) * 100).toFixed(0)}%</div>
                <div>Adversarial Risk {(Number(decisionEngine.raw?.metrics?.adversarialRisk ?? 0) * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div className="xl:col-span-2 rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Adversarial View</div>
              <div className="mt-3 text-sm leading-7 text-slate-200">
                {decisionEngine.raw?.adversarialView ?? "Adversarial view is not available yet."}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <CreditBreakdownPanel credit={credit} />
            <VolatilityDivergencePanel volatility={volatility} />
          </div>

          <StaleBadge value={hero.stale_warning} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Open Positions</div>
              <div className="mt-2 text-2xl font-semibold text-white">Current marks, current P&amp;L, current risk.</div>
            </div>
            <Link href={`/lab/env/${envId}/markets/portfolio`} className="text-xs uppercase tracking-[0.16em] text-sky-200">
              Full account page
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="pb-3">Ticker</th>
                  <th className="pb-3">Dir</th>
                  <th className="pb-3 text-right">Entry</th>
                  <th className="pb-3 text-right">Current</th>
                  <th className="pb-3 text-right">Value</th>
                  <th className="pb-3 text-right">Unrealized</th>
                  <th className="pb-3 text-right">Return</th>
                  <th className="pb-3">Freshness</th>
                  <th className="pb-3">Thesis</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.slice(0, 8).map((position) => (
                  <tr key={position.portfolio_position_id} className="border-b border-white/5">
                    <td className="py-3 font-semibold text-white">{position.symbol}</td>
                    <td className="py-3 uppercase text-slate-300">{position.direction}</td>
                    <td className="py-3 text-right">{money(position.entry_price)}</td>
                    <td className="py-3 text-right">{money(position.current_price)}</td>
                    <td className="py-3 text-right">{money(position.market_value)}</td>
                    <td className={`py-3 text-right ${Number(position.unrealized_pnl ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(position.unrealized_pnl)}</td>
                    <td className={`py-3 text-right ${Number(position.unrealized_return_pct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(position.unrealized_return_pct)}</td>
                    <td className="py-3">
                      <div className="text-xs text-slate-200">{position.quote_freshness_state ?? "unknown"}</div>
                      <div className="text-[11px] text-slate-500">{position.quote_source ?? "no source"}</div>
                    </td>
                    <td className="py-3 text-sm leading-6 text-slate-300">{position.thesis_summary ?? "No thesis snapshot recorded."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Best Contributors</div>
            <div className="mt-4 space-y-3">
              {bestContributors.slice(0, 4).map((row) => (
                <div key={String(row.portfolio_position_id ?? row.symbol)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-semibold text-white">{String(row.symbol ?? "Unknown")}</div>
                    <div className="text-emerald-300">{money(Number(row.unrealized_pnl ?? 0))}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Biggest Drags</div>
            <div className="mt-4 space-y-3">
              {worstContributors.slice(0, 4).map((row) => (
                <div key={String(row.portfolio_position_id ?? row.symbol)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-semibold text-white">{String(row.symbol ?? "Unknown")}</div>
                    <div className="text-rose-300">{money(Number(row.unrealized_pnl ?? 0))}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Realized vs Unrealized</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <KpiCard label="Realized" value={money(realizedVsUnrealized.realized)} />
              <KpiCard label="Unrealized" value={money(realizedVsUnrealized.unrealized)} />
            </div>
          </div>
        </div>
      </div>
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

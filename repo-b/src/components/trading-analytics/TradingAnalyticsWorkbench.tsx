"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bot, ClipboardList, Database, Download, RefreshCw, Send, Stethoscope } from "lucide-react";

import {
  askTradingCopilot,
  createTradingMemo,
  getTradingAnalogs,
  getTradingCorrelation,
  getTradingHealth,
  getTradingSeasonality,
  getTradingSeries,
  listTradingMemos,
  runTradingRegression,
  runTradingScenario,
  type TradingAnalogs,
  type TradingCopilotResponse,
  type TradingCorrelation,
  type TradingHealth,
  type TradingMemo,
  type TradingMemosResponse,
  type TradingRegression,
  type TradingScenario,
  type TradingSeasonality,
  type TradingSeriesResponse,
} from "@/lib/trading-api";
import { cn } from "@/lib/cn";

const SYMBOL_OPTIONS = [
  { value: "WTI", label: "WTI" },
  { value: "BRENT", label: "Brent" },
  { value: "HH_GAS", label: "Henry Hub" },
  { value: "BRENT_WTI_SPREAD", label: "Brent-WTI" },
  { value: "DXY_PROXY", label: "DXY proxy" },
  { value: "UST10Y", label: "10Y proxy" },
  { value: "VIX", label: "VIX proxy" },
  { value: "CRUDE_INVENTORY_PROXY", label: "Crude inventory" },
  { value: "GAS_STORAGE_PROXY", label: "Gas storage" },
  { value: "RIG_COUNT_PROXY", label: "Rig count" },
];

const MARKET_SYMBOLS = SYMBOL_OPTIONS.map((option) => option.value);
const DEFAULT_FACTORS = ["DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"];
const DEMO_PROMPTS = [
  "Show 5-year natural gas seasonality and where current price sits by percentile.",
  "Run rolling 60-day correlation between WTI and Brent.",
  "Run a regression of WTI returns against DXY, rates, VIX, and inventory.",
  "Find historical analogs for the current crude setup.",
  "Generate a trader-facing memo with evidence and caveats.",
];

type WorkbenchData = {
  health: TradingHealth | null;
  series: TradingSeriesResponse | null;
  seasonality: TradingSeasonality | null;
  correlation: TradingCorrelation | null;
  regression: TradingRegression | null;
  scenario: TradingScenario | null;
  analogs: TradingAnalogs | null;
  memos: TradingMemo[];
};

const initialData: WorkbenchData = {
  health: null,
  series: null,
  seasonality: null,
  correlation: null,
  regression: null,
  scenario: null,
  analogs: null,
  memos: [],
};

function fmtNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
  return value.toLocaleString(undefined, { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1 });
}

function cleanError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return "Trading analytics data is unavailable. Confirm the migration and seed command have been run.";
  }
  return "Trading analytics data is unavailable.";
}

function panelTitle(icon: ReactNode, title: string, action?: ReactNode) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-200">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Unavailable({ reason }: { reason?: string | null }) {
  return (
    <div className="rounded-md border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
      <div className="font-medium">Unavailable</div>
      <div className="mt-1 text-amber-100/80">{reason || "No returned reason."}</div>
    </div>
  );
}

function SourceChip({ source }: { source?: string | null }) {
  return (
    <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-300">
      {source || "Unavailable"}
    </span>
  );
}

function StatusChip({ status }: { status?: string | null }) {
  const ok = status === "available" || status === "fresh";
  return (
    <span className={cn(
      "rounded-md border px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em]",
      ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200",
    )}>
      {status || "Unavailable"}
    </span>
  );
}

function ToolSummary({ payload }: { payload: TradingCopilotResponse | null }) {
  if (!payload) return null;
  return (
    <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <SourceChip source={`tool: ${payload.tool_used}`} />
        <StatusChip status={payload.available ? "available" : "unavailable"} />
        <SourceChip source={payload.ai_available ? "AI available" : "AI unavailable"} />
      </div>
      {payload.warnings?.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-100">
          {payload.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export default function TradingAnalyticsWorkbench({ envId }: { envId: string }) {
  const [data, setData] = useState<WorkbenchData>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasonalitySymbol, setSeasonalitySymbol] = useState("HH_GAS");
  const [corrA, setCorrA] = useState("WTI");
  const [corrB, setCorrB] = useState("BRENT");
  const [corrWindow, setCorrWindow] = useState(60);
  const [scenarioBase, setScenarioBase] = useState("WTI");
  const [shocks, setShocks] = useState<Record<string, number>>({
    inventory_shock: 0,
    dxy_shock: 0,
    rate_shock: 0,
    volatility_shock: 0,
    storage_shock: 0,
  });
  const [copilotQuestion, setCopilotQuestion] = useState(DEMO_PROMPTS[0]);
  const [copilot, setCopilot] = useState<TradingCopilotResponse | null>(null);
  const [activePayload, setActivePayload] = useState<Record<string, unknown> | null>(null);
  const [activeQuestion, setActiveQuestion] = useState("Initial WTI factor regression.");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function refreshDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [
        health,
        series,
        seasonality,
        correlation,
        regression,
        scenario,
        analogs,
        memoResponse,
      ] = await Promise.all([
        getTradingHealth(envId),
        getTradingSeries(envId, { symbols: MARKET_SYMBOLS, latest: true }),
        getTradingSeasonality(envId, seasonalitySymbol, 5),
        getTradingCorrelation(envId, corrA, corrB, corrWindow),
        runTradingRegression(envId, { dependent_symbol: "WTI", factor_symbols: DEFAULT_FACTORS, lookback_days: 756 }),
        runTradingScenario(envId, { base_symbol: scenarioBase, shocks }),
        getTradingAnalogs(envId, "WTI", 60, 5),
        listTradingMemos(envId, 10),
      ]);
      setData({ health, series, seasonality, correlation, regression, scenario, analogs, memos: memoResponse.memos || [] });
      setActivePayload(regression as unknown as Record<string, unknown>);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshDashboard();
    // Initial load intentionally uses default controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId]);

  const health = data.health;
  const freshness = health?.freshness;
  const latestCards = health?.market_overview || [];
  const latestMemo = data.memos[0];

  const regressionChart = useMemo(() => {
    return (data.regression?.coefficients || []).map((coef) => ({
      factor: coef.factor.replace("_PROXY", ""),
      coefficient: coef.coefficient ?? 0,
    }));
  }, [data.regression]);

  async function runSeasonality() {
    setBusyAction("seasonality");
    try {
      const result = await getTradingSeasonality(envId, seasonalitySymbol, 5);
      setData((previous) => ({ ...previous, seasonality: result }));
      setActivePayload(result as unknown as Record<string, unknown>);
      setActiveQuestion(`Show 5-year ${seasonalitySymbol} seasonality and percentile.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function runCorrelation() {
    setBusyAction("correlation");
    try {
      const result = await getTradingCorrelation(envId, corrA, corrB, corrWindow);
      setData((previous) => ({ ...previous, correlation: result }));
      setActivePayload(result as unknown as Record<string, unknown>);
      setActiveQuestion(`Run rolling ${corrWindow}-day correlation between ${corrA} and ${corrB}.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function runRegression() {
    setBusyAction("regression");
    try {
      const result = await runTradingRegression(envId, { dependent_symbol: "WTI", factor_symbols: DEFAULT_FACTORS, lookback_days: 756 });
      setData((previous) => ({ ...previous, regression: result }));
      setActivePayload(result as unknown as Record<string, unknown>);
      setActiveQuestion("Run a regression of WTI returns against DXY, rates, VIX, and inventory.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runScenario() {
    setBusyAction("scenario");
    try {
      const result = await runTradingScenario(envId, { base_symbol: scenarioBase, shocks });
      setData((previous) => ({ ...previous, scenario: result }));
      setActivePayload(result as unknown as Record<string, unknown>);
      setActiveQuestion(`Run scenario model for ${scenarioBase}.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function runAnalogs() {
    setBusyAction("analogs");
    try {
      const result = await getTradingAnalogs(envId, "WTI", 60, 5);
      setData((previous) => ({ ...previous, analogs: result }));
      setActivePayload(result as unknown as Record<string, unknown>);
      setActiveQuestion("Find historical analogs for the current crude setup.");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitCopilot(event: FormEvent) {
    event.preventDefault();
    setBusyAction("copilot");
    try {
      const response = await askTradingCopilot(envId, {
        question: copilotQuestion,
        analytics_payload: activePayload,
      });
      setCopilot(response);
      setActiveQuestion(copilotQuestion);
      if (response.tool_used !== "unsupported") {
        setActivePayload(response.result);
      }
      if (response.tool_used === "memo") {
        const memos = await listTradingMemos(envId, 10);
        setData((previous) => ({ ...previous, memos: memos.memos || [] }));
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function generateMemo() {
    if (!activePayload) return;
    setBusyAction("memo");
    try {
      const memo = await createTradingMemo(envId, {
        question: activeQuestion || "Generate a trader-facing memo with evidence and caveats.",
        analytics_payload: activePayload,
        run_id: typeof activePayload.run_id === "string" ? activePayload.run_id : undefined,
      });
      setData((previous) => ({ ...previous, memos: [memo, ...previous.memos] }));
    } finally {
      setBusyAction(null);
    }
  }

  function updateShock(key: string, value: string) {
    const parsed = Number(value);
    setShocks((previous) => ({ ...previous, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  function downloadMemo(memo: TradingMemo) {
    const blob = new Blob([memo.memo_md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trading-desk-memo.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#08111f] text-slate-100">
      <div className="border-b border-slate-800 bg-[#0b1424]">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Trading Analytics Copilot</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Energy Trading Command Center</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">AI-powered analytics over market pricing and fundamentals.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SourceChip source={`env ${envId}`} />
            <SourceChip source={health?.source_mode || "Unavailable"} />
            <StatusChip status={freshness?.staleness_status || "unavailable"} />
            <SourceChip source={freshness?.latest_observation_date ? `latest ${freshness.latest_observation_date}` : "latest unavailable"} />
            <button
              type="button"
              onClick={() => void refreshDashboard()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 lg:grid-cols-[1fr_400px] lg:px-6">
        <section className="space-y-4">
          {error ? <Unavailable reason={error} /> : null}
          {loading ? (
            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">Loading trading analytics...</div>
          ) : null}

          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
            {panelTitle(<Database size={16} />, "Market Overview")}
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
              {latestCards.map((card) => (
                <div key={card.symbol} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{card.symbol}</div>
                    <SourceChip source={card.source} />
                  </div>
                  <div className="mt-3 text-2xl font-semibold tabular-nums text-white">{card.available ? fmtCompact(card.value) : "Unavailable"}</div>
                  <div className="mt-1 text-xs text-slate-400">{card.unit}</div>
                  {!card.available ? <div className="mt-2 text-xs text-amber-200">{card.unavailable_reason}</div> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
              {panelTitle(
                <Stethoscope size={16} />,
                "Pipeline Health",
                <SourceChip source="Bronze / Silver / Gold" />,
              )}
              <div className="grid gap-2 md:grid-cols-3">
                {(health?.layers || []).map((layer) => (
                  <div key={layer.name} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">{layer.name}</div>
                      <StatusChip status={layer.status} />
                    </div>
                    <p className="mt-2 min-h-10 text-xs leading-5 text-slate-400">{layer.definition}</p>
                    <div className="mt-3 space-y-1 text-xs text-slate-300">
                      <div>Rows: <span className="tabular-nums text-white">{(layer.row_count ?? layer.feature_rows ?? 0).toLocaleString()}</span></div>
                      {layer.analytics_run_count !== undefined ? <div>Runs: <span className="tabular-nums text-white">{layer.analytics_run_count}</span></div> : null}
                      {layer.memo_count !== undefined ? <div>Memos: <span className="tabular-nums text-white">{layer.memo_count}</span></div> : null}
                      {layer.unavailable_reason ? <div className="text-amber-200">{layer.unavailable_reason}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
              {panelTitle(<Database size={16} />, "Data Freshness")}
              <div className="max-h-[260px] overflow-auto rounded-md border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Series</th>
                      <th className="px-3 py-2">Rows</th>
                      <th className="px-3 py-2">Date range</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {(health?.series || []).map((series) => (
                      <tr key={series.symbol}>
                        <td className="px-3 py-2 text-slate-200">{series.symbol}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-300">{series.row_count.toLocaleString()}</td>
                        <td className="px-3 py-2 text-slate-400">{series.date_range.start || "Unavailable"} to {series.date_range.end || "Unavailable"}</td>
                        <td className="px-3 py-2"><StatusChip status={series.available ? series.staleness_status : "unavailable"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
              {panelTitle(
                <Database size={16} />,
                "Seasonality",
                <div className="flex items-center gap-2">
                  <select value={seasonalitySymbol} onChange={(event) => setSeasonalitySymbol(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
                    {SYMBOL_OPTIONS.slice(0, 3).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <button type="button" onClick={() => void runSeasonality()} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">{busyAction === "seasonality" ? "Running" : "Run"}</button>
                </div>,
              )}
              {!data.seasonality?.available ? <Unavailable reason={data.seasonality?.unavailable_reason} /> : (
                <>
                  <div className="mb-2 flex flex-wrap gap-2 text-xs">
                    <SourceChip source={`${data.seasonality.symbol} percentile ${fmtNumber(data.seasonality.latest?.seasonal_percentile, 1)}`} />
                    <SourceChip source={`${data.seasonality.latest?.value ?? "Unavailable"} ${data.seasonality.latest?.unit ?? ""}`} />
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.seasonality.chart}>
                        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                        <XAxis dataKey="day_of_year" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }} />
                        <Legend />
                        <Line dot={false} dataKey="p10" stroke="#475569" name="P10" />
                        <Line dot={false} dataKey="historical_avg" stroke="#38bdf8" name="Historical avg" />
                        <Line dot={false} dataKey="p90" stroke="#475569" name="P90" />
                        <Line dot={false} dataKey="current" stroke="#facc15" strokeWidth={2} name="Current" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
              {panelTitle(
                <Database size={16} />,
                "Rolling Correlation",
                <div className="flex flex-wrap items-center gap-2">
                  <select value={corrA} onChange={(event) => setCorrA(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">{SYMBOL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  <select value={corrB} onChange={(event) => setCorrB(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">{SYMBOL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  <input value={corrWindow} onChange={(event) => setCorrWindow(Number(event.target.value))} type="number" min={5} max={252} className="w-16 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100" />
                  <button type="button" onClick={() => void runCorrelation()} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">{busyAction === "correlation" ? "Running" : "Run"}</button>
                </div>,
              )}
              {!data.correlation?.available ? <Unavailable reason={data.correlation?.unavailable_reason} /> : (
                <>
                  <div className="mb-2 grid grid-cols-4 gap-2 text-xs">
                    {(["latest", "average", "min", "max"] as const).map((key) => (
                      <div key={key} className="rounded-md bg-slate-900 p-2">
                        <div className="uppercase tracking-[0.12em] text-slate-500">{key}</div>
                        <div className="mt-1 tabular-nums text-white">{fmtNumber(data.correlation?.stats?.[key], 3)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.correlation.chart}>
                        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} minTickGap={30} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={[-1, 1]} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }} />
                        <Line dot={false} dataKey="correlation" stroke="#22c55e" strokeWidth={2} name="Correlation" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
              {panelTitle(<Database size={16} />, "Regression", <button type="button" onClick={() => void runRegression()} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">{busyAction === "regression" ? "Running" : "Run WTI factors"}</button>)}
              {!data.regression?.available ? <Unavailable reason={data.regression?.unavailable_reason} /> : (
                <>
                  <div className="mb-3 grid grid-cols-4 gap-2 text-xs">
                    <div className="rounded-md bg-slate-900 p-2"><div className="text-slate-500">R2</div><div className="tabular-nums text-white">{fmtNumber(data.regression.r_squared, 3)}</div></div>
                    <div className="rounded-md bg-slate-900 p-2"><div className="text-slate-500">n_obs</div><div className="tabular-nums text-white">{data.regression.n_obs}</div></div>
                    <div className="rounded-md bg-slate-900 p-2"><div className="text-slate-500">Intercept</div><div className="tabular-nums text-white">{fmtNumber(data.regression.intercept, 5)}</div></div>
                    <div className="rounded-md bg-slate-900 p-2"><div className="text-slate-500">Method</div><div className="truncate text-white">OLS</div></div>
                  </div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={regressionChart}>
                        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                        <XAxis dataKey="factor" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }} />
                        <Bar dataKey="coefficient" fill="#38bdf8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
              {panelTitle(
                <Database size={16} />,
                "Scenario Model",
                <button type="button" onClick={() => void runScenario()} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">{busyAction === "scenario" ? "Running" : "Apply scenario"}</button>,
              )}
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                <select value={scenarioBase} onChange={(event) => setScenarioBase(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-slate-100">
                  {SYMBOL_OPTIONS.slice(0, 3).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {Object.entries(shocks).map(([key, value]) => (
                  <label key={key} className="block rounded-md border border-slate-800 bg-slate-900 p-2">
                    <span className="block truncate text-slate-500">{key.replace("_shock", "")}</span>
                    <input value={value} onChange={(event) => updateShock(key, event.target.value)} type="number" step="0.5" className="mt-1 w-full bg-transparent text-sm tabular-nums text-white outline-none" />
                  </label>
                ))}
              </div>
              {!data.scenario?.available ? <Unavailable reason={data.scenario?.unavailable_reason} /> : (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <SourceChip source={`impact ${fmtNumber(data.scenario.estimated_return_impact_pct, 2)}%`} />
                    <StatusChip status={data.scenario.directional_pressure} />
                    <SourceChip source={`price impact ${fmtNumber(data.scenario.estimated_price_impact, 2)}`} />
                  </div>
                  <div className="max-h-48 overflow-auto rounded-md border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <tbody className="divide-y divide-slate-800">
                        {data.scenario.sensitivity_table.map((row) => (
                          <tr key={row.factor}>
                            <td className="px-3 py-2 text-slate-200">{row.label}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-300">{fmtCompact(row.shock)} {row.unit}</td>
                            <td className="px-3 py-2 tabular-nums text-white">{fmtNumber(row.estimated_return_impact_pct, 3)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
            {panelTitle(<Database size={16} />, "Historical Analogs", <button type="button" onClick={() => void runAnalogs()} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">{busyAction === "analogs" ? "Running" : "Refresh analogs"}</button>)}
            {!data.analogs?.available ? <Unavailable reason={data.analogs?.unavailable_reason} /> : (
              <div className="overflow-auto rounded-md border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Window</th>
                      <th className="px-3 py-2">Score</th>
                      <th className="px-3 py-2">Matched</th>
                      <th className="px-3 py-2">Diverged</th>
                      <th className="px-3 py-2">Fwd 30D</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.analogs.analogs.map((analog) => (
                      <tr key={`${analog.start_date}-${analog.end_date}`}>
                        <td className="px-3 py-2 text-slate-200">{analog.start_date} to {analog.end_date}</td>
                        <td className="px-3 py-2 tabular-nums text-white">{fmtNumber(analog.score, 3)}</td>
                        <td className="px-3 py-2 text-slate-300">{analog.matching_features.join(", ")}</td>
                        <td className="px-3 py-2 text-slate-300">{analog.divergent_features.join(", ")}</td>
                        <td className="px-3 py-2 tabular-nums text-white">{fmtNumber(analog.forward_30d_return_pct, 2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-md border border-slate-800 bg-slate-950/80 p-4">
            {panelTitle(<Bot size={16} />, "AI Analyst Copilot", <SourceChip source={copilot?.ai_available ? "AI available" : "AI unavailable"} />)}
            <form onSubmit={(event) => void submitCopilot(event)} className="space-y-3">
              <textarea
                value={copilotQuestion}
                onChange={(event) => setCopilotQuestion(event.target.value)}
                className="min-h-28 w-full rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none focus:border-cyan-500/60"
              />
              <div className="flex flex-wrap gap-2">
                {DEMO_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setCopilotQuestion(prompt)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left text-[11px] text-slate-300 hover:bg-slate-800">
                    {prompt}
                  </button>
                ))}
              </div>
              <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20">
                <Send size={15} /> {busyAction === "copilot" ? "Running deterministic tool" : "Ask copilot"}
              </button>
            </form>
            <div className="mt-3 space-y-3">
              <ToolSummary payload={copilot} />
              {copilot?.tool_used === "unsupported" ? <Unavailable reason={String(copilot.result?.unavailable_reason || "Unsupported capability.")} /> : null}
              {copilot?.available ? (
                <div className="rounded-md border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300">
                  <div className="font-semibold text-slate-100">Result summary</div>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-300">
                    {JSON.stringify(copilot.result, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-950/80 p-4">
            {panelTitle(
              <ClipboardList size={16} />,
              "Decision Memo",
              <button type="button" disabled={!activePayload || busyAction === "memo"} onClick={() => void generateMemo()} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
                Generate desk memo
              </button>,
            )}
            {!latestMemo ? (
              <Unavailable reason="No memo has been persisted yet. Run an analysis and generate a desk memo." />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <SourceChip source={`confidence ${latestMemo.confidence}`} />
                  <SourceChip source={latestMemo.created_at ? `saved ${latestMemo.created_at}` : "saved timestamp unavailable"} />
                </div>
                <div className="max-h-[460px] overflow-auto rounded-md border border-slate-800 bg-slate-900/80 p-3 text-sm leading-6 text-slate-200">
                  <pre className="whitespace-pre-wrap font-sans">{latestMemo.memo_md}</pre>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void navigator.clipboard?.writeText(latestMemo.memo_md)} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Copy Markdown</button>
                  <button type="button" onClick={() => downloadMemo(latestMemo)} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"><Download size={13} /> Download</button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-950/80 p-4">
            {panelTitle(<Database size={16} />, "Pipeline Health Summary")}
            <div className="space-y-2 text-sm">
              {(health?.layers || []).map((layer) => (
                <div key={layer.name} className="flex items-center justify-between rounded-md bg-slate-900 px-3 py-2">
                  <span className="text-slate-300">{layer.name}</span>
                  <StatusChip status={layer.status} />
                </div>
              ))}
            </div>
            {health?.unavailable_sources?.length ? (
              <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
                {health.unavailable_sources.map((item) => <div key={item.symbol}>{item.symbol}: {item.reason}</div>)}
              </div>
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}

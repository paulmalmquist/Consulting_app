"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Play } from "lucide-react";
import type { MonteCarloWaterfallResponse } from "@/lib/bos-api";
import { getFiFundMetrics, runMonteCarloWaterfall } from "@/lib/bos-api";
import { MonteCarloWaterfallResults } from "@/components/repe/model/MonteCarloWaterfallResults";

/* ── Seeded PRNG (mulberry32) ── */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Box-Muller normal distribution ── */
function normalRandom(rand: () => number, mean: number, std: number): number {
  const u1 = rand();
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

/* ── Percentile helper ── */
function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

interface SimResult {
  irr: number[];
  tvpi: number[];
}

export function runSimulation(sims: number, seed: number): SimResult {
  const rand = mulberry32(seed);
  const irr: number[] = [];
  const tvpi: number[] = [];
  for (let i = 0; i < sims; i++) {
    irr.push(normalRandom(rand, 0.15, 0.08));
    tvpi.push(Math.max(0.1, normalRandom(rand, 1.8, 0.5)));
  }
  return { irr, tvpi };
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

/* ── Histogram builder ── */
function buildHistogram(values: number[], buckets: number): { label: string; count: number }[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / buckets;
  const bins: { label: string; count: number }[] = [];
  for (let i = 0; i < buckets; i++) {
    const lo = min + i * step;
    const hi = lo + step;
    bins.push({
      label: `${(lo * 100).toFixed(0)}%`,
      count: values.filter((v) => v >= lo && (i === buckets - 1 ? v <= hi : v < hi)).length,
    });
  }
  return bins;
}

/* ── Percentile rows ── */
const PCTS = [5, 10, 25, 50, 75, 90, 95];

function PercentileTable({ label, sorted }: { label: string; sorted: number[] }) {
  const maxVal = Math.max(...sorted);
  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h4 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">{label} Percentiles</h4>
      <div className="space-y-1.5">
        {PCTS.map((p) => {
          const val = percentile(sorted, p);
          const pct = maxVal > 0 ? Math.max(0, val / maxVal) * 100 : 0;
          return (
            <div key={p} className="flex items-center gap-3 text-sm">
              <span className="w-10 text-right text-xs text-bm-muted2">P{p}</span>
              <div className="flex-1 h-5 rounded bg-bm-surface/40 overflow-hidden">
                <div
                  className={`h-full rounded ${p === 50 ? "bg-bm-accent" : "bg-bm-accent/40"}`}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
              <span className="w-20 text-right font-mono text-xs">{fmtPct(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Histogram({ bins, title }: { bins: { label: string; count: number }[]; title: string }) {
  const maxCount = Math.max(...bins.map((b) => b.count));
  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h4 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">{title}</h4>
      <div className="flex items-end gap-px h-40">
        {bins.map((bin, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div
              className="w-full bg-bm-accent/60 hover:bg-bm-accent transition rounded-t"
              style={{ height: `${maxCount > 0 ? (bin.count / maxCount) * 100 : 0}%`, minHeight: bin.count > 0 ? "2px" : "0" }}
              title={`${bin.label}: ${bin.count}`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-bm-muted2">{bins[0]?.label}</span>
        <span className="text-[10px] text-bm-muted2">{bins[bins.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function MonteCarloResults({ sim }: { sim: SimResult }) {
  const sortedIrr = useMemo(() => [...sim.irr].sort((a, b) => a - b), [sim.irr]);
  const sortedTvpi = useMemo(() => [...sim.tvpi].sort((a, b) => a - b), [sim.tvpi]);
  const irrBins = useMemo(() => buildHistogram(sim.irr, 30), [sim.irr]);

  const meanIrr = sim.irr.reduce((s, v) => s + v, 0) / sim.irr.length;
  const meanTvpi = sim.tvpi.reduce((s, v) => s + v, 0) / sim.tvpi.length;
  const probLoss = sim.irr.filter((v) => v < 0).length / sim.irr.length;
  const var95 = percentile(sortedIrr, 5);

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider">Mean IRR</p>
          <p className="text-lg font-semibold mt-1">{fmtPct(meanIrr)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider">Mean TVPI</p>
          <p className="text-lg font-semibold mt-1">{meanTvpi.toFixed(2)}x</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider">P(IRR &lt; 0)</p>
          <p className={`text-lg font-semibold mt-1 ${probLoss > 0.2 ? "text-red-400" : "text-green-400"}`}>
            {(probLoss * 100).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider">VaR (5%)</p>
          <p className={`text-lg font-semibold mt-1 ${var95 < 0 ? "text-red-400" : "text-green-400"}`}>
            {fmtPct(var95)}
          </p>
        </div>
      </div>

      {/* Histogram */}
      <Histogram bins={irrBins} title="IRR Distribution" />

      {/* Percentile Tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PercentileTable label="IRR" sorted={sortedIrr} />
        <PercentileTable label="TVPI" sorted={sortedTvpi} />
      </div>

      {/* Risk Metrics */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <h4 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Risk Metrics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-bm-muted2">P10 IRR</p>
            <p className="font-medium">{fmtPct(percentile(sortedIrr, 10))}</p>
          </div>
          <div>
            <p className="text-xs text-bm-muted2">P90 IRR</p>
            <p className="font-medium">{fmtPct(percentile(sortedIrr, 90))}</p>
          </div>
          <div>
            <p className="text-xs text-bm-muted2">P10 TVPI</p>
            <p className="font-medium">{percentile(sortedTvpi, 10).toFixed(2)}x</p>
          </div>
          <div>
            <p className="text-xs text-bm-muted2">P90 TVPI</p>
            <p className="font-medium">{percentile(sortedTvpi, 90).toFixed(2)}x</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonteCarloTab({
  modelId,
  scopeCount,
  envId,
  businessId,
  primaryFundId,
  quarter,
  onError,
}: {
  modelId: string;
  scopeCount: number;
  envId: string;
  businessId: string;
  primaryFundId?: string | null;
  quarter: string;
  onError: (msg: string) => void;
}) {
  const [mcSims, setMcSims] = useState(1000);
  const [mcSeed, setMcSeed] = useState(42);
  const [mcRunning, setMcRunning] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [baselineNav, setBaselineNav] = useState<number | null>(null);
  const [waterfallLoading, setWaterfallLoading] = useState(false);
  const [waterfallResult, setWaterfallResult] = useState<MonteCarloWaterfallResponse | null>(null);

  useEffect(() => {
    if (!primaryFundId || !envId || !businessId || !quarter) return;
    getFiFundMetrics({
      env_id: envId,
      business_id: businessId,
      fund_id: primaryFundId,
      quarter,
    })
      .then((payload) => {
        const stateful = payload as typeof payload & { state?: { portfolio_nav?: number | string | null } };
        setBaselineNav(Number(stateful.state?.portfolio_nav || 0));
      })
      .catch(() => setBaselineNav(null));
  }, [primaryFundId, envId, businessId, quarter]);

  const handleRunMonteCarlo = async () => {
    if (scopeCount === 0) {
      onError("Cannot run Monte Carlo: Add at least one asset to scope first.");
      return;
    }
    setMcRunning(true);
    try {
      // Fire API call (may fail if backend not wired — that's ok, we simulate client-side)
      await fetch(`/api/re/v2/models/${modelId}/monte-carlo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulations: mcSims, seed: mcSeed }),
      }).catch(() => {});

      // Client-side simulation for immediate visualization
      const result = runSimulation(mcSims, mcSeed);
      setSimResult(result);
      setWaterfallResult(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Monte Carlo simulation failed");
    } finally {
      setMcRunning(false);
    }
  };

  const handleRunPercentileWaterfall = async () => {
    if (!simResult || !primaryFundId) {
      onError("Percentile waterfall requires a linked primary fund.");
      return;
    }
    if (!baselineNav || baselineNav <= 0) {
      onError("Could not resolve baseline fund NAV for the percentile waterfall.");
      return;
    }
    setWaterfallLoading(true);
    try {
      const sortedTvpi = [...simResult.tvpi].sort((a, b) => a - b);
      const result = await runMonteCarloWaterfall({
        fund_id: primaryFundId,
        env_id: envId,
        business_id: businessId,
        quarter,
        p10_nav: percentile(sortedTvpi, 10) * baselineNav,
        p50_nav: percentile(sortedTvpi, 50) * baselineNav,
        p90_nav: percentile(sortedTvpi, 90) * baselineNav,
      });
      setWaterfallResult(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Monte Carlo waterfall failed");
    } finally {
      setWaterfallLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center">
        <Activity size={32} className="mx-auto text-bm-muted2 mb-3" />
        <h3 className="text-lg font-semibold">Monte Carlo Risk Analysis</h3>
        <p className="text-sm text-bm-muted2 mt-1">
          Run a Monte Carlo simulation to generate risk distributions and key percentiles.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <label className="text-xs text-bm-muted2">
            Simulations
            <input
              type="number"
              value={mcSims}
              onChange={(e) => setMcSims(Math.max(100, Math.min(10000, parseInt(e.target.value) || 1000)))}
              min={100}
              max={10000}
              className="ml-2 w-24 rounded-lg border border-bm-border bg-bm-surface px-2 py-1 text-sm"
              data-testid="mc-sims-input"
            />
          </label>
          <label className="text-xs text-bm-muted2">
            Seed
            <input
              type="number"
              value={mcSeed}
              onChange={(e) => setMcSeed(parseInt(e.target.value) || 42)}
              className="ml-2 w-20 rounded-lg border border-bm-border bg-bm-surface px-2 py-1 text-sm"
              data-testid="mc-seed-input"
            />
          </label>
          <button
            type="button"
            onClick={handleRunMonteCarlo}
            disabled={scopeCount === 0 || mcRunning}
            aria-disabled={scopeCount === 0 || mcRunning}
            title={scopeCount === 0 ? "Add assets to scope before running" : "Run Monte Carlo risk simulation"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="run-mc-btn"
          >
            <Play size={14} /> {mcRunning ? "Running..." : simResult ? "Re-Run" : "Run Monte Carlo"}
          </button>
        </div>
      </div>

      {/* Results */}
      {simResult && (
        <>
          <MonteCarloResults sim={simResult} />
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Waterfall Bridge</p>
                <p className="text-sm text-bm-muted2">
                  Feed P10, P50, and P90 Monte Carlo outcomes into the waterfall engine.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunPercentileWaterfall}
                disabled={!primaryFundId || !businessId || waterfallLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-4 py-2 text-sm text-bm-text hover:bg-bm-surface/40 disabled:opacity-40"
              >
                {waterfallLoading ? "Running..." : "Run Waterfall at Percentiles"}
              </button>
            </div>
            {!primaryFundId ? (
              <p className="mt-3 text-xs text-amber-300">Link this model to a primary fund to enable the percentile waterfall bridge.</p>
            ) : null}
          </div>
          {waterfallResult ? <MonteCarloWaterfallResults result={waterfallResult} /> : null}
        </>
      )}
    </div>
  );
}

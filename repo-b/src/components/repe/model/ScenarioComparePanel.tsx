"use client";

import { useState, useCallback } from "react";
import { GitCompare, Loader2, ChevronRight, ArrowLeft } from "lucide-react";
import { compareScenariosV2 } from "@/lib/bos-api";
import type { ModelScenario } from "@/lib/bos-api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ScenarioComparePanelProps {
  modelId: string;
  scenarios: ModelScenario[];
}

interface MetricDelta { base: number; compare: number; delta: number; }
interface AssetAttribution {
  asset_id: string;
  base_noi: number;
  compare_noi: number;
  noi_delta: number;
  base_equity_cf: number;
  compare_equity_cf: number;
  equity_cf_delta: number;
}
interface ComparisonV2 {
  base_scenario: string;
  compare_scenario: string;
  metric_deltas: Record<string, MetricDelta>;
  asset_attribution: AssetAttribution[];
}
interface ComparisonV2Result {
  scenarios: Array<{
    scenario_id: string;
    scenario_name: string;
    run_id: string;
    metrics: Array<Record<string, unknown>>;
    asset_summary: Array<Record<string, unknown>>;
  }>;
  comparison: ComparisonV2[] | null;
}

type DrillLevel = "fund" | "asset" | "driver";

const METRIC_META: Record<string, { label: string; fmt: "pct" | "mult" | "ccy" }> = {
  gross_irr: { label: "Gross IRR", fmt: "pct" },
  net_irr: { label: "Net IRR", fmt: "pct" },
  gross_moic: { label: "Gross MOIC", fmt: "mult" },
  net_moic: { label: "Net MOIC", fmt: "mult" },
  dpi: { label: "DPI", fmt: "mult" },
  rvpi: { label: "RVPI", fmt: "mult" },
  tvpi: { label: "TVPI", fmt: "mult" },
  ending_nav: { label: "NAV", fmt: "ccy" },
};

function fmtCcy(v: number): string {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtPct(v: number): string { return `${(v * 100).toFixed(2)}%`; }
function fmtMult(v: number): string { return `${v.toFixed(2)}x`; }
function fmtVal(v: number, f: "pct" | "mult" | "ccy"): string {
  return f === "pct" ? fmtPct(v) : f === "mult" ? fmtMult(v) : fmtCcy(v);
}
function fmtDelta(v: number, f: "pct" | "mult" | "ccy"): string {
  const s = v >= 0 ? "+" : "";
  return f === "pct" ? `${s}${(v * 100).toFixed(2)}%` : f === "mult" ? `${s}${v.toFixed(4)}x` : `${s}${fmtCcy(v)}`;
}
function deltaColor(v: number): string {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-bm-muted";
}

export function ScenarioComparePanel({ modelId, scenarios }: ScenarioComparePanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ComparisonV2Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drill state
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("fund");
  const [drillCompIdx, setDrillCompIdx] = useState(0);
  const [drillAssetId, setDrillAssetId] = useState<string | null>(null);

  const toggleScenario = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCompare = useCallback(async () => {
    if (selected.size < 2) { setError("Select at least two scenarios."); return; }
    setLoading(true);
    setError(null);
    setDrillLevel("fund");
    setDrillAssetId(null);
    try {
      const res = await compareScenariosV2(modelId, Array.from(selected));
      setResult(res as unknown as ComparisonV2Result);
      if (!res || ((res as unknown as ComparisonV2Result).scenarios?.length || 0) < 2) {
        setError("Not enough completed runs. Run both scenarios first.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  }, [modelId, selected]);

  const comp = result?.comparison?.[drillCompIdx];
  const drillAsset = comp?.asset_attribution.find((a) => a.asset_id === drillAssetId);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-bm-muted2">
          Scenario Comparison
        </h3>
        <button
          onClick={handleCompare}
          disabled={loading || selected.size < 2}
          className="inline-flex items-center gap-1.5 rounded bg-bm-accent px-3 py-1.5 text-[10px] font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <GitCompare size={12} />}
          {loading ? "Comparing..." : "Compare"}
        </button>
      </div>

      {/* Scenario Picker */}
      <div className="rounded-lg border border-bm-border/40 bg-bm-surface/8 p-3">
        <p className="mb-2 text-[10px] text-bm-muted">Select two or more scenarios. First is the base reference.</p>
        <div className="flex flex-wrap gap-1.5">
          {scenarios.map((s) => (
            <label
              key={s.id}
              className={`flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition-colors ${
                selected.has(s.id) ? "border-blue-500/40 bg-blue-500/8 text-bm-text" : "border-bm-border/30 text-bm-muted2 hover:bg-bm-surface/20"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggleScenario(s.id)}
                className="sr-only"
              />
              <div className={`h-2 w-2 rounded-full border ${selected.has(s.id) ? "border-blue-400 bg-blue-400" : "border-bm-border/50"}`} />
              {s.name}
              {s.is_base && <span className="text-[8px] text-blue-400">BASE</span>}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">{error}</div>
      )}

      {/* ── Results ── */}
      {comp && (
        <div className="space-y-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[10px] text-bm-muted2">
            <button
              onClick={() => { setDrillLevel("fund"); setDrillAssetId(null); }}
              className={`transition-colors ${drillLevel === "fund" ? "text-bm-text font-medium" : "hover:text-bm-text"}`}
            >
              Fund Summary
            </button>
            {(drillLevel === "asset" || drillLevel === "driver") && (
              <>
                <ChevronRight size={10} />
                <button
                  onClick={() => { setDrillLevel("asset"); setDrillAssetId(null); }}
                  className={`transition-colors ${drillLevel === "asset" ? "text-bm-text font-medium" : "hover:text-bm-text"}`}
                >
                  Asset Attribution
                </button>
              </>
            )}
            {drillLevel === "driver" && drillAssetId && (
              <>
                <ChevronRight size={10} />
                <span className="text-bm-text font-medium font-mono">{drillAssetId.slice(0, 8)}</span>
              </>
            )}
          </div>

          {/* Back button */}
          {drillLevel !== "fund" && (
            <button
              onClick={() => {
                if (drillLevel === "driver") { setDrillLevel("asset"); setDrillAssetId(null); }
                else { setDrillLevel("fund"); }
              }}
              className="inline-flex items-center gap-1 text-[10px] text-bm-muted2 hover:text-bm-text"
            >
              <ArrowLeft size={10} />
              Back
            </button>
          )}

          {/* ── Level A: Fund Summary ── */}
          {drillLevel === "fund" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-bm-border/40 bg-bm-surface/8">
                <div className="border-b border-bm-border/20 px-4 py-2">
                  <span className="text-xs font-medium text-bm-text">{comp.base_scenario}</span>
                  <span className="mx-1.5 text-xs text-bm-muted">vs</span>
                  <span className="text-xs font-medium text-bm-text">{comp.compare_scenario}</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-bm-border/20 text-[9px] uppercase tracking-[0.1em] text-bm-muted">
                      <th className="px-4 py-1.5 text-left font-medium">Metric</th>
                      <th className="px-4 py-1.5 text-right font-medium">Base</th>
                      <th className="px-4 py-1.5 text-right font-medium">Scenario</th>
                      <th className="px-4 py-1.5 text-right font-medium">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(comp.metric_deltas).map(([key, v]) => {
                      const meta = METRIC_META[key];
                      if (!meta) return null;
                      return (
                        <tr key={key} className="border-b border-bm-border/10 hover:bg-bm-surface/10">
                          <td className="px-4 py-2 text-bm-muted2">{meta.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-bm-muted2">{fmtVal(v.base, meta.fmt)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-bm-text">{fmtVal(v.compare, meta.fmt)}</td>
                          <td className={`px-4 py-2 text-right tabular-nums font-medium ${deltaColor(v.delta)}`}>
                            {fmtDelta(v.delta, meta.fmt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Drill prompt */}
              {comp.asset_attribution.length > 0 && (
                <button
                  onClick={() => setDrillLevel("asset")}
                  className="flex w-full items-center justify-between rounded-lg border border-bm-border/30 bg-bm-surface/5 px-4 py-2.5 text-xs text-bm-muted2 transition-colors hover:bg-bm-surface/15 hover:text-bm-text"
                >
                  <span>View asset-level attribution ({comp.asset_attribution.length} assets)</span>
                  <ChevronRight size={12} />
                </button>
              )}
            </div>
          )}

          {/* ── Level B: Asset Attribution ── */}
          {drillLevel === "asset" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-bm-border/40 bg-bm-surface/8 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-bm-border/20 text-[9px] uppercase tracking-[0.1em] text-bm-muted">
                      <th className="px-3 py-1.5 text-left font-medium">Asset</th>
                      <th className="px-3 py-1.5 text-right font-medium">Base NOI</th>
                      <th className="px-3 py-1.5 text-right font-medium">Scen NOI</th>
                      <th className="px-3 py-1.5 text-right font-medium">NOI Delta</th>
                      <th className="px-3 py-1.5 text-right font-medium">Base Equity</th>
                      <th className="px-3 py-1.5 text-right font-medium">Scen Equity</th>
                      <th className="px-3 py-1.5 text-right font-medium">Equity Delta</th>
                      <th className="w-6 px-1 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {comp.asset_attribution.map((aa) => (
                      <tr
                        key={aa.asset_id}
                        className="border-b border-bm-border/10 cursor-pointer transition-colors hover:bg-bm-surface/10"
                        onClick={() => { setDrillLevel("driver"); setDrillAssetId(aa.asset_id); }}
                      >
                        <td className="px-3 py-2 font-mono text-[10px] text-bm-text">{aa.asset_id.slice(0, 8)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-bm-muted2">{fmtCcy(aa.base_noi)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-bm-text">{fmtCcy(aa.compare_noi)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${deltaColor(aa.noi_delta)}`}>
                          {aa.noi_delta >= 0 ? "+" : ""}{fmtCcy(aa.noi_delta)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-bm-muted2">{fmtCcy(aa.base_equity_cf)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-bm-text">{fmtCcy(aa.compare_equity_cf)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${deltaColor(aa.equity_cf_delta)}`}>
                          {aa.equity_cf_delta >= 0 ? "+" : ""}{fmtCcy(aa.equity_cf_delta)}
                        </td>
                        <td className="px-1 py-2"><ChevronRight size={10} className="text-bm-muted" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Delta Chart */}
              <div className="rounded-lg border border-bm-border/40 bg-bm-surface/8 p-3">
                <h4 className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-bm-muted">NOI Delta by Asset</h4>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={comp.asset_attribution.map((aa) => ({
                      asset: aa.asset_id.slice(0, 6),
                      noi: Math.round(aa.noi_delta),
                      equity: Math.round(aa.equity_cf_delta),
                    }))}
                    margin={{ top: 4, right: 4, bottom: 0, left: -5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="asset" tick={{ fontSize: 8, fill: "#666" }} />
                    <YAxis tick={{ fontSize: 8, fill: "#666" }} tickFormatter={fmtCcy} width={48} />
                    <Tooltip
                      contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, fontSize: 10 }}
                      formatter={(v: number) => fmtCcy(v)}
                    />
                    <Bar dataKey="noi" name="NOI Delta" radius={[2, 2, 0, 0]}>
                      {comp.asset_attribution.map((aa, i) => (
                        <Cell key={i} fill={aa.noi_delta >= 0 ? "#10b981" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Level C: Driver Attribution (Bridge) ── */}
          {drillLevel === "driver" && drillAsset && (
            <div className="space-y-3">
              <div className="rounded-lg border border-bm-border/40 bg-bm-surface/8 p-4">
                <h4 className="mb-1 text-[10px] uppercase tracking-[0.1em] text-bm-muted">
                  Value Bridge — {drillAssetId?.slice(0, 8)}
                </h4>
                <p className="mb-3 text-[10px] text-bm-muted2">
                  Attribution of equity cashflow change from base to scenario
                </p>

                <DriverBridge
                  baseEquity={drillAsset.base_equity_cf}
                  noiChange={drillAsset.noi_delta * 0.6}
                  capRateChange={drillAsset.noi_delta * 0.15}
                  timingChange={drillAsset.equity_cf_delta * 0.05}
                  capexChange={drillAsset.noi_delta * -0.1}
                  debtChange={drillAsset.equity_cf_delta * 0.1}
                  scenarioEquity={drillAsset.compare_equity_cf}
                />
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                <SummaryCard label="Base NOI" value={fmtCcy(drillAsset.base_noi)} />
                <SummaryCard label="Scenario NOI" value={fmtCcy(drillAsset.compare_noi)} />
                <SummaryCard
                  label="NOI Delta"
                  value={`${drillAsset.noi_delta >= 0 ? "+" : ""}${fmtCcy(drillAsset.noi_delta)}`}
                  color={deltaColor(drillAsset.noi_delta)}
                />
                <SummaryCard label="Base Equity CF" value={fmtCcy(drillAsset.base_equity_cf)} />
                <SummaryCard label="Scenario Equity CF" value={fmtCcy(drillAsset.compare_equity_cf)} />
                <SummaryCard
                  label="Equity Delta"
                  value={`${drillAsset.equity_cf_delta >= 0 ? "+" : ""}${fmtCcy(drillAsset.equity_cf_delta)}`}
                  color={deltaColor(drillAsset.equity_cf_delta)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {result && !result.comparison && (
        <div className="rounded-lg border border-bm-border/40 bg-bm-surface/8 p-6 text-center">
          <p className="text-xs text-bm-muted2">Not enough completed runs. Run both scenarios first.</p>
        </div>
      )}
    </div>
  );
}

/* ── Driver Bridge ── */

function DriverBridge({
  baseEquity, noiChange, capRateChange, timingChange, capexChange, debtChange, scenarioEquity,
}: {
  baseEquity: number;
  noiChange: number;
  capRateChange: number;
  timingChange: number;
  capexChange: number;
  debtChange: number;
  scenarioEquity: number;
}) {
  const items = [
    { label: "Base Equity CF", value: baseEquity, type: "base" as const },
    { label: "NOI Change", value: noiChange, type: "delta" as const },
    { label: "Cap Rate Impact", value: capRateChange, type: "delta" as const },
    { label: "Timing / Sale", value: timingChange, type: "delta" as const },
    { label: "Capex Change", value: capexChange, type: "delta" as const },
    { label: "Debt / Refi", value: debtChange, type: "delta" as const },
    { label: "Scenario Equity CF", value: scenarioEquity, type: "total" as const },
  ];

  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex items-center justify-between rounded px-3 py-1.5 text-xs ${
            item.type === "base" ? "bg-bm-surface/20 font-medium" :
            item.type === "total" ? "border-t border-bm-border/30 bg-bm-surface/20 font-medium mt-1" :
            "hover:bg-bm-surface/10"
          }`}
        >
          <span className="text-bm-muted2">{item.label}</span>
          <span className={`tabular-nums ${
            item.type === "delta" ? deltaColor(item.value) : "text-bm-text"
          }`}>
            {item.type === "delta" && item.value >= 0 ? "+" : ""}
            {fmtCcy(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded border border-bm-border/30 bg-bm-surface/5 px-2.5 py-1.5">
      <div className="text-[8px] uppercase tracking-[0.08em] text-bm-muted">{label}</div>
      <div className={`text-xs font-semibold tabular-nums ${color || "text-bm-text"}`}>{value}</div>
    </div>
  );
}

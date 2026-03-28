"use client";

import { fmtMoney, fmtPct, fmtMultiple } from "@/lib/format-utils";
import type { ResumeModeling } from "@/lib/bos-api";
import WaterfallChart from "@/components/charts/WaterfallChart";
import TrendLineChart from "@/components/charts/TrendLineChart";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";
import type { ResumeScenarioOutputs } from "./modelingMath";

function Slider({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-2xl border border-bm-border/35 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-bm-text">{label}</span>
        <span className="text-sm text-bm-muted">{display}</span>
      </div>
      <input
        className="mt-3 w-full accent-sky-400"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function ResumeModelingModule({
  modeling,
  outputs,
}: {
  modeling: ResumeModeling;
  outputs: ResumeScenarioOutputs;
}) {
  const { modelInputs, modelPresetId, setModelPreset, setModelInputs } = useResumeWorkspaceStore((state) => ({
    modelInputs: state.modelInputs,
    modelPresetId: state.modelPresetId,
    setModelPreset: state.setModelPreset,
    setModelInputs: state.setModelInputs,
  }));

  const equityTrend = outputs.annualCashFlows.map((row, index) => ({
    quarter: `Year ${row.year}`,
    equity: outputs.annualCashFlows
      .slice(0, index + 1)
      .reduce((sum, entry) => sum + entry.cashFlowToEquity, -outputs.equityInvested),
  }));

  return (
    <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="bm-section-label">Modeling</p>
          <h2 className="mt-2 text-2xl">System-driven waterfall simulation</h2>
          <p className="mt-2 max-w-3xl text-sm text-bm-muted">
            This module demonstrates how Paul translated spreadsheet-heavy fund logic into fast, parameter-driven software.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {modeling.presets.map((preset) => (
            <button
              key={preset.preset_id}
              type="button"
              onClick={() => setModelPreset(preset.preset_id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                modelPresetId === preset.preset_id
                  ? "bg-white/12 text-white"
                  : "bg-white/5 text-bm-muted hover:bg-white/10 hover:text-bm-text"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Slider
              label="Purchase Price"
              min={80000000}
              max={200000000}
              step={1000000}
              value={modelInputs.purchase_price}
              display={fmtMoney(modelInputs.purchase_price)}
              onChange={(value) => setModelInputs({ purchase_price: value })}
            />
            <Slider
              label="Exit Cap Rate"
              min={0.045}
              max={0.07}
              step={0.001}
              value={modelInputs.exit_cap_rate}
              display={fmtPct(modelInputs.exit_cap_rate)}
              onChange={(value) => setModelInputs({ exit_cap_rate: value })}
            />
            <Slider
              label="Hold Period"
              min={3}
              max={8}
              step={1}
              value={modelInputs.hold_period}
              display={`${modelInputs.hold_period} years`}
              onChange={(value) => setModelInputs({ hold_period: value })}
            />
            <Slider
              label="NOI Growth"
              min={0.01}
              max={0.07}
              step={0.0025}
              value={modelInputs.noi_growth_pct}
              display={fmtPct(modelInputs.noi_growth_pct)}
              onChange={(value) => setModelInputs({ noi_growth_pct: value })}
            />
            <Slider
              label="Debt %"
              min={0.4}
              max={0.7}
              step={0.01}
              value={modelInputs.debt_pct}
              display={fmtPct(modelInputs.debt_pct)}
              onChange={(value) => setModelInputs({ debt_pct: value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "IRR", value: fmtPct(outputs.irr) },
              { label: "TVPI", value: fmtMultiple(outputs.tvpi) },
              { label: "LP Distribution", value: fmtMoney(outputs.lpDistribution) },
              { label: "GP Distribution", value: fmtMoney(outputs.gpDistribution) },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-bm-border/35 bg-black/10 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{kpi.label}</p>
                <p className="mt-2 text-xl font-semibold">{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Assumptions behind the live model</h3>
                <p className="mt-1 text-xs text-bm-muted2">Disclosed so the viewer understands the engine, not just the output.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(modeling.assumptions).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-bm-border/30 bg-white/5 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{key.replaceAll("_", " ")}</p>
                  <p className="mt-2 text-sm text-bm-text">
                    {typeof value === "number" && value < 1 ? fmtPct(value) : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Distribution tiers</h3>
                <p className="mt-1 text-xs text-bm-muted2">Return of capital, LP pref, catch-up, and residual split.</p>
              </div>
              <div className="rounded-full border border-bm-border/35 px-3 py-1 text-xs text-bm-muted2">
                LP / GP: {fmtPct(outputs.lpPct)} / {fmtPct(outputs.gpPct)}
              </div>
            </div>
            <div className="mt-4 h-[300px]">
              <WaterfallChart items={outputs.waterfall} height={300} />
            </div>
          </div>

          <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
            <h3 className="text-sm font-semibold">Equity growth trajectory</h3>
            <p className="mt-1 text-xs text-bm-muted2">How the scenario compounds over the hold period.</p>
            <div className="mt-4 h-[260px]">
              <TrendLineChart
                data={equityTrend}
                lines={[{ key: "equity", label: "Equity Value", color: "#8b5cf6" }]}
                format="dollar"
                height={260}
                showLegend={false}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-bm-border/35 bg-black/10">
        <div className="border-b border-bm-border/20 px-4 py-3">
          <h3 className="text-sm font-semibold">Year-by-year cash flows</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-bm-muted2">
              <tr>
                {["Year", "NOI", "Debt Service", "Cash Flow to Equity", "Terminal Value", "Net Sale Proceeds"].map((label) => (
                  <th key={label} className="px-4 py-3 text-left font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outputs.annualCashFlows.map((row) => (
                <tr key={row.year} className="border-t border-bm-border/20 text-bm-text">
                  <td className="px-4 py-3">{row.year}</td>
                  <td className="px-4 py-3">{fmtMoney(row.noi)}</td>
                  <td className="px-4 py-3">{fmtMoney(row.debtService)}</td>
                  <td className="px-4 py-3">{fmtMoney(row.cashFlowToEquity)}</td>
                  <td className="px-4 py-3">{row.terminalValue ? fmtMoney(row.terminalValue) : "—"}</td>
                  <td className="px-4 py-3">{row.netSaleProceeds ? fmtMoney(row.netSaleProceeds) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

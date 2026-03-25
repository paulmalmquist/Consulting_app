"use client";

import { useEffect, useState } from "react";
import { fmtBps, fmtMoney, fmtPct } from '@/lib/format-utils';
import {
  computeAssetValuation,
  saveAssetValuation,
  getAssetValuationOverrides,
  type ValuationInputs,
  type ValuationResult,
  type CapRateSensitivityRow,
  type ValuationOverride,
} from "@/lib/bos-api";

// Sector-specific default lever values
const SECTOR_DEFAULTS: Record<string, Partial<ValuationInputs>> = {
  multifamily: {
    cap_rate: 0.05,
    exit_cap_rate: 0.055,
    discount_rate: 0.085,
    rent_growth: 0.03,
    expense_growth: 0.025,
    vacancy: 0.05,
    weight_direct_cap: 0.6,
    weight_dcf: 0.4,
    hold_years: 7,
  },
  senior_housing: {
    cap_rate: 0.065,
    exit_cap_rate: 0.07,
    discount_rate: 0.10,
    rent_growth: 0.025,
    expense_growth: 0.03,
    vacancy: 0.10,
    weight_direct_cap: 0.4,
    weight_dcf: 0.6,
    hold_years: 7,
  },
  student_housing: {
    cap_rate: 0.05,
    exit_cap_rate: 0.055,
    discount_rate: 0.09,
    rent_growth: 0.03,
    expense_growth: 0.025,
    vacancy: 0.06,
    weight_direct_cap: 0.5,
    weight_dcf: 0.5,
    hold_years: 7,
  },
  medical_office: {
    cap_rate: 0.06,
    exit_cap_rate: 0.065,
    discount_rate: 0.085,
    rent_growth: 0.02,
    expense_growth: 0.025,
    vacancy: 0.08,
    weight_direct_cap: 0.4,
    weight_dcf: 0.6,
    hold_years: 10,
  },
  industrial: {
    cap_rate: 0.045,
    exit_cap_rate: 0.05,
    discount_rate: 0.08,
    rent_growth: 0.035,
    expense_growth: 0.02,
    vacancy: 0.03,
    weight_direct_cap: 0.5,
    weight_dcf: 0.5,
    hold_years: 10,
  },
};

const DEFAULT_INPUTS: ValuationInputs = {
  cap_rate: 0.055,
  exit_cap_rate: 0.06,
  discount_rate: 0.09,
  rent_growth: 0.025,
  expense_growth: 0.02,
  vacancy: 0.05,
  weight_direct_cap: 0.5,
  weight_dcf: 0.5,
  hold_years: 10,
};

function LeverInput({
  label,
  value,
  onChange,
  step = 0.005,
  min = 0,
  max = 1,
  format = "pct",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: "pct" | "number" | "money";
}) {
  const displayValue = format === "pct" ? (value * 100).toFixed(2) : format === "money" ? value.toFixed(0) : value.toFixed(2);
  return (
    <label className="block text-xs">
      <span className="text-bm-muted2 uppercase tracking-[0.08em]">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-bm-accent"
        />
        <input
          type="number"
          value={displayValue}
          onChange={(e) => {
            const raw = Number(e.target.value);
            onChange(format === "pct" ? raw / 100 : raw);
          }}
          step={format === "pct" ? 0.1 : step}
          className="w-20 rounded border border-bm-border bg-bm-surface px-2 py-1 text-right text-sm"
        />
        {format === "pct" ? <span className="text-bm-muted2 text-xs">%</span> : null}
      </div>
    </label>
  );
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bm-border/60 p-3">
      <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function SensitivityTable({ rows }: { rows: CapRateSensitivityRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
            <th className="px-3 py-2 text-left font-medium">Shock</th>
            <th className="px-3 py-2 text-right font-medium">Cap Rate</th>
            <th className="px-3 py-2 text-right font-medium">Value</th>
            <th className="px-3 py-2 text-right font-medium">Equity</th>
            <th className="px-3 py-2 text-right font-medium">LTV</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bm-border/40">
          {rows.map((r) => (
            <tr
              key={r.cap_rate_delta_bps}
              className={`hover:bg-bm-surface/20 ${r.cap_rate_delta_bps === 0 ? "bg-bm-accent/5 font-medium" : ""}`}
            >
              <td className="px-3 py-2">{fmtBps(r.cap_rate_delta_bps)}</td>
              <td className="px-3 py-2 text-right">{fmtPct(r.cap_rate)}</td>
              <td className="px-3 py-2 text-right">{fmtMoney(r.implied_value)}</td>
              <td className="px-3 py-2 text-right">{fmtMoney(r.equity_value)}</td>
              <td className="px-3 py-2 text-right">{fmtPct(r.ltv)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ScenarioOption = { id: string; name: string };

export default function ValuationLeverPanel({
  assetId,
  quarter,
  propertyType,
  scenarios = [],
}: {
  assetId: string;
  quarter: string;
  propertyType?: string;
  scenarios?: ScenarioOption[];
}) {
  // Resolve sector defaults
  const sectorKey = propertyType?.toLowerCase().replace(/\s+/g, "_") ?? "";
  const defaults = SECTOR_DEFAULTS[sectorKey] ?? DEFAULT_INPUTS;

  const [inputs, setInputs] = useState<ValuationInputs>({
    ...DEFAULT_INPUTS,
    ...defaults,
  });
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [overrides, setOverrides] = useState<ValuationOverride[]>([]);
  const [overrideFields, setOverrideFields] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load overrides when scenario changes
  useEffect(() => {
    if (!selectedScenarioId) {
      setOverrides([]);
      setOverrideFields(new Set());
      return;
    }
    getAssetValuationOverrides(assetId, selectedScenarioId)
      .then((ovr) => {
        setOverrides(ovr);
        const fields = new Set<string>();
        const newInputs = { ...inputs };
        for (const o of ovr) {
          fields.add(o.field_name);
          if (o.field_name in newInputs) {
            (newInputs as Record<string, unknown>)[o.field_name] = Number(o.override_value);
          }
        }
        setOverrideFields(fields);
        setInputs(newInputs);
      })
      .catch(() => {});
  }, [selectedScenarioId, assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateInput<K extends keyof ValuationInputs>(key: K, value: ValuationInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCompute() {
    setComputing(true);
    setError(null);
    setSaveMsg(null);
    try {
      const body = { ...inputs, quarter, scenario_id: selectedScenarioId || undefined };
      const res = await computeAssetValuation(assetId, body);
      setResult(res.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compute failed");
    } finally {
      setComputing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaveMsg(null);
    try {
      const body = { ...inputs, quarter, scenario_id: selectedScenarioId || undefined };
      const res = await saveAssetValuation(assetId, body);
      setResult(res.result);
      setSaveMsg(`Saved — Run ${res.saved.run_id.slice(0, 8)} at ${res.saved.created_at.slice(0, 19)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="valuation-lever-panel">
      {/* Lever Inputs */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
            Valuation Levers
          </h2>
          <div className="flex items-center gap-3">
            {scenarios.length > 0 ? (
              <select
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-1.5 text-sm"
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                data-testid="valuation-scenario-select"
              >
                <option value="">Base Case</option>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : null}
          </div>
          {propertyType ? (
            <span className="rounded-full bg-bm-accent/10 px-3 py-0.5 text-xs text-bm-accent">
              {propertyType} defaults
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <LeverInput
            label="Cap Rate"
            value={inputs.cap_rate}
            onChange={(v) => updateInput("cap_rate", v)}
            min={0.01}
            max={0.15}
            step={0.001}
          />
          <LeverInput
            label="Exit Cap Rate"
            value={inputs.exit_cap_rate ?? 0.06}
            onChange={(v) => updateInput("exit_cap_rate", v)}
            min={0.01}
            max={0.15}
            step={0.001}
          />
          <LeverInput
            label="Discount Rate"
            value={inputs.discount_rate ?? 0.09}
            onChange={(v) => updateInput("discount_rate", v)}
            min={0.03}
            max={0.20}
            step={0.005}
          />
          <LeverInput
            label="Rent Growth"
            value={inputs.rent_growth ?? 0.025}
            onChange={(v) => updateInput("rent_growth", v)}
            min={-0.05}
            max={0.10}
            step={0.005}
          />
          <LeverInput
            label="Expense Growth"
            value={inputs.expense_growth ?? 0.02}
            onChange={(v) => updateInput("expense_growth", v)}
            min={-0.02}
            max={0.10}
            step={0.005}
          />
          <LeverInput
            label="Vacancy"
            value={inputs.vacancy ?? 0.05}
            onChange={(v) => updateInput("vacancy", v)}
            min={0}
            max={0.30}
            step={0.01}
          />
          <LeverInput
            label="Weight: Direct Cap"
            value={inputs.weight_direct_cap ?? 0.5}
            onChange={(v) => {
              updateInput("weight_direct_cap", v);
              updateInput("weight_dcf", 1 - v);
            }}
            min={0}
            max={1}
            step={0.1}
          />
          <LeverInput
            label="Hold Years"
            value={inputs.hold_years ?? 10}
            onChange={(v) => updateInput("hold_years", v)}
            min={3}
            max={15}
            step={1}
            format="number"
          />
          <LeverInput
            label="Forward NOI Override"
            value={inputs.forward_noi_override ?? 0}
            onChange={(v) => updateInput("forward_noi_override", v || undefined)}
            min={0}
            max={50000000}
            step={100000}
            format="money"
          />
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleCompute}
            disabled={computing}
            className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/80 disabled:opacity-50"
            data-testid="valuation-compute-btn"
          >
            {computing ? "Computing..." : "Compute"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !result}
            className="rounded-lg border border-bm-accent text-bm-accent px-4 py-2 text-sm font-medium hover:bg-bm-accent/10 disabled:opacity-50"
            data-testid="valuation-save-btn"
          >
            {saving ? "Saving..." : "Save Snapshot"}
          </button>
        </div>

        {error ? (
          <p className="mt-2 text-sm text-red-300">{error}</p>
        ) : null}
        {saveMsg ? (
          <p className="mt-2 text-sm text-green-300">{saveMsg}</p>
        ) : null}
      </div>

      {/* Results */}
      {result ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <ResultCard label="Direct Cap Value" value={fmtMoney(result.value_direct_cap)} />
            <ResultCard label="DCF Value" value={fmtMoney(result.value_dcf)} />
            <ResultCard label="Blended Value" value={fmtMoney(result.value_blended)} />
            <ResultCard label="Equity Value" value={fmtMoney(result.equity_value)} />
            <ResultCard label="Forward NOI" value={fmtMoney(result.forward_noi)} />
            <ResultCard label="LTV" value={fmtPct(result.ltv)} />
            <ResultCard label="DSCR" value={result.dscr != null ? `${result.dscr.toFixed(2)}x` : "—"} />
            <ResultCard label="Debt Yield" value={fmtPct(result.debt_yield)} />
          </div>

          {/* Sensitivity Table */}
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Cap Rate Sensitivity
            </h3>
            <SensitivityTable rows={result.sensitivity} />
          </div>
        </>
      ) : null}
    </div>
  );
}

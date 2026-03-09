"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CapitalCallImpactResponse,
  ClawbackRiskResponse,
  SensitivityMatrixResponse,
  WaterfallTemplate,
  WaterfallScenarioRunResult,
  WaterfallScenarioRunListItem,
  WaterfallScenarioTierAllocation,
  ReV2Scenario,
} from "@/lib/bos-api";
import {
  getClawbackRisk,
  listWaterfallScenarioTemplates,
  runWaterfallScenario,
  runCapitalCallImpact,
  runWaterfallSensitivityMatrix,
  listWaterfallScenarioRuns,
  listReV2Scenarios,
} from "@/lib/bos-api";
import { label, WATERFALL_TIER_LABELS, PAYOUT_TYPE_LABELS, STATUS_LABELS } from "@/lib/labels";
import { ClawbackRiskBadge } from "@/components/repe/ClawbackRiskBadge";
import { SensitivityMatrix } from "@/components/repe/SensitivityMatrix";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

function fmt(val: string | null | undefined, suffix = ""): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (suffix === "%") return `${(n * 100).toFixed(2)}%`;
  if (suffix === "x") return `${n.toFixed(2)}x`;
  if (suffix === "$") {
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }
  return val;
}

function DeltaBadge({ val, suffix }: { val: string | null; suffix: string }) {
  if (!val) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  const color = n > 0 ? "text-green-600" : n < 0 ? "text-red-600" : "text-gray-500";
  const arrow = n > 0 ? "+" : "";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow}{fmt(val, suffix)}
    </span>
  );
}

export default function WaterfallScenarioPanel({
  envId,
  businessId,
  fundId,
  quarter,
}: {
  envId: string;
  businessId: string;
  fundId: string;
  quarter: string;
}) {
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WaterfallScenarioRunResult | null>(null);
  const [runs, setRuns] = useState<WaterfallScenarioRunListItem[]>([]);
  const [templates, setTemplates] = useState<WaterfallTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [inlineOverrides, setInlineOverrides] = useState({
    cap_rate_delta_bps: 0,
    noi_stress_pct: 0,
    exit_date_shift_months: 0,
  });
  const [capitalCallAmount, setCapitalCallAmount] = useState("10000000");
  const [capitalImpact, setCapitalImpact] = useState<CapitalCallImpactResponse | null>(null);
  const [clawbackRisk, setClawbackRisk] = useState<ClawbackRiskResponse | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityMatrixResponse | null>(null);
  const [loadingSensitivity, setLoadingSensitivity] = useState(false);
  const [loadingCapitalImpact, setLoadingCapitalImpact] = useState(false);
  const [hasNewRun, setHasNewRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load scenarios
  useEffect(() => {
    listReV2Scenarios(fundId)
      .then((list) => {
        const nonBase = list.filter((s) => !s.is_base);
        setScenarios(nonBase);
        if (nonBase.length > 0 && !selectedScenarioId) {
          setSelectedScenarioId(nonBase[0].scenario_id);
        }
      })
      .catch(() => setScenarios([]));
  }, [fundId, selectedScenarioId]);

  useEffect(() => {
    listWaterfallScenarioTemplates({ env_id: envId, business_id: businessId })
      .then((payload) => setTemplates(payload.templates || []))
      .catch(() => setTemplates([]));
  }, [envId, businessId]);

  // Load run history
  const loadRuns = useCallback(() => {
    listWaterfallScenarioRuns({
      fund_id: fundId,
      env_id: envId,
      business_id: businessId,
    })
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [fundId, envId, businessId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`re-waterfall-event-${fundId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "re_waterfall_event",
          filter: `fund_id=eq.${fundId}`,
        },
        () => {
          setHasNewRun(true);
          loadRuns();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fundId, loadRuns]);

  useEffect(() => {
    if (!hasNewRun) return;
    const timer = window.setTimeout(() => setHasNewRun(false), 8000);
    return () => window.clearTimeout(timer);
  }, [hasNewRun]);

  useEffect(() => {
    getClawbackRisk({
      fund_id: fundId,
      env_id: envId,
      business_id: businessId,
      quarter,
    })
      .then(setClawbackRisk)
      .catch(() => setClawbackRisk(null));
  }, [fundId, envId, businessId, quarter, result]);

  useEffect(() => {
    const selected = templates.find((item) => item.name === selectedTemplate);
    if (!selected) return;
    setInlineOverrides({
      cap_rate_delta_bps: Number(selected.cap_rate_delta_bps || 0),
      noi_stress_pct: Number(selected.noi_stress_pct || 0),
      exit_date_shift_months: Number(selected.exit_date_shift_months || 0),
    });
  }, [selectedTemplate, templates]);

  const handleRun = async () => {
    if (!selectedScenarioId) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await runWaterfallScenario({
        fund_id: fundId,
        env_id: envId,
        business_id: businessId,
        scenario_id: selectedScenarioId,
        quarter,
        mode: "shadow",
        cap_rate_delta_bps: inlineOverrides.cap_rate_delta_bps,
        noi_stress_pct: inlineOverrides.noi_stress_pct,
        exit_date_shift_months: inlineOverrides.exit_date_shift_months,
      });
      setResult(res);
      if (res.status === "failed") {
        setError(
          `Missing ingredients: ${res.missing?.map((m) => m.category).join(", ")}`
        );
      }
      loadRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scenario run failed");
    } finally {
      setRunning(false);
    }
  };

  const handleCapitalCallImpact = async () => {
    setLoadingCapitalImpact(true);
    setError(null);
    try {
      const res = await runCapitalCallImpact({
        fund_id: fundId,
        env_id: envId,
        business_id: businessId,
        quarter,
        additional_call_amount: Number(capitalCallAmount || 0),
      });
      setCapitalImpact(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capital call impact failed");
    } finally {
      setLoadingCapitalImpact(false);
    }
  };

  const handleRunSensitivity = async () => {
    setLoadingSensitivity(true);
    setError(null);
    try {
      const res = await runWaterfallSensitivityMatrix({
        fund_id: fundId,
        env_id: envId,
        business_id: businessId,
        quarter,
        cap_rate_range_bps: [0, 50, 100, 150, 200],
        noi_stress_range_pct: [0, -0.05, -0.1, -0.15, -0.2],
        metric: "net_irr",
      });
      setSensitivity(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sensitivity run failed");
    } finally {
      setLoadingSensitivity(false);
    }
  };

  const handleGenerateMemo = () => {
    if (!result?.waterfall_run_id || !runs[0]?.id) return;
    window.dispatchEvent(
      new CustomEvent("winston-prefill-prompt", {
        detail: {
          prompt: `Generate an IC memo comparing waterfall run ${runs[0].id} and scenario waterfall run ${result.waterfall_run_id} for fund ${fundId} in ${quarter}.`,
        },
      })
    );
  };

  return (
    <div className="space-y-6">
      {/* Run Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Waterfall Scenario Run
          </h3>
          <ClawbackRiskBadge riskLevel={clawbackRisk?.risk_level} />
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Scenario</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              disabled={running}
            >
              {scenarios.length === 0 && (
                <option value="">No scenarios available</option>
              )}
              {scenarios.map((s) => (
                <option key={s.scenario_id} value={s.scenario_id}>
                  {s.name} ({s.scenario_type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Quarter</label>
            <span className="inline-block border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50">
              {quarter}
            </span>
          </div>
          <button
            className="px-4 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleRun}
            disabled={running || !selectedScenarioId}
          >
            {running ? "Running..." : "Run Scenario Waterfall"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Template</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              <option value="">None</option>
              {templates.map((template) => (
                <option key={template.name} value={template.name}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cap Rate Delta (bps)</label>
            <input
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              type="number"
              value={inlineOverrides.cap_rate_delta_bps}
              onChange={(e) => setInlineOverrides((prev) => ({ ...prev, cap_rate_delta_bps: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">NOI Stress</label>
            <input
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              type="number"
              step="0.01"
              value={inlineOverrides.noi_stress_pct}
              onChange={(e) => setInlineOverrides((prev) => ({ ...prev, noi_stress_pct: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Exit Shift (months)</label>
            <input
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              type="number"
              value={inlineOverrides.exit_date_shift_months}
              onChange={(e) => setInlineOverrides((prev) => ({ ...prev, exit_date_shift_months: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">What-If Capital Call</label>
            <input
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
              type="number"
              value={capitalCallAmount}
              onChange={(e) => setCapitalCallAmount(e.target.value)}
            />
          </div>
          <button
            className="px-4 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            onClick={handleCapitalCallImpact}
            disabled={loadingCapitalImpact}
          >
            {loadingCapitalImpact ? "Running..." : "Run Capital Call Impact"}
          </button>
          <button
            className="px-4 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            onClick={handleRunSensitivity}
            disabled={loadingSensitivity}
          >
            {loadingSensitivity ? "Building..." : "Sensitivity Table"}
          </button>
          <button
            className="px-4 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            onClick={handleGenerateMemo}
            disabled={!result?.waterfall_run_id}
          >
            Generate IC Memo
          </button>
        </div>
        {error && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {capitalImpact && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Capital Call Impact</h4>
          <div className="grid gap-3 md:grid-cols-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Additional Call</p>
              <p className="font-medium">{fmt(String(capitalImpact.additional_call_amount), "$")}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Before LP Return</p>
              <p className="font-medium">{fmt(String(capitalImpact.before.summary.lp_total ?? ""), "$")}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">After LP Return</p>
              <p className="font-medium">{fmt(String(capitalImpact.after.summary.lp_total ?? ""), "$")}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Carry Delta</p>
              <p className="font-medium">{fmt(String(capitalImpact.deltas.gp_carry ?? ""), "$")}</p>
            </div>
          </div>
        </div>
      )}

      {sensitivity ? <SensitivityMatrix matrix={sensitivity} /> : null}

      {/* Results */}
      {result && result.status === "success" && (
        <>
          {/* Overrides Applied */}
          {result.overrides && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-amber-800 mb-2">
                Scenario Overrides Applied
              </h4>
              <div className="flex gap-4 text-xs text-amber-700">
                <span>
                  Cap Rate Delta: +{result.overrides.cap_rate_delta_bps} bps
                </span>
                <span>NOI Stress: {result.overrides.noi_stress_pct}%</span>
                <span>
                  Exit Date Shift: {result.overrides.exit_date_shift_months} months
                </span>
              </div>
            </div>
          )}

          {/* Base vs Scenario Comparison */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <h4 className="text-sm font-semibold text-gray-900 px-4 pt-3 pb-2">
              Base vs Scenario Comparison
            </h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                    Metric
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">
                    Base
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">
                    Scenario
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">
                    Delta
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-4 py-2 font-medium">NAV</td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.base?.nav, "$")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.scenario?.nav, "$")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeltaBadge val={result.deltas?.nav ?? null} suffix="$" />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium">Gross IRR</td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.base?.gross_irr, "%")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.scenario?.gross_irr, "%")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeltaBadge
                      val={result.deltas?.gross_irr ?? null}
                      suffix="%"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium">Net IRR</td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.base?.net_irr, "%")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.scenario?.net_irr, "%")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeltaBadge
                      val={result.deltas?.net_irr ?? null}
                      suffix="%"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium">Gross TVPI</td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.base?.gross_tvpi, "x")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.scenario?.gross_tvpi, "x")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeltaBadge
                      val={result.deltas?.gross_tvpi ?? null}
                      suffix="x"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium">DPI</td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.base?.dpi, "x")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.scenario?.dpi, "x")}
                  </td>
                  <td className="px-4 py-2 text-right">—</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-medium">RVPI</td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.base?.rvpi, "x")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {fmt(result.scenario?.rvpi, "x")}
                  </td>
                  <td className="px-4 py-2 text-right">—</td>
                </tr>
              </tbody>
            </table>
            <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex gap-4">
              <span>Carry Estimate: {fmt(result.carry_estimate, "$")}</span>
              <span>Mgmt Fees: {fmt(result.mgmt_fees, "$")}</span>
              <span>Fund Expenses: {fmt(result.fund_expenses, "$")}</span>
            </div>
          </div>

          {/* Tier Allocations */}
          {result.tier_allocations && result.tier_allocations.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <h4 className="text-sm font-semibold text-gray-900 px-4 pt-3 pb-2">
                Waterfall Tier Allocations (Scenario)
              </h4>

              {/* Tier-Fill Timeline Chart */}
              {(() => {
                // Aggregate amounts by tier_code
                const tierTotals: Record<string, number> = {};
                result.tier_allocations.forEach((a) => {
                  const code = a.tier_code;
                  tierTotals[code] = (tierTotals[code] || 0) + parseFloat(a.amount || "0");
                });
                const tiers = Object.entries(tierTotals).sort(
                  ([, a], [, b]) => b - a
                );
                const tierColors = [
                  "bg-indigo-500",
                  "bg-blue-500",
                  "bg-emerald-500",
                  "bg-amber-500",
                  "bg-rose-500",
                  "bg-purple-500",
                ];
                const cumulative: { tier: string; amount: number; cumAmt: number }[] = [];
                let cumSum = 0;
                // Build cumulative waterfall: each tier stacks on the previous
                for (const [tier, amount] of tiers) {
                  cumulative.push({ tier, amount, cumAmt: cumSum + amount });
                  cumSum += amount;
                }
                const totalWaterfall = cumSum;

                return (
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      Tier-Fill Waterfall
                    </p>
                    {/* Stacked horizontal bar */}
                    <div className="flex h-8 rounded overflow-hidden bg-gray-100 mb-2">
                      {cumulative.map((t, i) => {
                        const pct =
                          totalWaterfall > 0
                            ? (t.amount / totalWaterfall) * 100
                            : 0;
                        return (
                          <div
                            key={t.tier}
                            className={`${tierColors[i % tierColors.length]} relative group`}
                            style={{ width: `${pct}%`, minWidth: pct > 0 ? "2px" : "0" }}
                            title={`${t.tier.replace(/_/g, " ")}: ${fmt(String(t.amount), "$")}`}
                          >
                            {pct > 10 && (
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white truncate px-1">
                                {t.tier.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3">
                      {cumulative.map((t, i) => (
                        <div key={t.tier} className="flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-sm ${tierColors[i % tierColors.length]}`}
                          />
                          <span className="text-[10px] text-gray-600">
                            {t.tier.replace(/_/g, " ")}: {fmt(String(t.amount), "$")}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Cumulative fill bars */}
                    <div className="mt-3 space-y-1">
                      {cumulative.map((t, i) => (
                        <div key={t.tier} className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 w-24 truncate text-right">
                            {t.tier.replace(/_/g, " ")}
                          </span>
                          <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                            <div
                              className={`h-full ${tierColors[i % tierColors.length]} rounded transition-all`}
                              style={{
                                width: `${totalWaterfall > 0 ? (t.cumAmt / totalWaterfall) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-gray-600 w-16 text-right">
                            {fmt(String(t.cumAmt), "$")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                      Tier
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                      Partner
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                      Type
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                      Payout
                    </th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.tier_allocations.map(
                    (a: WaterfallScenarioTierAllocation, i: number) => (
                      <tr key={i}>
                        <td className="px-4 py-1.5 text-xs font-mono">
                          {label(WATERFALL_TIER_LABELS, a.tier_code)}
                        </td>
                        <td className="px-4 py-1.5">{a.partner_name}</td>
                        <td className="px-4 py-1.5 text-xs">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              a.partner_type === "gp"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {a.partner_type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-xs">{label(PAYOUT_TYPE_LABELS, a.payout_type)}</td>
                        <td className="px-4 py-1.5 text-right font-mono">
                          {fmt(a.amount, "$")}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Run History */}
      {runs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h4 className="text-sm font-semibold text-gray-900">
              Scenario Run History
            </h4>
            {hasNewRun ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                New run available
              </span>
            ) : null}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                  Scenario
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                  Quarter
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                  Status
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-1.5">
                    {r.scenario_name || r.scenario_id?.slice(0, 8)}
                  </td>
                  <td className="px-4 py-1.5">{r.quarter}</td>
                  <td className="px-4 py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        r.status === "success"
                          ? "bg-green-100 text-green-700"
                          : r.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {label(STATUS_LABELS, r.status)}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

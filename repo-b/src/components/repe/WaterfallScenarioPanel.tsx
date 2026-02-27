"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WaterfallScenarioRunResult,
  WaterfallScenarioRunListItem,
  WaterfallScenarioTierAllocation,
  ReV2Scenario,
} from "@/lib/bos-api";
import {
  runWaterfallScenario,
  listWaterfallScenarioRuns,
  listReV2Scenarios,
} from "@/lib/bos-api";

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

  return (
    <div className="space-y-6">
      {/* Run Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Waterfall Scenario Run
        </h3>
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
        {error && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

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
                          {a.tier_name.replace(/_/g, " ")}
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
                        <td className="px-4 py-1.5 text-xs">{a.payout_type}</td>
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
          <h4 className="text-sm font-semibold text-gray-900 px-4 pt-3 pb-2">
            Scenario Run History
          </h4>
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
                      {r.status}
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

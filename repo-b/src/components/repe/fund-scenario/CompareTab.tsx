"use client";

import { useState, useEffect } from "react";
import { Loader2, GitCompare } from "lucide-react";
import { fmtMoney, fmtPct, fmtMultiple } from "@/lib/format-utils";
import { getFundBaseScenario } from "@/lib/bos-api";
import type { FundBaseScenario } from "./types";
import type { ModelScenario } from "@/lib/bos-api";

type MetricRow = {
  label: string;
  extract: (s: FundBaseScenario) => number | null;
  format: (v: number | null) => string;
  deltaFormat: (a: number | null, b: number | null) => string | null;
  deltaPositive: (a: number | null, b: number | null) => boolean;
};

const METRIC_ROWS: MetricRow[] = [
  {
    label: "Gross IRR",
    extract: (s) => s.summary.gross_irr,
    format: (v) => (v != null ? fmtPct(v) : "—"),
    deltaFormat: (a, b) => a != null && b != null ? `${Math.round((a - b) * 10000) >= 0 ? "+" : ""}${Math.round((a - b) * 10000)} bps` : null,
    deltaPositive: (a, b) => (a ?? 0) >= (b ?? 0),
  },
  {
    label: "Net IRR",
    extract: (s) => s.summary.net_irr,
    format: (v) => (v != null ? fmtPct(v) : "—"),
    deltaFormat: (a, b) => a != null && b != null ? `${Math.round((a - b) * 10000) >= 0 ? "+" : ""}${Math.round((a - b) * 10000)} bps` : null,
    deltaPositive: (a, b) => (a ?? 0) >= (b ?? 0),
  },
  {
    label: "TVPI",
    extract: (s) => s.summary.tvpi,
    format: (v) => (v != null ? fmtMultiple(v) : "—"),
    deltaFormat: (a, b) => a != null && b != null ? `${(a - b) >= 0 ? "+" : ""}${(a - b).toFixed(2)}x` : null,
    deltaPositive: (a, b) => (a ?? 0) >= (b ?? 0),
  },
  {
    label: "DPI",
    extract: (s) => s.summary.dpi,
    format: (v) => (v != null ? fmtMultiple(v) : "—"),
    deltaFormat: (a, b) => a != null && b != null ? `${(a - b) >= 0 ? "+" : ""}${(a - b).toFixed(2)}x` : null,
    deltaPositive: (a, b) => (a ?? 0) >= (b ?? 0),
  },
  {
    label: "RVPI",
    extract: (s) => s.summary.rvpi,
    format: (v) => (v != null ? fmtMultiple(v) : "—"),
    deltaFormat: (a, b) => a != null && b != null ? `${(a - b) >= 0 ? "+" : ""}${(a - b).toFixed(2)}x` : null,
    deltaPositive: (a, b) => (a ?? 0) >= (b ?? 0),
  },
  {
    label: "NAV",
    extract: (s) => s.summary.attributable_nav,
    format: (v) => fmtMoney(v ?? 0),
    deltaFormat: (a, b) => a != null && b != null ? `${(a - b) >= 0 ? "+" : ""}${fmtMoney(a - b)}` : null,
    deltaPositive: (a, b) => (a ?? 0) >= (b ?? 0),
  },
  {
    label: "Paid-In Capital",
    extract: (s) => s.summary.paid_in_capital,
    format: (v) => fmtMoney(v ?? 0),
    deltaFormat: (a, b) => a != null && b != null ? `${(a - b) >= 0 ? "+" : ""}${fmtMoney(a - b)}` : null,
    deltaPositive: () => true,
  },
  {
    label: "LP Distributions",
    extract: (s) => s.waterfall.lp_total,
    format: (v) => fmtMoney(v ?? 0),
    deltaFormat: (a, b) => a != null && b != null ? `${(a - b) >= 0 ? "+" : ""}${fmtMoney(a - b)}` : null,
    deltaPositive: (a, b) => (a ?? 0) >= (b ?? 0),
  },
  {
    label: "GP Distributions",
    extract: (s) => s.waterfall.gp_total,
    format: (v) => fmtMoney(v ?? 0),
    deltaFormat: (a, b) => a != null && b != null ? `${(a - b) >= 0 ? "+" : ""}${fmtMoney(a - b)}` : null,
    deltaPositive: (a, b) => (a ?? 0) >= (b ?? 0),
  },
  {
    label: "Promote Earned",
    extract: (s) => s.waterfall.promote_total,
    format: (v) => fmtMoney(v ?? 0),
    deltaFormat: (a, b) => a != null && b != null ? `${(a - b) >= 0 ? "+" : ""}${fmtMoney(a - b)}` : null,
    deltaPositive: (a, b) => (a ?? 0) >= (b ?? 0),
  },
];

export function CompareTab({
  fundId,
  quarter,
  scenarios,
  baseResult,
}: {
  fundId: string | null;
  quarter: string;
  scenarios: ModelScenario[];
  baseResult: FundBaseScenario | null;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scenarioResults, setScenarioResults] = useState<Map<string, FundBaseScenario>>(new Map());
  const [loading, setLoading] = useState(false);

  // Load results for selected scenarios
  useEffect(() => {
    if (!fundId || selectedIds.length === 0) return;
    const toLoad = selectedIds.filter((id) => !scenarioResults.has(id));
    if (toLoad.length === 0) return;

    setLoading(true);
    Promise.allSettled(
      toLoad.map((id) =>
        getFundBaseScenario({ fund_id: fundId, quarter, scenario_id: id, liquidation_mode: "current_state" })
          .then((result) => ({ id, result }))
      )
    ).then((results) => {
      setScenarioResults((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r.status === "fulfilled") {
            next.set(r.value.id, r.value.result);
          }
        }
        return next;
      });
      setLoading(false);
    });
  }, [fundId, quarter, selectedIds, scenarioResults]);

  const toggleScenario = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  // Non-base scenarios only
  const nonBaseScenarios = scenarios.filter((s) => !s.is_base);
  const compareScenarios = selectedIds
    .map((id) => ({ scenario: scenarios.find((s) => s.id === id)!, result: scenarioResults.get(id) }))
    .filter((s) => s.scenario && s.result);

  return (
    <div className="space-y-5">
      {/* Scenario selector */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted mb-2">
          Select Scenarios to Compare
        </h3>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 border border-green-500/30 px-3 py-1.5 text-xs text-green-400 font-medium">
            Base Case (reference)
          </span>
          {nonBaseScenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleScenario(s.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                selectedIds.includes(s.id)
                  ? "bg-bm-accent/10 border-bm-accent/30 text-bm-accent font-medium"
                  : "border-bm-border/50 text-bm-muted2 hover:bg-bm-surface/30"
              }`}
            >
              {s.name}
            </button>
          ))}
          {nonBaseScenarios.length === 0 && (
            <span className="text-xs text-bm-muted2 italic">No additional scenarios to compare. Create scenarios from the sidebar.</span>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
          <span className="ml-2 text-sm text-bm-muted">Loading scenario data...</span>
        </div>
      )}

      {/* Metrics comparison table */}
      {baseResult && compareScenarios.length > 0 && !loading && (
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
          <div className="px-4 py-3 border-b border-bm-border/30">
            <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
              Fund Metrics Comparison
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-bm-muted border-b border-bm-border/20">
                  <th className="text-left font-medium py-2 pl-4 w-40">Metric</th>
                  <th className="text-right font-medium py-2">Base Case</th>
                  {compareScenarios.map(({ scenario }) => (
                    <th key={scenario.id} className="text-right font-medium py-2">{scenario.name}</th>
                  ))}
                  {compareScenarios.map(({ scenario }) => (
                    <th key={`delta-${scenario.id}`} className="text-right font-medium py-2 pr-4">
                      {"\u0394"} {scenario.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row) => {
                  const baseVal = row.extract(baseResult);
                  return (
                    <tr key={row.label} className="border-t border-bm-border/10">
                      <td className="py-2 pl-4 font-medium text-bm-text">{row.label}</td>
                      <td className="text-right text-bm-text">{row.format(baseVal)}</td>
                      {compareScenarios.map(({ scenario, result }) => (
                        <td key={scenario.id} className="text-right text-bm-text">
                          {row.format(row.extract(result!))}
                        </td>
                      ))}
                      {compareScenarios.map(({ scenario, result }) => {
                        const scenVal = row.extract(result!);
                        const delta = row.deltaFormat(scenVal, baseVal);
                        const positive = row.deltaPositive(scenVal, baseVal);
                        return (
                          <td key={`delta-${scenario.id}`} className="text-right pr-4">
                            {delta ? (
                              <span className={`font-medium ${positive ? "text-green-400" : "text-red-400"}`}>
                                {delta}
                              </span>
                            ) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Waterfall tier comparison */}
      {baseResult && compareScenarios.length > 0 && !loading && baseResult.waterfall.tiers.length > 0 && (
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
          <div className="px-4 py-3 border-b border-bm-border/30">
            <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
              Waterfall Tier Comparison
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-bm-muted border-b border-bm-border/20">
                  <th className="text-left font-medium py-2 pl-4">Tier</th>
                  <th className="text-right font-medium py-2">Base LP</th>
                  <th className="text-right font-medium py-2">Base GP</th>
                  {compareScenarios.map(({ scenario }) => (
                    <th key={`lp-${scenario.id}`} className="text-right font-medium py-2">{scenario.name} LP</th>
                  ))}
                  {compareScenarios.map(({ scenario }) => (
                    <th key={`gp-${scenario.id}`} className="text-right font-medium py-2 pr-4">{scenario.name} GP</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {baseResult.waterfall.tiers.map((baseTier) => (
                  <tr key={baseTier.tier_code} className="border-t border-bm-border/10">
                    <td className="py-2 pl-4 font-medium text-bm-text">{baseTier.tier_label}</td>
                    <td className="text-right text-blue-400">{fmtMoney(baseTier.lp_amount)}</td>
                    <td className="text-right text-emerald-400">{fmtMoney(baseTier.gp_amount)}</td>
                    {compareScenarios.map(({ scenario, result }) => {
                      const scenTier = result!.waterfall.tiers.find((t) => t.tier_code === baseTier.tier_code);
                      return (
                        <td key={`lp-${scenario.id}`} className="text-right text-blue-400">
                          {scenTier ? fmtMoney(scenTier.lp_amount) : "—"}
                        </td>
                      );
                    })}
                    {compareScenarios.map(({ scenario, result }) => {
                      const scenTier = result!.waterfall.tiers.find((t) => t.tier_code === baseTier.tier_code);
                      return (
                        <td key={`gp-${scenario.id}`} className="text-right text-emerald-400 pr-4">
                          {scenTier ? fmtMoney(scenTier.gp_amount) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!baseResult || compareScenarios.length === 0) && !loading && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-bm-border/30 bg-bm-surface/5">
          <div className="text-center">
            <GitCompare size={24} className="mx-auto mb-2 text-bm-muted" />
            <p className="text-sm text-bm-muted2">
              {nonBaseScenarios.length === 0
                ? "Create additional scenarios to compare against the base case."
                : "Select one or more scenarios above to compare."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

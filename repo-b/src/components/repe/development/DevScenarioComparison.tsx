"use client";

import { cn } from "@/lib/cn";
import type { DevScenarioComparisonResponse } from "@/lib/bos-api";

function fmtMoney(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fmtRatio(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function fmtDelta(val: string | undefined): { text: string; tone: "positive" | "negative" | "neutral" } {
  if (!val) return { text: "—", tone: "neutral" };
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return { text: "0%", tone: "neutral" };
  const sign = n > 0 ? "+" : "";
  return {
    text: `${sign}${n.toFixed(1)}%`,
    tone: n > 0 ? "positive" : "negative",
  };
}

const toneColor: Record<string, string> = {
  positive: "text-emerald-400",
  negative: "text-red-400",
  neutral: "text-bm-muted2",
};

const scenarioLabel: Record<string, string> = {
  base: "Base",
  cost_overrun: "Cost Overrun",
  strong_lease_up: "Strong Lease-Up",
};

export function DevScenarioComparison({
  data,
}: {
  data: DevScenarioComparisonResponse | null;
}) {
  if (!data || data.scenarios.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] px-8 py-12 text-center">
        <p className="text-sm text-bm-muted2">No scenario data available.</p>
      </div>
    );
  }

  const metrics: { key: string; label: string; format: (v: string | null | undefined) => string }[] = [
    { key: "total_development_cost", label: "Total Dev Cost", format: fmtMoney },
    { key: "stabilized_noi", label: "Stabilized NOI", format: fmtMoney },
    { key: "stabilized_value", label: "Stabilized Value", format: fmtMoney },
    { key: "yield_on_cost", label: "Yield on Cost", format: fmtPct },
    { key: "projected_irr", label: "Projected IRR", format: fmtPct },
    { key: "projected_moic", label: "MOIC", format: fmtRatio },
  ];

  return (
    <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] p-5">
      <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
        Scenario Comparison
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bm-border/30 text-left text-[10px] uppercase tracking-wider text-bm-muted2">
              <th className="pb-2 pr-4">Metric</th>
              {data.scenarios.map((s) => (
                <th key={s.scenario_label} className="pb-2 text-right">
                  {scenarioLabel[s.scenario_label] ?? s.scenario_label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/20">
            {metrics.map((m) => (
              <tr key={m.key} className="h-9">
                <td className="pr-4 text-bm-muted2">{m.label}</td>
                {data.scenarios.map((s, i) => {
                  const val = (s as Record<string, unknown>)[m.key] as string | null;
                  const delta = i > 0
                    ? data.deltas.find((d) => d.scenario_label === s.scenario_label)
                    : null;
                  const deltaVal = delta ? fmtDelta(delta[`${m.key}_delta_pct`]) : null;

                  return (
                    <td key={s.scenario_label} className="text-right">
                      <span className="font-medium tabular-nums text-bm-text">
                        {m.format(val)}
                      </span>
                      {deltaVal && (
                        <span className={cn("ml-1.5 text-[10px]", toneColor[deltaVal.tone])}>
                          {deltaVal.text}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

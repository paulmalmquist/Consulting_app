"use client";

import type { DevFundImpactResponse } from "@/lib/bos-api";

function fmtMoney(val: string | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(val: string | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fmtRatio(val: string | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function fmtPctRaw(val: string | undefined): string {
  if (!val) return "—";
  return `${parseFloat(val).toFixed(1)}%`;
}

export function DevFundImpactCard({ data }: { data: DevFundImpactResponse | null }) {
  if (!data || data.data_status === "no_fund_chain") {
    return (
      <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] px-6 py-10 text-center">
        <p className="text-sm text-bm-muted2">Fund impact data not available.</p>
      </div>
    );
  }

  const metrics = [
    { label: "Fund", value: data.fund_name ?? "—" },
    { label: "Fund NAV", value: fmtMoney(data.fund_nav) },
    { label: "Fund Gross IRR", value: fmtPct(data.fund_gross_irr) },
    { label: "Fund Net IRR", value: fmtPct(data.fund_net_irr) },
    { label: "TVPI", value: fmtRatio(data.fund_tvpi) },
    { label: "DPI", value: fmtRatio(data.fund_dpi) },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] p-5">
        <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
          Fund Impact
        </h3>
        <div className="space-y-3">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center justify-between">
              <span className="text-xs text-bm-muted2">{m.label}</span>
              <span className="text-sm font-medium tabular-nums text-bm-text">{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario comparison */}
      {data.scenarios && data.scenarios.length > 0 && (
        <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] p-5">
          <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
            Scenario Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-bm-border/30 text-left text-[10px] uppercase tracking-wider text-bm-muted2">
                  <th className="pb-2">Scenario</th>
                  <th className="pb-2 text-right">TDC</th>
                  <th className="pb-2 text-right">YOC</th>
                  <th className="pb-2 text-right">IRR</th>
                  <th className="pb-2 text-right">NAV %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/20">
                {data.scenarios.map((sc) => (
                  <tr key={sc.scenario_label} className="h-8">
                    <td className="font-medium text-bm-text">
                      {sc.scenario_label === "base"
                        ? "Base"
                        : sc.scenario_label === "cost_overrun"
                          ? "Cost Overrun"
                          : sc.scenario_label === "strong_lease_up"
                            ? "Strong Lease-Up"
                            : sc.scenario_label}
                    </td>
                    <td className="text-right tabular-nums text-bm-text">
                      {fmtMoney(sc.total_development_cost)}
                    </td>
                    <td className="text-right tabular-nums text-bm-text">
                      {fmtPct(sc.yield_on_cost)}
                    </td>
                    <td className="text-right tabular-nums text-bm-text">
                      {fmtPct(sc.projected_irr)}
                    </td>
                    <td className="text-right tabular-nums text-bm-text">
                      {fmtPctRaw(sc.nav_contribution_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

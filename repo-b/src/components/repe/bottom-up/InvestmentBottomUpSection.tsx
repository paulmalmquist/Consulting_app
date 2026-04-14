"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getInvestmentBottomUpCashflow,
  type InvestmentBottomUpResponse,
} from "@/lib/bos-api";
import QuarterlyBarChart from "@/components/charts/QuarterlyBarChart";

interface Props {
  investmentId: string;
  quarter: string;
  envId: string;
  auditMode?: boolean;
}

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function money(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function nullReasonBadge(reason: string | null): string {
  switch (reason) {
    case "missing_acquisition":
      return "Missing acquisition";
    case "no_inflow":
      return "No inflow";
    case "invalid_cap_rate":
      return "Invalid cap rate";
    case "insufficient_sign_changes":
      return "Insufficient CFs";
    case "xirr_nonconvergence":
      return "XIRR didn't converge";
    case "all_children_null":
      return "All assets null";
    case "no_child_assets":
      return "No child assets";
    case "stale_cache_exceeded_ttl":
      return "Stale cache";
    default:
      return reason ?? "Unavailable";
  }
}

export default function InvestmentBottomUpSection({
  investmentId,
  quarter,
  envId,
  auditMode,
}: Props) {
  const [data, setData] = useState<InvestmentBottomUpResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getInvestmentBottomUpCashflow(investmentId, quarter)
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e?.message ?? String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [investmentId, quarter]);

  if (loading) return <div className="text-sm text-bm-muted2">Loading bottom-up rollup…</div>;
  if (err)
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
        {err}
      </div>
    );
  if (!data) return null;

  const chartData = data.series.map((p) => ({
    quarter: p.quarter,
    cash_flow: p.amount,
  }));

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
            Bottom-up IRR
          </div>
          <div className="mt-1 text-2xl font-semibold text-bm-text">
            {pct(data.irr)}
          </div>
          {data.null_reason ? (
            <div className="mt-1 text-xs text-rose-600">
              {nullReasonBadge(data.null_reason)}
            </div>
          ) : (
            <div className="mt-1 text-xs text-bm-muted2">
              {data.asset_contributions.length} assets · derived from property CFs
            </div>
          )}
        </div>
        <div className="text-xs text-bm-muted2">
          As of <span className="font-mono text-bm-text">{data.as_of_quarter}</span>
        </div>
      </header>

      {data.series.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-bm-muted2">
            Aggregated quarterly CF (ownership-weighted)
          </div>
          <QuarterlyBarChart
            data={chartData}
            bars={[{ key: "cash_flow", label: "Cash flow", color: "#1e40af" }]}
            height={200}
            showLegend={false}
          />
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
        <div className="border-b border-slate-200 p-3 text-xs uppercase tracking-[0.14em] text-bm-muted2 dark:border-bm-border/[0.08]">
          Asset contributions
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.12em] text-bm-muted2 dark:border-bm-border/[0.08]">
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2 text-right">Ownership %</th>
              <th className="px-3 py-2 text-right">Asset IRR</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.asset_contributions.map((c) => (
              <tr
                key={c.asset_id}
                className="border-b border-slate-100 dark:border-bm-border/[0.06]"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/lab/env/${envId}/re/assets/${c.asset_id}`}
                    className="font-medium text-bm-text hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(c.ownership_pct_as_of * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pct(c.asset_irr)}
                </td>
                <td className="px-3 py-2 text-xs text-bm-muted2">
                  {c.asset_null_reason ? nullReasonBadge(c.asset_null_reason) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {auditMode ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-sm dark:border-indigo-700/40 dark:bg-indigo-950/20">
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
            Investment derivation
          </div>
          <div className="font-mono text-xs">
            xirr(Σ asset_cf × ownership_pct_at_quarter)
          </div>
          <div className="mt-2 text-xs text-bm-muted2">
            {data.asset_contributions.length} source assets ·{" "}
            {data.asset_contributions.filter((c) => c.asset_null_reason).length}{" "}
            with null IRR (contribute 0 to parent)
          </div>
        </div>
      ) : null}
    </section>
  );
}

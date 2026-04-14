"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getFundBottomUpCashflow,
  type FundBottomUpResponse,
} from "@/lib/bos-api";

interface Props {
  fundId: string;
  quarter: string;
  envId: string;
  auditMode?: boolean;
}

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function bps(n: number | null): string {
  if (n === null) return "—";
  const rounded = Math.round(n);
  return `${rounded >= 0 ? "+" : ""}${rounded} bps`;
}

function nullReasonBadge(reason: string | null): string {
  switch (reason) {
    case "no_investments": return "No investments";
    case "all_investments_null": return "All investments null";
    case "insufficient_sign_changes": return "Insufficient CFs";
    default: return reason ?? "Unavailable";
  }
}

export default function FundBottomUpSection({
  fundId,
  quarter,
  envId,
  auditMode,
}: Props) {
  const [data, setData] = useState<FundBottomUpResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"marginal" | "weighted" | "value_share">(
    "marginal"
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getFundBottomUpCashflow(fundId, quarter)
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
  }, [fundId, quarter]);

  if (loading) return <div className="text-sm text-bm-muted2">Loading fund rollup…</div>;
  if (err)
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
        {err}
      </div>
    );
  if (!data) return null;

  const nullInvCount = data.investment_contributions.filter(
    (c) => c.null_reason !== null
  ).length;

  const sortedContribs = [...data.irr_contribution].sort((a, b) => {
    const key =
      sortBy === "marginal"
        ? "irr_marginal_bps"
        : sortBy === "weighted"
        ? "irr_weighted_bps"
        : "value_share";
    const av = a[key as keyof typeof a];
    const bv = b[key as keyof typeof b];
    return (bv as number ?? 0) - (av as number ?? 0);
  });

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
            Fund gross IRR (bottom-up)
          </div>
          <div className="mt-1 text-3xl font-semibold text-bm-text">
            {pct(data.gross_irr_bottom_up)}
          </div>
          {data.null_reason ? (
            <div className="mt-1 text-xs text-rose-600">
              {nullReasonBadge(data.null_reason)}
            </div>
          ) : nullInvCount > 0 ? (
            <div className="mt-1 text-xs text-amber-700">
              {nullInvCount} investment{nullInvCount === 1 ? "" : "s"} with
              insufficient CF data — excluded from rollup
            </div>
          ) : (
            <div className="mt-1 text-xs text-bm-muted2">
              Derived from {data.investment_contributions.length} investments ·{" "}
              {data.irr_contribution.length} assets
            </div>
          )}
        </div>
        <div className="text-xs text-bm-muted2">
          As of <span className="font-mono text-bm-text">{data.as_of_quarter}</span>
        </div>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
        <div className="flex items-center justify-between border-b border-slate-200 p-3 text-xs uppercase tracking-[0.14em] text-bm-muted2 dark:border-bm-border/[0.08]">
          <span>Investment contributions</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.12em] text-bm-muted2 dark:border-bm-border/[0.08]">
              <th className="px-3 py-2">Investment</th>
              <th className="px-3 py-2 text-right">Investment IRR</th>
              <th className="px-3 py-2 text-right">Value share</th>
              <th className="px-3 py-2 text-right">Assets (null)</th>
            </tr>
          </thead>
          <tbody>
            {data.investment_contributions.map((c) => (
              <tr
                key={c.investment_id}
                className="border-b border-slate-100 dark:border-bm-border/[0.06]"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/lab/env/${envId}/re/investments/${c.investment_id}`}
                    className="font-medium text-bm-text hover:underline"
                  >
                    {c.name}
                  </Link>
                  {c.null_reason ? (
                    <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-rose-700">
                      {nullReasonBadge(c.null_reason)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pct(c.irr)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(c.value_share * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right text-xs text-bm-muted2 tabular-nums">
                  {c.asset_count} ({c.null_asset_count})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 p-3 gap-2 dark:border-bm-border/[0.08]">
          <div className="text-xs uppercase tracking-[0.14em] text-bm-muted2">
            Contribution to IRR
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-bm-muted2">sort by:</span>
            {(["marginal", "weighted", "value_share"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`rounded-full border px-2 py-0.5 ${
                  sortBy === k
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-transparent text-bm-muted2 hover:text-bm-text"
                }`}
                onClick={() => setSortBy(k)}
              >
                {k === "marginal"
                  ? "Marginal (bps)"
                  : k === "weighted"
                  ? "Weighted (bps)"
                  : "Value share"}
              </button>
            ))}
          </div>
        </div>
        <div className="px-3 py-2 text-[11px] text-amber-700 bg-amber-50/50 border-b border-amber-200/60">
          <strong>Leave-one-out</strong> — these bps values do NOT sum to fund
          IRR. Each row is the marginal impact of removing that asset. {data.non_additive_note}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.12em] text-bm-muted2 dark:border-bm-border/[0.08]">
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2 text-right">Asset IRR</th>
              <th className="px-3 py-2 text-right">Value share</th>
              <th className="px-3 py-2 text-right">Marginal</th>
              <th className="px-3 py-2 text-right">Weighted</th>
            </tr>
          </thead>
          <tbody>
            {sortedContribs.map((c) => (
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
                  {pct(c.asset_irr)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.value_share === null
                    ? "—"
                    : `${((c.value_share ?? 0) * 100).toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {bps(c.irr_marginal_bps)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-bm-muted2">
                  {bps(c.irr_weighted_bps)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {auditMode ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-sm dark:border-indigo-700/40 dark:bg-indigo-950/20">
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
            Fund derivation
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-bm-muted2">Formula</dt>
            <dd className="font-mono">xirr(Σ Σ asset_cf × ownership_pct)</dd>
            <dt className="text-bm-muted2">Investments</dt>
            <dd>{data.investment_contributions.length} ({nullInvCount} null)</dd>
            <dt className="text-bm-muted2">Assets</dt>
            <dd>{data.irr_contribution.length}</dd>
            <dt className="text-bm-muted2">Non-additive</dt>
            <dd>{String(data.non_additive)}</dd>
            <dt className="text-bm-muted2">Warnings</dt>
            <dd>{data.warnings.join(", ") || "none"}</dd>
          </dl>
        </div>
      ) : null}
    </section>
  );
}

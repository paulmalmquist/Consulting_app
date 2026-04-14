"use client";

import { useEffect, useState } from "react";
import {
  getAssetBottomUpCashflow,
  type AssetBottomUpCashflowResponse,
} from "@/lib/bos-api";
import QuarterlyBarChart from "@/components/charts/QuarterlyBarChart";

interface Props {
  assetId: string;
  quarter: string;
  auditMode?: boolean;
}

function toPctDisplay(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMoneyCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function nullReasonLabel(r: string | null): string {
  switch (r) {
    case "missing_acquisition":
      return "Missing acquisition — cost basis or acquisition date is null.";
    case "no_inflow":
      return "No positive cash flow — needs operating income, exit, or NAV.";
    case "invalid_cap_rate":
      return "Exit cap rate outside the 3%–15% guardrail. Fix the seed or exit event.";
    case "insufficient_sign_changes":
      return "Series lacks both inflow and outflow — IRR is undefined.";
    case "xirr_nonconvergence":
      return "XIRR did not converge within tolerance.";
    case "stale_cache_exceeded_ttl":
      return "Cached series is older than 24 hours — refresh the materialization job.";
    default:
      return "IRR unavailable.";
  }
}

function terminalSourceLabel(src: string): string {
  switch (src) {
    case "authoritative_nav":
      return "Authoritative NAV (released snapshot)";
    case "quarter_state_nav":
      return "Quarter state NAV";
    case "noi_cap_rate":
      return "TTM NOI ÷ exit cap rate";
    default:
      return src;
  }
}

export default function CashFlowSection({ assetId, quarter, auditMode }: Props) {
  const [data, setData] = useState<AssetBottomUpCashflowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAssetBottomUpCashflow(assetId, quarter)
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, quarter]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-bm-muted2 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
        Loading bottom-up cash flows…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
        Failed to load cash flow: {error}
      </div>
    );
  }

  if (!data) return null;

  const chartData = data.series.map((p) => ({
    quarter: p.quarter,
    cash_flow: p.amount,
  }));

  const hasDominanceWarning = data.warnings.includes("terminal_value_dominant");

  return (
    <section className="space-y-4">
      {/* ── KPI strip ── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
          <div className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
            Asset IRR (bottom-up)
          </div>
          <div className="mt-1 text-2xl font-semibold text-bm-text">
            {toPctDisplay(data.irr)}
          </div>
          {data.null_reason ? (
            <div className="mt-1 text-xs text-rose-600">
              {nullReasonLabel(data.null_reason)}
            </div>
          ) : (
            <div className="mt-1 text-xs text-bm-muted2">
              {data.has_exit
                ? "Realized exit"
                : data.has_terminal_value
                ? "Pre-exit with terminal value"
                : "Derived"}
              {" · "}
              {data.cashflow_count} CFs
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
          <div className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
            Terminal value
          </div>
          <div className="mt-1 text-2xl font-semibold text-bm-text">
            {data.terminal_value
              ? fmtMoneyCompact(data.terminal_value.amount)
              : "—"}
          </div>
          <div className="mt-1 text-xs text-bm-muted2">
            {data.terminal_value
              ? `${terminalSourceLabel(data.terminal_value.source)}${
                  data.terminal_value.cap_rate
                    ? ` @ ${(data.terminal_value.cap_rate * 100).toFixed(2)}% cap`
                    : ""
                }`
              : "No terminal value — either realized or insufficient data."}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
          <div className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
            Data freshness
          </div>
          <div className="mt-1 text-2xl font-semibold text-bm-text">
            {data.is_stale ? "Stale" : "Fresh"}
          </div>
          <div className="mt-1 text-xs text-bm-muted2">
            {data.computed_at
              ? `Computed ${Math.round(data.staleness_seconds / 60)}m ago`
              : "Never computed"}
          </div>
        </div>
      </div>

      {/* ── Warnings ── */}
      {hasDominanceWarning ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Terminal value dominant.</strong> More than 80% of positive cash
          flow comes from the unrealized mark. The IRR is heavily driven by the
          NAV / cap-rate assumption — treat with caution.
        </div>
      ) : null}
      {data.is_stale && !data.null_reason ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Stale data — recomputing.</strong> The cached series diverges
          from current sources. Refresh the materialization job to update.
        </div>
      ) : null}

      {/* ── Chart ── */}
      {data.series.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-bm-muted2">
            Quarterly net cash flow
          </div>
          <QuarterlyBarChart
            data={chartData}
            bars={[{ key: "cash_flow", label: "Cash flow", color: "#1e40af" }]}
            height={240}
            showLegend={false}
          />
        </div>
      ) : null}

      {/* ── Statement table ── */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
        <div className="border-b border-slate-200 p-3 text-xs uppercase tracking-[0.14em] text-bm-muted2 dark:border-bm-border/[0.08]">
          Cash flow series
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.12em] text-bm-muted2 dark:border-bm-border/[0.08]">
                <th className="px-3 py-2">Quarter</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.series.map((p) => {
                const kinds: string[] = [];
                if ("acquisition" in p.component_breakdown) kinds.push("acquisition");
                if (p.has_actual) kinds.push("operating");
                if (p.has_projection) kinds.push("projection");
                if (p.has_exit) kinds.push("exit");
                if (p.has_terminal_value) kinds.push("terminal");
                return (
                  <tr
                    key={p.quarter}
                    className="border-b border-slate-100 dark:border-bm-border/[0.06]"
                  >
                    <td className="px-3 py-2 font-medium">{p.quarter}</td>
                    <td className="px-3 py-2 text-bm-muted2">
                      {p.quarter_end_date}
                    </td>
                    <td
                      className={`px-3 py-2 tabular-nums ${
                        p.amount < 0 ? "text-rose-600" : "text-emerald-700"
                      }`}
                    >
                      {fmtMoneyCompact(p.amount)}
                    </td>
                    <td className="px-3 py-2 text-xs text-bm-muted2">
                      {kinds.join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-bm-muted2">
                      {p.warnings.join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Audit Drawer section (inline when ?audit_mode=1) ── */}
      {auditMode ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-sm dark:border-indigo-700/40 dark:bg-indigo-950/20">
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
            Bottom-up derivation
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-bm-muted2">Formula</dt>
            <dd className="font-mono">xirr(asset_cf_series)</dd>
            <dt className="text-bm-muted2">Source hash</dt>
            <dd className="font-mono truncate">
              {data.source_hash?.slice(0, 16) ?? "—"}
            </dd>
            <dt className="text-bm-muted2">Computed at</dt>
            <dd>{data.computed_at ?? "—"}</dd>
            <dt className="text-bm-muted2">Staleness</dt>
            <dd>{data.is_stale ? "Stale" : "Fresh"} ({data.staleness_seconds}s)</dd>
            <dt className="text-bm-muted2">Terminal value source</dt>
            <dd>
              {data.terminal_value
                ? terminalSourceLabel(data.terminal_value.source)
                : "n/a"}
            </dd>
            <dt className="text-bm-muted2">Null reason</dt>
            <dd>{data.null_reason ?? "none"}</dd>
            <dt className="text-bm-muted2">Cash flows</dt>
            <dd>{data.cashflow_count}</dd>
            <dt className="text-bm-muted2">Warnings</dt>
            <dd>{data.warnings.join(", ") || "none"}</dd>
          </dl>
        </div>
      ) : null}
    </section>
  );
}

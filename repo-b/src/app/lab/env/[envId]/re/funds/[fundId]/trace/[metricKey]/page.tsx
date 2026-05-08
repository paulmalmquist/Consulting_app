"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getIrrTrace,
  getNavTrace,
  type IrrTracePayload,
  type NavTracePayload,
} from "@/lib/bos-api";

const SUPPORTED_METRICS = new Set(["nav", "gross_irr"]);

function fmtMoney(value: string | null): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(value: string | null): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "reconciled"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
      : status === "soft_fail"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
        : status === "hard_fail"
          ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
          : "border-bm-border/60 bg-bm-surface/18 text-bm-muted2";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] tracking-[0.04em] uppercase ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function NavTraceView({ data, base }: { data: NavTracePayload; base: string }) {
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
            NAV trace · {data.quarter}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-bm-fg">{data.fund_name}</h1>
          <div className="mt-1 text-xs text-bm-muted2">
            Snapshot {data.snapshot_version} · audit_run {data.audit_run_id.slice(0, 8)}…
          </div>
        </div>
        <Link href={base} className="text-xs text-bm-muted2 underline">
          ← Back to portfolio
        </Link>
      </header>

      <section className="rounded-lg border border-bm-border/45 bg-bm-surface/12 px-5 py-4">
        <div className="flex items-baseline gap-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
            Fund NAV
          </div>
          <div className="text-2xl font-semibold text-bm-fg">{fmtMoney(data.fund_nav)}</div>
        </div>
        {data.null_reason ? (
          <div className="mt-2 text-xs text-amber-300">
            Unavailable: {data.null_reason}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-bm-fg">
          Asset NAV rows ({data.asset_rows.length})
        </h2>
        <div className="rounded-lg border border-bm-border/45 bg-bm-surface/12">
          <table
            className="w-full text-sm"
            data-testid="nav-trace-table"
          >
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.06em] text-bm-muted2">
                <th className="px-3 py-2 text-left">Asset</th>
                <th className="px-3 py-2 text-left">Investment</th>
                <th className="px-3 py-2 text-right">Ending NAV</th>
                <th className="px-3 py-2 text-right">Ownership %</th>
                <th className="px-3 py-2 text-right">Fund-attributed NAV</th>
                <th className="px-3 py-2 text-left">Trust</th>
              </tr>
            </thead>
            <tbody>
              {data.asset_rows.map((row) => (
                <tr
                  key={row.asset_id}
                  className="border-t border-bm-border/35"
                  data-testid="nav-trace-row"
                  data-asset-id={row.asset_id}
                >
                  <td className="px-3 py-2 text-bm-fg">{row.asset_name ?? row.asset_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-bm-muted2">{row.investment_name ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-bm-fg">
                    {row.ending_nav != null ? fmtMoney(row.ending_nav) : (
                      <span className="text-amber-300" title={JSON.stringify(row.null_reasons)}>
                        Unavailable
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-bm-muted2">
                    {row.ownership_pct != null ? `${(Number(row.ownership_pct) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-bm-fg">
                    {fmtMoney(row.fund_attributed_nav)}
                  </td>
                  <td className="px-3 py-2 text-bm-muted2">{row.trust_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="rounded-lg border border-bm-border/45 bg-bm-surface/12 px-5 py-4"
        data-testid="nav-reconciliation"
        data-status={data.reconciliation.status}
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-bm-muted2">Sum of asset NAV:</span>{" "}
            <span className="text-bm-fg">{fmtMoney(data.reconciliation.asset_sum)}</span>
          </div>
          <div>
            <span className="text-bm-muted2">Fund snapshot NAV:</span>{" "}
            <span className="text-bm-fg">{fmtMoney(data.reconciliation.fund_nav)}</span>
          </div>
          <div>
            <span className="text-bm-muted2">Δ:</span>{" "}
            <span className="text-bm-fg">{fmtMoney(data.reconciliation.delta)}</span>
          </div>
          <div>
            <span className="text-bm-muted2">Hard tolerance:</span>{" "}
            <span className="text-bm-fg">{fmtMoney(data.reconciliation.hard_tolerance)}</span>
          </div>
          <StatusPill status={data.reconciliation.status} />
        </div>
      </section>

      <details className="text-xs text-bm-muted2">
        <summary className="cursor-pointer">Provenance</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded border border-bm-border/30 bg-bm-surface/10 p-3">
          {JSON.stringify(data.provenance, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function IrrTraceView({ data, base }: { data: IrrTracePayload; base: string }) {
  const cumulative = useMemo(() => {
    let running = 0;
    return data.cf_rows.map((r) => {
      running += Number(r.cash_flow_base) || 0;
      return running;
    });
  }, [data.cf_rows]);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
            Gross IRR trace · {data.quarter}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-bm-fg">{data.fund_name}</h1>
          <div className="mt-1 text-xs text-bm-muted2">
            Snapshot {data.snapshot_version} · audit_run {data.audit_run_id.slice(0, 8)}…
          </div>
        </div>
        <Link href={base} className="text-xs text-bm-muted2 underline">
          ← Back to portfolio
        </Link>
      </header>

      <section className="rounded-lg border border-bm-border/45 bg-bm-surface/12 px-5 py-4">
        <div className="flex items-baseline gap-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
            Snapshot Gross IRR
          </div>
          <div className="text-2xl font-semibold text-bm-fg">
            {fmtPct(data.snapshot_gross_irr)}
          </div>
        </div>
        {data.null_reason ? (
          <div className="mt-2 text-xs text-amber-300" data-testid="irr-trace-null-reason">
            Unavailable: {data.null_reason}
          </div>
        ) : null}
      </section>

      {data.reconciliation.status === "lineage_missing" ? (
        <section
          className="rounded-lg border border-amber-400/40 bg-amber-500/8 px-5 py-4 text-amber-100"
          data-testid="irr-lineage-missing"
        >
          <div className="text-sm font-medium">Source lineage unavailable</div>
          <p className="mt-1 text-xs text-amber-200/90">
            {data.reconciliation.lineage_note ??
              "The snapshot's CF series hash could not be matched against the materialized cashflow rows. The trace cannot prove it is reading the same inputs the snapshot was built from, so it does not show recomputed values."}
          </p>
        </section>
      ) : (
        <section>
          <h2 className="mb-2 text-sm font-medium text-bm-fg">
            Investment cashflows ({data.cf_rows.length})
          </h2>
          <div className="rounded-lg border border-bm-border/45 bg-bm-surface/12">
            <table className="w-full text-sm" data-testid="irr-trace-table">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.06em] text-bm-muted2">
                  <th className="px-3 py-2 text-left">Investment</th>
                  <th className="px-3 py-2 text-left">Quarter</th>
                  <th className="px-3 py-2 text-left">Quarter end</th>
                  <th className="px-3 py-2 text-right">CF amount</th>
                  <th className="px-3 py-2 text-right">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {data.cf_rows.map((row, i) => (
                  <tr
                    key={`${row.investment_id}-${row.quarter}`}
                    className="border-t border-bm-border/35"
                    data-testid="irr-trace-row"
                  >
                    <td className="px-3 py-2 text-bm-fg">{row.investment_name ?? row.investment_id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-bm-muted2">{row.quarter}</td>
                    <td className="px-3 py-2 text-bm-muted2">{row.quarter_end_date}</td>
                    <td className="px-3 py-2 text-right text-bm-fg">{fmtMoney(row.cash_flow_base)}</td>
                    <td className="px-3 py-2 text-right text-bm-fg">{fmtMoney(String(cumulative[i] ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section
        className="rounded-lg border border-bm-border/45 bg-bm-surface/12 px-5 py-4"
        data-testid="irr-reconciliation"
        data-status={data.reconciliation.status}
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-bm-muted2">Snapshot IRR:</span>{" "}
            <span className="text-bm-fg">{fmtPct(data.reconciliation.snapshot_gross_irr)}</span>
          </div>
          <div>
            <span className="text-bm-muted2">Recomputed XIRR:</span>{" "}
            <span className="text-bm-fg">{fmtPct(data.reconciliation.recomputed_irr)}</span>
          </div>
          <div>
            <span className="text-bm-muted2">Δ:</span>{" "}
            <span className="text-bm-fg">
              {data.reconciliation.delta_bps != null ? `${Number(data.reconciliation.delta_bps).toFixed(2)} bps` : "—"}
            </span>
          </div>
          <StatusPill status={data.reconciliation.status} />
        </div>
        {(data.provenance as { cf_series_hash?: string })?.cf_series_hash ? (
          <div className="mt-2 text-[11px] text-bm-muted2">
            Source hash: {String((data.provenance as { cf_series_hash?: string }).cf_series_hash).slice(0, 12)}…
          </div>
        ) : null}
      </section>

      <details className="text-xs text-bm-muted2">
        <summary className="cursor-pointer">Provenance</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded border border-bm-border/30 bg-bm-surface/10 p-3">
          {JSON.stringify(data.provenance, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default function FundMetricTracePage() {
  const params = useParams<{ envId: string; fundId: string; metricKey: string }>();
  const search = useSearchParams();
  const envId = params?.envId ?? "";
  const fundId = params?.fundId ?? "";
  const metric = (params?.metricKey ?? "").toLowerCase();
  const quarter = search?.get("quarter") ?? "2026Q2";
  const base = `/lab/env/${envId}/re`;

  const [navData, setNavData] = useState<NavTracePayload | null>(null);
  const [irrData, setIrrData] = useState<IrrTracePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!envId || !fundId || !SUPPORTED_METRICS.has(metric)) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    const fetcher =
      metric === "nav"
        ? getNavTrace(envId, fundId, quarter).then((data) => {
            setNavData(data);
            setIrrData(null);
          })
        : getIrrTrace(envId, fundId, quarter).then((data) => {
            setIrrData(data);
            setNavData(null);
          });
    fetcher
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Trace request failed";
        if (msg.includes("404") || msg.toLowerCase().includes("not_traceable")) {
          setNotFound(true);
        } else {
          setError(msg);
        }
      })
      .finally(() => setLoading(false));
  }, [envId, fundId, metric, quarter]);

  if (!SUPPORTED_METRICS.has(metric)) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10" data-testid="trace-metric-unsupported">
        <h1 className="text-xl font-semibold text-bm-fg">Metric not traceable</h1>
        <p className="mt-2 text-sm text-bm-muted2">
          The metric <code className="rounded bg-bm-surface/20 px-1 py-0.5">{metric}</code> does
          not have a trace surface in this milestone. Supported metrics: <code>nav</code>,{" "}
          <code>gross_irr</code>.
        </p>
        <Link href={base} className="mt-4 inline-block text-xs text-bm-muted2 underline">
          ← Back to portfolio
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10" data-testid="trace-not-found">
        <h1 className="text-xl font-semibold text-bm-fg">Fund not in portfolio</h1>
        <p className="mt-2 text-sm text-bm-muted2">
          This fund is not part of the canonical fund-portfolio inclusion view for{" "}
          {quarter}, or has no released snapshot for the period. There is nothing
          authoritative to trace from.
        </p>
        <Link href={base} className="mt-4 inline-block text-xs text-bm-muted2 underline">
          ← Back to portfolio
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-bm-muted2" data-testid="trace-loading">
        Loading trace…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10" data-testid="trace-error">
        <h1 className="text-xl font-semibold text-bm-fg">Trace unavailable</h1>
        <p className="mt-2 text-sm text-bm-muted2">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {metric === "nav" && navData ? <NavTraceView data={navData} base={base} /> : null}
      {metric === "gross_irr" && irrData ? <IrrTraceView data={irrData} base={base} /> : null}
    </div>
  );
}

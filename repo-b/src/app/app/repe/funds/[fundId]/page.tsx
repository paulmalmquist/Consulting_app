"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getRepeFund,
  listRepeDeals,
  RepeFundDetail,
  RepeDeal,
  getReFundSummary,
  ReFundSummary,
} from "@/lib/bos-api";
import { useRepeBasePath } from "@/lib/repe-context";

function pickCurrentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}Q${q}`;
}

function fmt(value: string | number | null | undefined, prefix = ""): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (prefix === "$") {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }
  if (prefix === "%") return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(2)}x`;
}

const STAGE_LABELS: Record<RepeDeal["stage"], string> = {
  sourcing: "Sourcing",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closing",
  operating: "Asset Mgmt",
  exited: "Exited",
};

export default function RepeFundDetailPage({ params }: { params: { fundId: string } }) {
  const basePath = useRepeBasePath();
  const [detail, setDetail] = useState<RepeFundDetail | null>(null);
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [summary, setSummary] = useState<ReFundSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const quarter = pickCurrentQuarter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getRepeFund(params.fundId),
      listRepeDeals(params.fundId),
      getReFundSummary(params.fundId, quarter).catch(() => null),
    ])
      .then(([d, dls, s]) => {
        if (cancelled) return;
        setDetail(d);
        setDeals(dls);
        setSummary(s);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load fund");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.fundId, quarter]);

  if (loading) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">
        Loading fund…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-red-400">
        {error}
      </div>
    );
  }

  const fund = detail?.fund;
  const terms = detail?.terms ?? [];
  const latestTerms = terms[0];

  return (
    <section className="space-y-5" data-testid="repe-fund-detail">
      {/* ── Fund Header ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Fund</p>
            <h1 className="mt-1 text-2xl font-semibold">{fund?.name || "—"}</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              {fund?.strategy?.toUpperCase() || "—"}
              {fund?.sub_strategy ? ` · ${fund.sub_strategy.replace(/_/g, " ")}` : ""}
              {fund?.vintage_year ? ` · Vintage ${fund.vintage_year}` : ""}
              {fund?.status ? ` · ${fund.status.charAt(0).toUpperCase() + fund.status.slice(1)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${basePath}/deals?fund=${params.fundId}`}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              New Deal
            </Link>
            <Link
              href={`${basePath}/waterfalls`}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Run Waterfall
            </Link>
            <Link
              href={`${basePath}/capital`}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Capital Accounts
            </Link>
          </div>
        </div>

        {/* Fund terms summary */}
        {latestTerms ? (
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-bm-muted2">Pref Return</dt>
              <dd className="font-medium">{fmt(latestTerms.preferred_return_rate, "%")}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">Carry</dt>
              <dd className="font-medium">{fmt(latestTerms.carry_rate, "%")}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">Waterfall</dt>
              <dd className="font-medium capitalize">{latestTerms.waterfall_style || "—"}</dd>
            </div>
            {fund?.target_size ? (
              <div>
                <dt className="text-xs text-bm-muted2">Target Size</dt>
                <dd className="font-medium">{fmt(fund.target_size, "$")}</dd>
              </div>
            ) : null}
            {fund?.term_years ? (
              <div>
                <dt className="text-xs text-bm-muted2">Term</dt>
                <dd className="font-medium">{fund.term_years}yr</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>

      {/* ── Rollup Metrics ──────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-xs uppercase tracking-[0.12em] text-bm-muted2">
          Metrics · {quarter}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Portfolio NAV", value: fmt(summary?.portfolio_nav, "$") },
            { label: "TVPI", value: fmt(summary?.tvpi) },
            { label: "DPI", value: fmt(summary?.dpi) },
            { label: "Weighted LTV", value: fmt(summary?.weighted_ltv, "%") },
            { label: "Weighted DSCR", value: summary?.weighted_dscr != null ? fmt(summary.weighted_dscr) : "—" },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"
            >
              <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">{kpi.label}</p>
              <p className="mt-2 text-xl font-semibold">{kpi.value}</p>
            </div>
          ))}
        </div>
        {!summary ? (
          <p className="mt-2 text-xs text-bm-muted2">
            No summary computed for {quarter} yet.{" "}
            <Link href={`${basePath}/waterfalls`} className="underline underline-offset-2">
              Run waterfall
            </Link>{" "}
            to generate metrics.
          </p>
        ) : null}
      </div>

      {/* ── Deals Table ─────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Investments</h2>
          <Link
            href={`${basePath}/deals?fund=${params.fundId}`}
            className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
          >
            + New Deal
          </Link>
        </div>

        {deals.length === 0 ? (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-center">
            <p className="text-sm text-bm-muted2">No deals yet.</p>
            <Link
              href={`${basePath}/deals?fund=${params.fundId}`}
              className="mt-3 inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Add First Deal
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/70 bg-bm-surface/20">
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Type</th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Stage</th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Sponsor</th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Target Close</th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {deals.map((deal) => (
                  <tr key={deal.deal_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium">{deal.name}</td>
                    <td className="px-4 py-3 text-bm-muted2 capitalize">{deal.deal_type}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-bm-border/70 px-2 py-0.5 text-xs">
                        {STAGE_LABELS[deal.stage] || deal.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-bm-muted2">{deal.sponsor || "—"}</td>
                    <td className="px-4 py-3 text-bm-muted2">
                      {deal.target_close_date ? deal.target_close_date.slice(0, 10) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`${basePath}/deals/${deal.deal_id}`}
                        className="text-xs text-bm-accent hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick Navigate ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Assets", href: `${basePath}/assets` },
          { label: "Capital", href: `${basePath}/capital` },
          { label: "Waterfalls", href: `${basePath}/waterfalls` },
          { label: "Documents", href: `${basePath}/documents` },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-xl border border-bm-border/70 p-4 text-sm font-medium hover:bg-bm-surface/30 transition-colors"
          >
            {item.label} →
          </Link>
        ))}
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getRepeFund,
  listRepeAssets,
  listRepeDeals,
  RepeFundDetail,
  RepeDeal,
  getReFundSummary,
  ReFundSummary,
} from "@/lib/bos-api";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";

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
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closed",
  operating: "Asset Mgmt",
  exited: "Exited",
};

const MODULES = [
  "Overview",
  "Structure",
  "Capital & Waterfall",
  "Scenarios",
  "Reports",
  "Audit",
  "Attachments",
] as const;

type ModuleKey = (typeof MODULES)[number];

export default function RepeFundDetailPage({ params }: { params: { fundId: string } }) {
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const [moduleTab, setModuleTab] = useState<ModuleKey>("Overview");
  const [detail, setDetail] = useState<RepeFundDetail | null>(null);
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [summary, setSummary] = useState<ReFundSummary | null>(null);
  const [assetCounts, setAssetCounts] = useState<Record<string, number>>({});
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
      .then(async ([d, dls, s]) => {
        if (cancelled) return;
        setDetail(d);
        setDeals(dls);
        setSummary(s);
        const counts = await Promise.all(
          dls.map(async (deal) => {
            const rows = await listRepeAssets(deal.deal_id).catch(() => []);
            return [deal.deal_id, rows.length] as const;
          })
        );
        if (!cancelled) {
          setAssetCounts(Object.fromEntries(counts));
        }
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
        Loading fund...
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
    <section className="space-y-5" data-testid="re-fund-homepage">
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
              New Investment
            </Link>
            <Link
              href={`${basePath}/assets?fund=${params.fundId}`}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Add Asset
            </Link>
          </div>
        </div>

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

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2">
        <div className="flex flex-wrap gap-2">
          {MODULES.map((label) => {
            const active = moduleTab === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setModuleTab(label)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  active
                    ? "border-bm-accent/60 bg-bm-accent/10"
                    : "border-bm-border/70 hover:bg-bm-surface/40"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {moduleTab === "Overview" ? (
        <>
          <div>
            <h2 className="mb-3 text-xs uppercase tracking-[0.12em] text-bm-muted2">
              Metrics · {quarter}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: "Portfolio NAV", value: summary ? fmt(summary.portfolio_nav, "$") : "$0" },
                { label: "TVPI", value: summary ? fmt(summary.tvpi) : "0.00x" },
                { label: "DPI", value: summary ? fmt(summary.dpi) : "0.00x" },
                { label: "Weighted LTV", value: summary ? fmt(summary.weighted_ltv, "%") : "0.0%" },
                { label: "Weighted DSCR", value: summary?.weighted_dscr != null ? fmt(summary.weighted_dscr) : "0.00x" },
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
                No summary computed for {quarter} yet.
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Investments</h2>
              <Link
                href={`${basePath}/deals?fund=${params.fundId}`}
                className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
              >
                + New Investment
              </Link>
            </div>

            {deals.length === 0 ? (
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-center">
                <p className="text-sm text-bm-muted2">No investments yet for this fund.</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <Link
                    href={`${basePath}/deals?fund=${params.fundId}`}
                    className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
                  >
                    Add Deal
                  </Link>
                  <Link
                    href={`${basePath}/assets?fund=${params.fundId}`}
                    className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
                  >
                    Add Asset
                  </Link>
                  <Link
                    href={`${basePath}/funds/${params.fundId}`}
                    className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
                  >
                    Upload Package
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-bm-border/70 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bm-border/70 bg-bm-surface/20">
                      <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Name</th>
                      <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Stage</th>
                      <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Assets</th>
                      <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Sponsor</th>
                      <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Target Close</th>
                      <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bm-border/40">
                    {deals.map((deal) => (
                      <tr key={deal.deal_id} className="hover:bg-bm-surface/20">
                        <td className="px-4 py-3 font-medium">{deal.name}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-bm-border/70 px-2 py-0.5 text-xs">
                            {STAGE_LABELS[deal.stage] || deal.stage}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-bm-muted2">{assetCounts[deal.deal_id] ?? 0}</td>
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
        </>
      ) : null}

      {moduleTab === "Structure" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Entities & Ownership</h2>
          <p className="text-sm text-bm-muted2">
            Fund ownership links are seeded at creation. Configure GP/LP entities and ownership edges as needed.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Fund Type</p>
              <p className="mt-1 font-medium">{fund?.fund_type || "—"}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Currency</p>
              <p className="mt-1 font-medium">{fund?.base_currency || "USD"}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Cadence</p>
              <p className="mt-1 font-medium">{fund?.quarter_cadence || "quarterly"}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Status</p>
              <p className="mt-1 font-medium">{fund?.status || "—"}</p>
            </div>
          </div>
        </div>
      ) : null}

      {moduleTab === "Capital & Waterfall" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Capital & Waterfall</h2>
          <p className="text-sm text-bm-muted2">
            Capital account snapshots and waterfall runs are scoped to this fund and quarter.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Quarter</p>
              <p className="mt-1 font-medium">{quarter}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Portfolio NAV</p>
              <p className="mt-1 font-medium">{summary ? fmt(summary.portfolio_nav, "$") : "$0"}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">DPI</p>
              <p className="mt-1 font-medium">{summary ? fmt(summary.dpi) : "0.00x"}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">TVPI</p>
              <p className="mt-1 font-medium">{summary ? fmt(summary.tvpi) : "0.00x"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${basePath}/waterfalls?fund=${params.fundId}`}
              className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Run Waterfall
            </Link>
            <Link
              href={`${basePath}/capital?fund=${params.fundId}`}
              className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Open Capital
            </Link>
          </div>
        </div>
      ) : null}

      {moduleTab === "Scenarios" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
          Scenario manager is fund-scoped. Base scenario is seeded at fund creation and additional scenarios can be layered on top.
        </div>
      ) : null}

      {moduleTab === "Reports" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
          LP report drafting and exports are generated from this fund context.
        </div>
      ) : null}

      {moduleTab === "Audit" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Audit</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="rounded-lg border border-bm-border/60 px-3 py-2">
              <p className="font-medium">fund.created</p>
              <p className="text-xs text-bm-muted2">{fund?.created_at?.slice(0, 19).replace("T", " ") || "—"}</p>
            </li>
            {deals.map((deal) => (
              <li key={deal.deal_id} className="rounded-lg border border-bm-border/60 px-3 py-2">
                <p className="font-medium">investment.linked · {deal.name}</p>
                <p className="text-xs text-bm-muted2">{deal.created_at?.slice(0, 19).replace("T", " ") || "—"}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {moduleTab === "Attachments" ? (
        businessId && environmentId ? (
          <RepeEntityDocuments
            businessId={businessId}
            envId={environmentId}
            entityType="fund"
            entityId={params.fundId}
          />
        ) : (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
            Environment context is required to load attachments.
          </div>
        )
      ) : null}

      {moduleTab === "Overview" ? null : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Active Investments", value: deals.length.toString() },
            { label: "Assets", value: Object.values(assetCounts).reduce((sum, n) => sum + n, 0).toString() },
            { label: "Portfolio NAV", value: summary ? fmt(summary.portfolio_nav, "$") : "$0" },
            { label: "TVPI", value: summary ? fmt(summary.tvpi) : "0.00x" },
            { label: "DPI", value: summary ? fmt(summary.dpi) : "0.00x" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">{kpi.label}</p>
              <p className="mt-2 text-xl font-semibold">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

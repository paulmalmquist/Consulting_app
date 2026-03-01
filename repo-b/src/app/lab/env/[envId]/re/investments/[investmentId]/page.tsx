"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getReV2Investment,
  listReV2Jvs,
  getReV2InvestmentQuarterState,
  getReV2InvestmentAssets,
  getReV2InvestmentLineage,
  getRepeFund,
  ReV2Investment,
  ReV2Jv,
  ReV2InvestmentQuarterState,
  ReV2InvestmentAsset,
  ReV2EntityLineageResponse,
  RepeFundDetail,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";

const TABS = ["Overview", "Assets", "Performance", "Cash Flows", "Sustainability", "Documents"] as const;
type TabKey = (typeof TABS)[number];

function pickQ(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "$0";
  const n = Number(v);
  if (!n) return "$0";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtX(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function fmtPct(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDate(v: string | undefined): string {
  return v ? v.slice(0, 10) : "—";
}

const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closing",
  operating: "Operating",
  exited: "Exited",
};

function holdPeriodLabel(acquisitionDate?: string): string {
  if (!acquisitionDate) return "—";
  const acquired = new Date(acquisitionDate);
  if (Number.isNaN(acquired.getTime())) return "—";
  const now = new Date();
  const months =
    (now.getUTCFullYear() - acquired.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - acquired.getUTCMonth());
  if (months <= 0) return "0 mo";
  if (months < 12) return `${months} mo`;
  return `${(months / 12).toFixed(1)} yrs`;
}

export default function InvestmentHomePage({
  params,
}: {
  params: { envId: string; investmentId: string };
}) {
  const { businessId } = useReEnv();
  const [tab, setTab] = useState<TabKey>("Overview");
  const [inv, setInv] = useState<ReV2Investment | null>(null);
  const [jvs, setJvs] = useState<ReV2Jv[]>([]);
  const [state, setState] = useState<ReV2InvestmentQuarterState | null>(null);
  const [fundDetail, setFundDetail] = useState<RepeFundDetail | null>(null);
  const [assets, setAssets] = useState<ReV2InvestmentAsset[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const quarter = pickQ();
  const base = `/lab/env/${params.envId}/re`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const investment = await getReV2Investment(params.investmentId);
        if (cancelled) return;
        setInv(investment);

        const results = await Promise.allSettled([
          listReV2Jvs(params.investmentId),
          getReV2InvestmentQuarterState(params.investmentId, quarter),
          getReV2InvestmentAssets(params.investmentId, quarter),
          getReV2InvestmentLineage(params.investmentId, quarter),
          getRepeFund(investment.fund_id),
        ]);
        if (cancelled) return;

        setJvs(results[0].status === "fulfilled" ? results[0].value : []);
        setState(results[1].status === "fulfilled" ? results[1].value : null);
        setAssets(results[2].status === "fulfilled" ? results[2].value : []);
        setLineage(results[3].status === "fulfilled" ? results[3].value : null);
        setFundDetail(results[4].status === "fulfilled" ? results[4].value : null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load investment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.investmentId, quarter]);

  const directAssets = useMemo(() => assets.filter((asset) => !asset.jv_id), [assets]);
  const jvBackedAssets = useMemo(() => assets.filter((asset) => asset.jv_id), [assets]);
  const impliedGainLoss = useMemo(() => {
    const grossValue = Number(state?.gross_asset_value ?? 0);
    const invested = Number(inv?.invested_capital ?? 0);
    if (!grossValue && !invested) return null;
    return grossValue - invested;
  }, [state?.gross_asset_value, inv?.invested_capital]);
  const rvpi = useMemo(() => {
    const nav = Number(state?.nav ?? 0);
    const invested = Number(inv?.invested_capital ?? 0);
    if (!nav || !invested) return null;
    return nav / invested;
  }, [state?.nav, inv?.invested_capital]);
  const propertyAssets = useMemo(
    () => assets.filter((asset) => String(asset.asset_type || "").toLowerCase() === "property"),
    [assets]
  );
  const sustainabilityAsset = propertyAssets[0] || null;
  const sustainabilityHref =
    inv == null
      ? `${base}/sustainability`
      : `${base}/sustainability?section=${sustainabilityAsset ? "asset-sustainability" : "portfolio-footprint"}&fundId=${inv.fund_id}&investmentId=${inv.investment_id}${sustainabilityAsset ? `&assetId=${sustainabilityAsset.asset_id}` : ""}`;

  if (loading) return <div className="p-6 text-sm text-bm-muted2">Loading investment...</div>;
  if (error || !inv) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
        {error || "Investment not available"}
      </div>
    );
  }

  return (
    <section className="space-y-5" data-testid="re-investment-homepage">
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Investment</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{inv.name}</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              {inv.investment_type?.toUpperCase()} · {STAGE_LABELS[inv.stage] || inv.stage}
              {fundDetail?.fund?.name ? ` · ${fundDetail.fund.name}` : ""}
            </p>
            <p className="mt-1 text-xs text-bm-muted2">
              Acquisition Date: {fmtDate(inv.target_close_date)} · Hold Period: {holdPeriodLabel(inv.target_close_date)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={sustainabilityHref}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Sustainability
            </Link>
            <button
              type="button"
              onClick={() => setLineageOpen(true)}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Lineage
            </button>
            <Link
              href={`${base}/funds/${inv.fund_id}`}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Back to Fund
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Committed Capital", value: fmtMoney(inv.committed_capital) },
          { label: "Current NAV", value: fmtMoney(state?.nav) },
          { label: "Gross Value", value: fmtMoney(state?.gross_asset_value) },
          { label: "IRR", value: fmtPct(state?.net_irr ?? state?.gross_irr) },
          { label: "MOIC", value: fmtX(state?.equity_multiple) },
          { label: "Assets", value: String(assets.length) },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{item.label}</p>
            <p className="mt-1 text-lg font-bold">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2">
        <div className="flex flex-wrap gap-2">
          {TABS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setTab(label)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                tab === label
                  ? "border-bm-accent/60 bg-bm-accent/10"
                  : "border-bm-border/70 hover:bg-bm-surface/40"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "Overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Overview</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-bm-muted2">Status</dt>
                <dd className="font-medium">{STAGE_LABELS[inv.stage] || inv.stage}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Fund</dt>
                <dd className="font-medium">{fundDetail?.fund?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Acquisition Date</dt>
                <dd className="font-medium">{fmtDate(inv.target_close_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Invested Capital</dt>
                <dd className="font-medium">{fmtMoney(inv.invested_capital)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Current Valuation</dt>
                <dd className="font-medium">{fmtMoney(state?.gross_asset_value)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Gain / Loss</dt>
                <dd className={`font-medium ${impliedGainLoss && impliedGainLoss < 0 ? "text-red-300" : "text-bm-text"}`}>
                  {impliedGainLoss == null ? "—" : fmtMoney(impliedGainLoss)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Structure</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">JV Entities</p>
                <p className="mt-1 font-medium">{jvs.length}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Direct Assets</p>
                <p className="mt-1 font-medium">{directAssets.length}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">JV-Backed Assets</p>
                <p className="mt-1 font-medium">{jvBackedAssets.length}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Fund NAV Contribution</p>
                <p className="mt-1 font-medium">{fmtMoney(state?.fund_nav_contribution ?? state?.nav)}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "Assets" ? (
        <div className="space-y-4">
          {assets.length === 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
              No assets are linked to this investment. This violates the REPE invariant.
              Use <span className="font-medium">`/api/re/v2/health/integrity?repair=true`</span> to backfill missing placeholder assets.
            </div>
          ) : (
            <div className="rounded-xl border border-bm-border/70 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-4 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Linkage</th>
                    <th className="px-4 py-3 font-medium text-right">NOI</th>
                    <th className="px-4 py-3 font-medium text-right">Value</th>
                    <th className="px-4 py-3 font-medium text-right">NAV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {assets.map((asset) => (
                    <tr key={asset.asset_id} data-testid={`investment-asset-row-${asset.asset_id}`} className="hover:bg-bm-surface/20">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`${base}/assets/${asset.asset_id}`} className="text-bm-accent hover:underline">
                          {asset.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-bm-muted2">{asset.property_type || asset.asset_type}</td>
                      <td className="px-4 py-3 text-bm-muted2">{asset.jv_id ? "JV-backed" : "Direct"}</td>
                      <td className="px-4 py-3 text-right">{fmtMoney(asset.noi)}</td>
                      <td className="px-4 py-3 text-right">{fmtMoney(asset.asset_value)}</td>
                      <td className="px-4 py-3 text-right">{fmtMoney(asset.nav)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {jvs.length > 0 ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">JV Entities</h3>
              <div className="mt-3 space-y-2">
                {jvs.map((jv) => (
                  <div key={jv.jv_id} className="flex items-center justify-between rounded-lg border border-bm-border/60 px-3 py-2 text-sm">
                    <Link href={`${base}/jv/${jv.jv_id}`} className="font-medium text-bm-accent hover:underline">
                      {jv.legal_name}
                    </Link>
                    <span className="text-bm-muted2">{fmtPct(jv.ownership_percent)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "Performance" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Quarterly Performance</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Quarterly NOI</p>
                <p className="mt-1 font-medium">{fmtMoney(assets.reduce((sum, asset) => sum + Number(asset.noi || 0), 0))}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Cap Rate Proxy</p>
                <p className="mt-1 font-medium">
                  {state?.gross_asset_value && assets.length
                    ? fmtPct((assets.reduce((sum, asset) => sum + Number(asset.noi || 0), 0) * 4) / Number(state.gross_asset_value))
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Gross Value</p>
                <p className="mt-1 font-medium">{fmtMoney(state?.gross_asset_value)}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Net Debt</p>
                <p className="mt-1 font-medium">{fmtMoney(state?.debt_balance)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Return Metrics</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-bm-muted2">Net IRR</dt>
                <dd className="font-medium">{fmtPct(state?.net_irr)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Gross IRR</dt>
                <dd className="font-medium">{fmtPct(state?.gross_irr)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">MOIC</dt>
                <dd className="font-medium">{fmtX(state?.equity_multiple)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">RVPI</dt>
                <dd className="font-medium">{fmtX(rvpi)}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {tab === "Cash Flows" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Capital Flows</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-bm-muted2">Committed</dt>
                <dd className="font-medium">{fmtMoney(inv.committed_capital)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Invested</dt>
                <dd className="font-medium">{fmtMoney(inv.invested_capital)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Realized Distributions</dt>
                <dd className="font-medium">{fmtMoney(inv.realized_distributions)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Fund NAV Contribution</dt>
                <dd className="font-medium">{fmtMoney(state?.fund_nav_contribution ?? state?.nav)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Exit Assumptions</h2>
            <p className="mt-2 text-sm text-bm-muted2">
              Exit scenarios are derived from asset-level assumptions and surface through the quarter-state lineage.
              Use the Lineage panel to trace current NAV back to asset cash flow and valuation inputs.
            </p>
          </div>
        </div>
      ) : null}

      {tab === "Sustainability" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Sustainability Module</h2>
            {propertyAssets.length > 0 ? (
              <>
                <p className="mt-2 text-sm text-bm-muted2">
                  This investment has {propertyAssets.length} property asset{propertyAssets.length === 1 ? "" : "s"} eligible for footprint, utility, and decarbonization analysis.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={sustainabilityHref}
                    className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90"
                  >
                    Open Sustainability Workspace
                  </Link>
                  <Link
                    href={`${base}/sustainability?section=portfolio-footprint&fundId=${inv.fund_id}&investmentId=${inv.investment_id}`}
                    className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
                  >
                    View Investment Footprint
                  </Link>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-bm-muted2">
                Not applicable. This investment currently has no physical property assets, so sustainability analytics are excluded from portfolio footprint denominators.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Eligible Assets</h2>
            <div className="mt-3 space-y-2">
              {propertyAssets.length === 0 ? (
                <p className="text-sm text-bm-muted2">No physical property assets are linked to this investment.</p>
              ) : (
                propertyAssets.map((asset) => (
                  <div key={asset.asset_id} className="flex items-center justify-between rounded-lg border border-bm-border/60 px-3 py-2 text-sm">
                    <span className="font-medium">{asset.name}</span>
                    <Link
                      href={`${base}/sustainability?section=asset-sustainability&fundId=${inv.fund_id}&investmentId=${inv.investment_id}&assetId=${asset.asset_id}`}
                      className="text-bm-accent hover:underline"
                    >
                      Open
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "Documents" ? (
        businessId ? (
          <RepeEntityDocuments
            businessId={businessId}
            envId={params.envId}
            entityType="investment"
            entityId={inv.investment_id}
            title="Investment Documents"
          />
        ) : (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
            Environment context is required to load documents.
          </div>
        )
      ) : null}

      <EntityLineagePanel
        open={lineageOpen}
        onOpenChange={setLineageOpen}
        title={`Investment Lineage · ${quarter}`}
        lineage={lineage}
      />
    </section>
  );
}

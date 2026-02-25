"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getRepeFund,
  listRepeDeals,
  listRepeAssets,
  RepeFundDetail,
  RepeDeal,
  getReV2FundQuarterState,
  getReV2FundMetrics,
  runReV2QuarterClose,
  listReV2Scenarios,
  ReV2FundQuarterState,
  ReV2FundMetrics,
  ReV2Scenario,
  ReV2QuarterCloseResult,
} from "@/lib/bos-api";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";

function pickCurrentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}Q${q}`;
}

function fmtMoney(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "$0";
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtMultiple(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toFixed(2)}x`;
}

function fmtPercent(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closed",
  operating: "Asset Mgmt",
  exited: "Exited",
};

const MODULES = [
  "Dashboard",
  "Investments",
  "Capital",
  "Scenarios",
  "Audit",
  "Attachments",
] as const;

type ModuleKey = (typeof MODULES)[number];

export default function RepeFundDetailPage({ params }: { params: { fundId: string } }) {
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const [moduleTab, setModuleTab] = useState<ModuleKey>("Dashboard");
  const [detail, setDetail] = useState<RepeFundDetail | null>(null);
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [fundState, setFundState] = useState<ReV2FundQuarterState | null>(null);
  const [fundMetrics, setFundMetrics] = useState<ReV2FundMetrics | null>(null);
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [assetCounts, setAssetCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<ReV2QuarterCloseResult | null>(null);
  const quarter = pickCurrentQuarter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getRepeFund(params.fundId),
      listRepeDeals(params.fundId),
      getReV2FundQuarterState(params.fundId, quarter).catch(() => null),
      getReV2FundMetrics(params.fundId, quarter).catch(() => null),
      listReV2Scenarios(params.fundId).catch(() => []),
    ])
      .then(async ([d, dls, fs, fm, sc]) => {
        if (cancelled) return;
        setDetail(d);
        setDeals(dls);
        setFundState(fs);
        setFundMetrics(fm);
        setScenarios(sc);
        const counts = await Promise.all(
          dls.map(async (deal) => {
            const rows = await listRepeAssets(deal.deal_id).catch(() => []);
            return [deal.deal_id, rows.length] as const;
          })
        );
        if (!cancelled) setAssetCounts(Object.fromEntries(counts));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load fund");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [params.fundId, quarter]);

  const handleQuarterClose = async () => {
    setClosing(true);
    setCloseResult(null);
    try {
      const result = await runReV2QuarterClose(params.fundId, {
        quarter,
        run_waterfall: true,
      });
      setCloseResult(result);
      if (result.fund_state) setFundState(result.fund_state);
      if (result.fund_metrics) setFundMetrics(result.fund_metrics);
    } catch (err) {
      setCloseResult({ status: "failed", run_id: "", fund_id: params.fundId, quarter, assets_processed: 0, jvs_processed: 0, investments_processed: 0 });
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-bm-muted2">Loading fund...</div>;
  if (error) return <div className="p-6 text-sm text-red-400">{error}</div>;

  const fund = detail?.fund;
  const terms = detail?.terms ?? [];
  const latestTerms = terms[0];
  const totalAssets = Object.values(assetCounts).reduce((s, n) => s + n, 0);

  return (
    <section className="space-y-5" data-testid="re-fund-homepage">
      {/* Fund Header */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Fund</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{fund?.name || "—"}</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              {fund?.strategy?.toUpperCase()}{fund?.sub_strategy ? ` · ${fund.sub_strategy}` : ""}
              {fund?.vintage_year ? ` · Vintage ${fund.vintage_year}` : ""}
              {fund?.status ? ` · ${fund.status.charAt(0).toUpperCase() + fund.status.slice(1)}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleQuarterClose}
              disabled={closing}
              className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-50"
            >
              {closing ? "Closing..." : `Close ${quarter}`}
            </button>
            <Link href={`${basePath}/deals?fund=${params.fundId}`} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              + Investment
            </Link>
          </div>
        </div>

        {latestTerms && (
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div><dt className="text-xs text-bm-muted2">Pref Return</dt><dd className="font-medium">{fmtPercent(latestTerms.preferred_return_rate)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">Carry</dt><dd className="font-medium">{fmtPercent(latestTerms.carry_rate)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">Waterfall</dt><dd className="font-medium capitalize">{latestTerms.waterfall_style || "—"}</dd></div>
            {fund?.target_size ? <div><dt className="text-xs text-bm-muted2">Target Size</dt><dd className="font-medium">{fmtMoney(fund.target_size)}</dd></div> : null}
          </dl>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "NAV", value: fmtMoney(fundState?.portfolio_nav) },
          { label: "Committed", value: fmtMoney(fundState?.total_committed) },
          { label: "Called", value: fmtMoney(fundState?.total_called) },
          { label: "Distributed", value: fmtMoney(fundState?.total_distributed) },
          { label: "DPI", value: fmtMultiple(fundState?.dpi) },
          { label: "TVPI", value: fmtMultiple(fundState?.tvpi) },
          { label: "IRR", value: fmtPercent(fundMetrics?.irr) },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{kpi.label}</p>
            <p className="mt-1 text-lg font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Quarter Close Result */}
      {closeResult && (
        <div className={`rounded-xl border p-4 text-sm ${closeResult.status === "success" ? "border-green-500/50 bg-green-500/10" : "border-red-500/50 bg-red-500/10"}`}>
          <p className="font-medium">Quarter Close: {closeResult.status}</p>
          {closeResult.status === "success" && (
            <p className="mt-1 text-bm-muted2">
              Processed {closeResult.assets_processed} assets, {closeResult.jvs_processed} JVs, {closeResult.investments_processed} investments
            </p>
          )}
        </div>
      )}

      {/* Module Tabs */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2 flex flex-wrap gap-2">
        {MODULES.map((label) => (
          <button key={label} type="button" onClick={() => setModuleTab(label)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${moduleTab === label ? "border-bm-accent/60 bg-bm-accent/10" : "border-bm-border/70 hover:bg-bm-surface/40"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {moduleTab === "Dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Investments</p>
              <p className="mt-1 text-2xl font-bold">{deals.length}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Assets</p>
              <p className="mt-1 text-2xl font-bold">{totalAssets}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Scenarios</p>
              <p className="mt-1 text-2xl font-bold">{scenarios.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Investments Table */}
      {moduleTab === "Investments" && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Investments</h2>
            <Link href={`${basePath}/deals?fund=${params.fundId}`} className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40">+ New</Link>
          </div>
          {deals.length === 0 ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-center text-sm text-bm-muted2">No investments yet.</div>
          ) : (
            <div className="rounded-xl border border-bm-border/70 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 font-medium text-right">Assets</th>
                    <th className="px-4 py-3 font-medium">Sponsor</th>
                    <th className="px-4 py-3 font-medium">Target Close</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {deals.map((deal) => (
                    <tr key={deal.deal_id} className="hover:bg-bm-surface/20">
                      <td className="px-4 py-3 font-medium">{deal.name}</td>
                      <td className="px-4 py-3"><span className="rounded-full border border-bm-border/70 px-2 py-0.5 text-xs">{STAGE_LABELS[deal.stage] || deal.stage}</span></td>
                      <td className="px-4 py-3 text-right text-bm-muted2">{assetCounts[deal.deal_id] ?? 0}</td>
                      <td className="px-4 py-3 text-bm-muted2">{deal.sponsor || "—"}</td>
                      <td className="px-4 py-3 text-bm-muted2">{deal.target_close_date?.slice(0, 10) || "—"}</td>
                      <td className="px-4 py-3"><Link href={`${basePath}/deals/${deal.deal_id}`} className="text-xs text-bm-accent hover:underline">Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Capital */}
      {moduleTab === "Capital" && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Capital Accounts</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-bm-border/60 p-3"><p className="text-xs text-bm-muted2">Committed</p><p className="mt-1 font-medium">{fmtMoney(fundState?.total_committed)}</p></div>
            <div className="rounded-lg border border-bm-border/60 p-3"><p className="text-xs text-bm-muted2">Called</p><p className="mt-1 font-medium">{fmtMoney(fundState?.total_called)}</p></div>
            <div className="rounded-lg border border-bm-border/60 p-3"><p className="text-xs text-bm-muted2">Distributed</p><p className="mt-1 font-medium">{fmtMoney(fundState?.total_distributed)}</p></div>
            <div className="rounded-lg border border-bm-border/60 p-3"><p className="text-xs text-bm-muted2">NAV</p><p className="mt-1 font-medium">{fmtMoney(fundState?.portfolio_nav)}</p></div>
          </div>
        </div>
      )}

      {/* Scenarios */}
      {moduleTab === "Scenarios" && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Scenarios</h2>
          {scenarios.length === 0 ? (
            <p className="text-sm text-bm-muted2">No scenarios configured. Base scenario is created automatically with the fund.</p>
          ) : (
            <div className="space-y-2">
              {scenarios.map((s) => (
                <div key={s.scenario_id} className="rounded-lg border border-bm-border/60 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-bm-muted2">{s.scenario_type}{s.is_base ? " (Base)" : ""}</p>
                  </div>
                  <span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs">{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit */}
      {moduleTab === "Audit" && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Audit Trail</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="rounded-lg border border-bm-border/60 px-3 py-2">
              <p className="font-medium">fund.created</p>
              <p className="text-xs text-bm-muted2">{fund?.created_at?.slice(0, 19).replace("T", " ") || "—"}</p>
            </li>
            {deals.map((deal) => (
              <li key={deal.deal_id} className="rounded-lg border border-bm-border/60 px-3 py-2">
                <p className="font-medium">investment.linked · {deal.name}</p>
                <p className="text-xs text-bm-muted2">{deal.created_at?.slice(0, 19).replace("T", " ")}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attachments */}
      {moduleTab === "Attachments" && businessId && environmentId && (
        <RepeEntityDocuments businessId={businessId} envId={environmentId} entityType="fund" entityId={params.fundId} />
      )}
    </section>
  );
}

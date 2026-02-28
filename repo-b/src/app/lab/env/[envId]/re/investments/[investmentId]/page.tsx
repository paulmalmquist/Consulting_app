"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  return `${Number(v).toFixed(2)}x`;
}

const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourced", underwriting: "UW", ic: "IC",
  closing: "Closing", operating: "Operating", exited: "Exited",
};

export default function InvestmentHomePage({
  params,
}: {
  params: { envId: string; investmentId: string };
}) {
  const { envId } = useReEnv();
  const [inv, setInv] = useState<ReV2Investment | null>(null);
  const [jvs, setJvs] = useState<ReV2Jv[]>([]);
  const [state, setState] = useState<ReV2InvestmentQuarterState | null>(null);
  const [fundDetail, setFundDetail] = useState<RepeFundDetail | null>(null);
  const [assets, setAssets] = useState<ReV2InvestmentAsset[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const quarter = pickQ();
  const base = `/lab/env/${envId}/re`;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getReV2Investment(params.investmentId),
      listReV2Jvs(params.investmentId),
      getReV2InvestmentQuarterState(params.investmentId, quarter).catch(() => null),
      getReV2InvestmentAssets(params.investmentId, quarter).catch(() => []),
      getReV2InvestmentLineage(params.investmentId, quarter).catch(() => null),
    ])
      .then(async ([i, j, s, assetRows, lineageData]) => {
        setInv(i);
        setJvs(j);
        setState(s);
        setAssets(assetRows);
        setLineage(lineageData);
        if (i?.fund_id) {
          try { setFundDetail(await getRepeFund(i.fund_id)); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.investmentId, quarter]);

  if (loading) return <div className="p-6 text-sm text-bm-muted2">Loading investment...</div>;
  if (!inv) return <div className="p-6 text-sm text-red-400">Investment not found</div>;

  return (
    <section className="space-y-5" data-testid="re-investment-homepage">
      {/* Header */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Investment</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{inv.name}</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              {inv.investment_type?.toUpperCase()} · {STAGE_LABELS[inv.stage] || inv.stage}
              {inv.sponsor ? ` · ${inv.sponsor}` : ""}
            </p>
            {fundDetail && (
              <p className="mt-1 text-xs text-bm-muted2">
                Fund: <Link href={`${base}/funds/${inv.fund_id}`} className="text-bm-accent hover:underline">{fundDetail.fund.name}</Link>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLineageOpen(true)}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Lineage
            </button>
            <Link href={`${base}/deals?fund=${inv.fund_id}&deal=${params.investmentId}`} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              + JV Entity
            </Link>
            <Link href={`${base}/assets?fund=${inv.fund_id}&deal=${params.investmentId}`} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              + Asset
            </Link>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Committed", value: fmtMoney(inv.committed_capital) },
          { label: "Invested", value: fmtMoney(inv.invested_capital) },
          { label: "NAV", value: fmtMoney(state?.nav) },
          { label: "MOIC", value: fmtX(state?.equity_multiple) },
          { label: "Hold Period", value: inv.target_close_date ? `Since ${inv.target_close_date.slice(0, 10)}` : "—" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{k.label}</p>
            <p className="mt-1 text-lg font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      {/* JV Entities Table */}
      <div>
        <h2 className="mb-3 text-xs uppercase tracking-[0.12em] text-bm-muted2">JV Entities</h2>
        {jvs.length === 0 ? (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-center text-sm text-bm-muted2">
            No JV entities. Assets are attached directly to this investment.
          </div>
        ) : (
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-4 py-3 font-medium">Legal Name</th>
                  <th className="px-4 py-3 font-medium text-right">Ownership %</th>
                  <th className="px-4 py-3 font-medium text-right">GP %</th>
                  <th className="px-4 py-3 font-medium text-right">LP %</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {jvs.map((jv) => (
                  <tr key={jv.jv_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium">{jv.legal_name}</td>
                    <td className="px-4 py-3 text-right">{(Number(jv.ownership_percent) * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right text-bm-muted2">{jv.gp_percent ? `${(Number(jv.gp_percent) * 100).toFixed(1)}%` : "—"}</td>
                    <td className="px-4 py-3 text-right text-bm-muted2">{jv.lp_percent ? `${(Number(jv.lp_percent) * 100).toFixed(1)}%` : "—"}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs capitalize">{jv.status}</span></td>
                    <td className="px-4 py-3">
                      <Link href={`${base}/jv/${jv.jv_id}`} className="text-xs text-bm-accent hover:underline">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Direct Assets */}
      {assets.filter((asset) => !asset.jv_id).length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Direct Assets</h2>
          <div className="mt-3 space-y-2">
            {assets
              .filter((asset) => !asset.jv_id)
              .map((asset) => (
                <div key={asset.asset_id} className="flex items-center justify-between rounded-lg border border-bm-border/60 px-3 py-2 text-sm">
                  <Link href={`${base}/assets/${asset.asset_id}`} className="font-medium text-bm-accent hover:underline">
                    {asset.name}
                  </Link>
                  <span className="text-bm-muted2">{asset.nav ? fmtMoney(asset.nav) : "—"}</span>
                </div>
              ))}
          </div>
        </div>
      )}
      <EntityLineagePanel
        open={lineageOpen}
        onOpenChange={setLineageOpen}
        title={`Investment Lineage · ${quarter}`}
        lineage={lineage}
      />
    </section>
  );
}

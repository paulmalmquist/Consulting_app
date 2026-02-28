"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getReV2Jv,
  listReV2JvAssets,
  getReV2JvQuarterState,
  getReV2JvLineage,
  getReV2Investment,
  ReV2Jv,
  ReV2JvQuarterState,
  ReV2Investment,
  ReV2InvestmentAsset,
  ReV2EntityLineageResponse,
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

export default function JvHomePage({
  params,
}: {
  params: { envId: string; jvId: string };
}) {
  const { envId } = useReEnv();
  const [jv, setJv] = useState<ReV2Jv | null>(null);
  const [assets, setAssets] = useState<ReV2InvestmentAsset[]>([]);
  const [state, setState] = useState<ReV2JvQuarterState | null>(null);
  const [investment, setInvestment] = useState<ReV2Investment | null>(null);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const quarter = pickQ();
  const base = `/lab/env/${envId}/re`;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getReV2Jv(params.jvId),
      listReV2JvAssets(params.jvId, quarter),
      getReV2JvQuarterState(params.jvId, quarter).catch(() => null),
      getReV2JvLineage(params.jvId, quarter).catch(() => null),
    ])
      .then(async ([j, a, s, lineageData]) => {
        setJv(j);
        setAssets(a);
        setState(s);
        setLineage(lineageData);
        if (j?.investment_id) {
          try { setInvestment(await getReV2Investment(j.investment_id)); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.jvId, quarter]);

  if (loading) return <div className="p-6 text-sm text-bm-muted2">Loading JV...</div>;
  if (!jv) return <div className="p-6 text-sm text-red-400">JV entity not found</div>;

  return (
    <section className="space-y-5" data-testid="re-jv-homepage">
      {/* Header */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">JV Entity</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{jv.legal_name}</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              Ownership: {(Number(jv.ownership_percent) * 100).toFixed(1)}%
              {jv.gp_percent ? ` · GP ${(Number(jv.gp_percent) * 100).toFixed(1)}%` : ""}
              {jv.lp_percent ? ` · LP ${(Number(jv.lp_percent) * 100).toFixed(1)}%` : ""}
            </p>
            {investment && (
              <p className="mt-1 text-xs text-bm-muted2">
                Investment: <Link href={`${base}/investments/${jv.investment_id}`} className="text-bm-accent hover:underline">{investment.name}</Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLineageOpen(true)}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Lineage
            </button>
            <span className="rounded-full bg-bm-surface/40 px-3 py-1 text-xs capitalize">{jv.status}</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "NAV", value: fmtMoney(state?.nav) },
          { label: "NOI", value: fmtMoney(state?.noi) },
          { label: "Debt Outstanding", value: fmtMoney(state?.debt_balance) },
          { label: "Assets", value: String(assets.length) },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{k.label}</p>
            <p className="mt-1 text-lg font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Assets Table */}
      <div>
        <h2 className="mb-3 text-xs uppercase tracking-[0.12em] text-bm-muted2">Assets</h2>
        {assets.length === 0 ? (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-center text-sm text-bm-muted2">
            No assets attached to this JV entity.
          </div>
        ) : (
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium text-right">Current NAV</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {assets.map((a) => (
                  <tr key={a.asset_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-bm-muted2">{a.asset_type === "property" ? "Property" : "Loan / CMBS"}</td>
                    <td className="px-4 py-3 text-right text-bm-muted2">{a.nav ? fmtMoney(a.nav) : "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`${base}/assets/${a.asset_id}`} className="text-xs text-bm-accent hover:underline">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <EntityLineagePanel
        open={lineageOpen}
        onOpenChange={setLineageOpen}
        title={`JV Lineage · ${quarter}`}
        lineage={lineage}
      />
    </section>
  );
}

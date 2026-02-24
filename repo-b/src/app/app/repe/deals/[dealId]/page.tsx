"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getRepeDeal,
  getRepeFund,
  listRepeAssets,
  RepeAsset,
  RepeDeal,
  RepeFundDetail,
} from "@/lib/bos-api";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";

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
  "Underwriting",
  "Scenarios",
  "Assets",
  "Reports",
  "Audit",
  "Attachments",
] as const;

type ModuleKey = (typeof MODULES)[number];

export default function ReInvestmentDetailPage({ params }: { params: { dealId: string } }) {
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const [moduleTab, setModuleTab] = useState<ModuleKey>("Overview");
  const [deal, setDeal] = useState<RepeDeal | null>(null);
  const [fund, setFund] = useState<RepeFundDetail | null>(null);
  const [assets, setAssets] = useState<RepeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const row = await getRepeDeal(params.dealId);
        const [fundDetail, assetRows] = await Promise.all([
          getRepeFund(row.fund_id).catch(() => null),
          listRepeAssets(row.deal_id),
        ]);
        if (cancelled) return;
        setDeal(row);
        setFund(fundDetail);
        setAssets(assetRows);
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
  }, [params.dealId]);

  const stageLabel = useMemo(() => {
    if (!deal) return "—";
    return STAGE_LABELS[deal.stage] || deal.stage;
  }, [deal]);

  if (loading) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">
        Loading investment...
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-red-400">
        {error || "Investment not found"}
      </div>
    );
  }

  return (
    <section className="space-y-4" data-testid="re-investment-homepage">
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Investment</p>
            <h1 className="mt-1 text-2xl font-semibold">{deal.name}</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              {deal.deal_type.toUpperCase()} · {stageLabel}
              {fund?.fund?.name ? ` · ${fund.fund.name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${basePath}/assets?fund=${deal.fund_id}&deal=${deal.deal_id}`}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Add Asset
            </Link>
            <Link
              href={`${basePath}/deals`}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Back to Investments
            </Link>
          </div>
        </div>
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
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Summary</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-bm-muted2">Stage</dt>
                <dd className="font-medium">{stageLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Sponsor</dt>
                <dd className="font-medium">{deal.sponsor || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Target Close</dt>
                <dd className="font-medium">{deal.target_close_date ? deal.target_close_date.slice(0, 10) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Assets</dt>
                <dd className="font-medium">{assets.length}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Children</h2>
            <p className="mt-2 text-sm text-bm-muted2">
              This investment owns {assets.length} {assets.length === 1 ? "asset" : "assets"}.
            </p>
            <Link
              href={`${basePath}/assets?fund=${deal.fund_id}&deal=${deal.deal_id}`}
              className="mt-3 inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Add Child Asset
            </Link>
          </div>
        </div>
      ) : null}

      {moduleTab === "Underwriting" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Underwriting</h2>
          <p className="mt-2 text-sm text-bm-muted2">
            Underwriting runs are attached to this investment stage. Use the deal workspace to run scenarios and IC cases.
          </p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Stage", value: stageLabel },
              { label: "Sponsor", value: deal.sponsor || "—" },
              { label: "Assets", value: String(assets.length) },
              { label: "Close Target", value: deal.target_close_date?.slice(0, 10) || "—" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{item.label}</p>
                <p className="mt-1 text-sm font-medium">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {moduleTab === "Scenarios" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
          Scenario overrides for this investment are available after the first underwriting run.
        </div>
      ) : null}

      {moduleTab === "Assets" ? (
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <div className="border-b border-bm-border/70 bg-bm-surface/20 px-4 py-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Assets</h2>
            <Link
              href={`${basePath}/assets?fund=${deal.fund_id}&deal=${deal.deal_id}`}
              className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
            >
              + New Asset
            </Link>
          </div>
          {assets.length === 0 ? (
            <div className="p-4 text-sm text-bm-muted2">No assets yet for this investment.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/70 bg-bm-surface/10">
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Name</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Type</th>
                  <th className="px-4 py-2 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {assets.map((asset) => (
                  <tr key={asset.asset_id}>
                    <td className="px-4 py-3 font-medium">{asset.name}</td>
                    <td className="px-4 py-3 uppercase text-bm-muted2">{asset.asset_type}</td>
                    <td className="px-4 py-3">
                      <Link href={`${basePath}/assets/${asset.asset_id}`} className="text-xs text-bm-accent hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {moduleTab === "Reports" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
          IC memo and underwriting report generation is available from this investment context.
        </div>
      ) : null}

      {moduleTab === "Audit" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Audit</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="rounded-lg border border-bm-border/60 px-3 py-2">
              <p className="font-medium">investment.created</p>
              <p className="text-xs text-bm-muted2">{deal.created_at?.slice(0, 19).replace("T", " ") || "—"}</p>
            </li>
            {assets.map((asset) => (
              <li key={asset.asset_id} className="rounded-lg border border-bm-border/60 px-3 py-2">
                <p className="font-medium">asset.linked · {asset.name}</p>
                <p className="text-xs text-bm-muted2">{asset.created_at?.slice(0, 19).replace("T", " ") || "—"}</p>
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
            entityType="investment"
            entityId={deal.deal_id}
          />
        ) : (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
            Environment context is required to load attachments.
          </div>
        )
      ) : null}
    </section>
  );
}

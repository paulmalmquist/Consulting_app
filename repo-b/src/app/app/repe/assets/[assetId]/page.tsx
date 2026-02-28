"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getReV2AssetLineage,
  getReV2AssetQuarterState,
  getRepeAsset,
  getRepeAssetOwnership,
  getRepeDeal,
  ReV2AssetQuarterState,
  ReV2EntityLineageResponse,
  RepeAssetDetail,
  RepeAssetOwnership,
  RepeDeal,
} from "@/lib/bos-api";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";

const MODULES = [
  "Overview",
  "Performance",
  "Debt",
  "CapEx",
  "Valuation",
  "Scenarios",
  "Audit",
  "Attachments",
] as const;

type ModuleKey = (typeof MODULES)[number];

function pickQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}Q${q}`;
}

function asText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isFinite(value) ? value.toString() : "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function asPct(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function asCurrency(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return asText(value);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function ReAssetDetailPage({ params }: { params: { assetId: string } }) {
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const quarter = pickQuarter();
  const [moduleTab, setModuleTab] = useState<ModuleKey>("Overview");
  const [detail, setDetail] = useState<RepeAssetDetail | null>(null);
  const [deal, setDeal] = useState<RepeDeal | null>(null);
  const [ownership, setOwnership] = useState<RepeAssetOwnership | null>(null);
  const [financialState, setFinancialState] = useState<ReV2AssetQuarterState | null>(null);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const assetDetail = await getRepeAsset(params.assetId);
        const [dealRow, ownershipRow, finState] = await Promise.all([
          getRepeDeal(assetDetail.asset.deal_id).catch(() => null),
          getRepeAssetOwnership(assetDetail.asset.asset_id).catch(() => null),
          getReV2AssetQuarterState(assetDetail.asset.asset_id, quarter).catch(() => null),
        ]);
        if (cancelled) return;
        setDetail(assetDetail);
        setDeal(dealRow);
        setOwnership(ownershipRow);
        setFinancialState(finState);
        setLineage(await getReV2AssetLineage(assetDetail.asset.asset_id, quarter).catch(() => null));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load asset");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.assetId, quarter]);

  if (loading) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">
        Loading asset...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-red-400">
        {error || "Asset not found"}
      </div>
    );
  }

  const asset = detail.asset;
  const assetType = asset.asset_type.toUpperCase();

  return (
    <section className="space-y-4" data-testid="re-asset-homepage">
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Asset</p>
            <h1 className="mt-1 text-2xl font-semibold">{asset.name}</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              {assetType}
              {deal?.name ? ` · ${deal.name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLineageOpen(true)}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Lineage
            </button>
            {deal ? (
              <Link
                href={`${basePath}/deals/${deal.deal_id}`}
                className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
              >
                Open Investment
              </Link>
            ) : null}
            <Link
              href={`${basePath}/assets`}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Back to Assets
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
                <dt className="text-xs text-bm-muted2">Asset Type</dt>
                <dd className="font-medium">{assetType}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Deal</dt>
                <dd className="font-medium">{deal?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Property Type</dt>
                <dd className="font-medium">{asText(detail.details.property_type)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Market</dt>
                <dd className="font-medium">{asText(detail.details.market)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Units</dt>
                <dd className="font-medium">{asText(detail.details.units)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Rating</dt>
                <dd className="font-medium">{asText(detail.details.rating)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Latest Quarter · {quarter}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">NOI</p>
                <p className="mt-1 font-medium">{asCurrency(financialState?.noi)}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Implied Value</p>
                <p className="mt-1 font-medium">{asCurrency(financialState?.asset_value)}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">LTV</p>
                <p className="mt-1 font-medium">{asPct(financialState?.ltv)}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">DSCR</p>
                <p className="mt-1 font-medium">{asText(financialState?.dscr)}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {moduleTab === "Performance" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Performance</h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "NOI", value: asCurrency(financialState?.noi) },
              { label: "Occupancy", value: asPct(financialState?.occupancy ?? detail.details.occupancy) },
              { label: "Debt Yield", value: asPct(financialState?.debt_yield) },
              { label: "NAV Equity", value: asCurrency(financialState?.implied_equity_value ?? financialState?.nav) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{item.label}</p>
                <p className="mt-1 text-sm font-medium">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {moduleTab === "Debt" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Debt</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-bm-muted2">Loan Balance</dt>
              <dd className="font-medium">{asCurrency(financialState?.debt_balance)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">Debt Service</dt>
              <dd className="font-medium">{asCurrency(financialState?.debt_service)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">LTV</dt>
              <dd className="font-medium">{asPct(financialState?.ltv)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">DSCR</dt>
              <dd className="font-medium">{asText(financialState?.dscr)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {moduleTab === "CapEx" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
          CapEx tracking will populate here as project budgets and actuals are entered.
        </div>
      ) : null}

      {moduleTab === "Valuation" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Valuation</h2>
          {financialState ? (
            <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <dt className="text-xs text-bm-muted2">Quarter</dt>
                <dd className="font-medium">{financialState.quarter}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Snapshot</dt>
                <dd className="font-medium truncate">{financialState.inputs_hash}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Gross Value</dt>
                <dd className="font-medium">{asCurrency(financialState.asset_value)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Equity Value</dt>
                <dd className="font-medium">{asCurrency(financialState.implied_equity_value)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-bm-muted2">
              No valuation snapshot for {quarter} yet.
            </p>
          )}
        </div>
      ) : null}

      {moduleTab === "Scenarios" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
          Scenario drafts and override workflows are available after the first valuation run.
        </div>
      ) : null}

      {moduleTab === "Audit" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Audit</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="rounded-lg border border-bm-border/60 px-3 py-2">
              <p className="font-medium">asset.created</p>
              <p className="text-xs text-bm-muted2">{asset.created_at?.slice(0, 19).replace("T", " ") || "—"}</p>
            </li>
            <li className="rounded-lg border border-bm-border/60 px-3 py-2">
              <p className="font-medium">ownership.links</p>
              <p className="text-xs text-bm-muted2">{ownership?.links?.length || 0} records</p>
            </li>
          </ul>
        </div>
      ) : null}

      {moduleTab === "Attachments" ? (
        businessId && environmentId ? (
          <RepeEntityDocuments
            businessId={businessId}
            envId={environmentId}
            entityType="asset"
            entityId={asset.asset_id}
          />
        ) : (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
            Environment context is required to load attachments.
          </div>
        )
      ) : null}
      <EntityLineagePanel
        open={lineageOpen}
        onOpenChange={setLineageOpen}
        title={`Asset Lineage · ${quarter}`}
        lineage={lineage}
      />
    </section>
  );
}

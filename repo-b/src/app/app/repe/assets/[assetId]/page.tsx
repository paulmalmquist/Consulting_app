"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  getReV2AssetDetail,
  getReV2AssetQuarterState,
  getReV2AssetPeriods,
  getReV2AssetLineage,
  getAssetLeaseSummary,
  getAssetLeaseTenants,
  getAssetLeaseExpiration,
  getAssetRentRoll,
  getAssetLeaseDocuments,
  getAssetLeaseEconomics,
  ReV2AssetDetail,
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
  ReV2EntityLineageResponse,
  ReLeaseSummary,
  ReLeaseTenant,
  ReLeaseExpirationBucket,
  ReRentRollRow,
  ReLeaseDocument,
  ReLeaseEconomics,
} from "@/lib/bos-api";
import {
  isLockStateRenderable,
  useAuthoritativeState,
} from "@/hooks/useAuthoritativeState";
import { AuditDrawer } from "@/components/re/AuditDrawer";
import { TrustChip } from "@/components/re/TrustChip";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";
import { PROPERTY_TYPE_LABELS, label as labelFn } from "@/lib/labels";
import CockpitSection from "@/components/repe/asset-cockpit/CockpitSection";
import LeasingSection from "@/components/repe/asset-cockpit/LeasingSection";
import FinancialsSection from "@/components/repe/asset-cockpit/FinancialsSection";
import DebtSection from "@/components/repe/asset-cockpit/DebtSection";
import ValuationSection from "@/components/repe/asset-cockpit/ValuationSection";
import DocumentsSection from "@/components/repe/asset-cockpit/DocumentsSection";
import AuditSection from "@/components/repe/asset-cockpit/AuditSection";
import CashFlowSection from "@/components/repe/asset-cockpit/CashFlowSection";
import { fmtMoney } from "@/components/repe/asset-cockpit/format-utils";
import { resolveAssetMetrics } from "@/lib/resolve-exit-metrics";

const SECTIONS = ["Home", "Leasing", "Financials", "Cash Flow", "Debt", "Valuation", "Documents", "Audit"] as const;
type SectionKey = (typeof SECTIONS)[number];

function pickQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}Q${q}`;
}

export default function ReAssetDetailPage({ params }: { params: { assetId: string } }) {
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();

  // Authoritative State Lockdown — Phase 3
  // Quarter must come from the URL when supplied so deep-links and the
  // verification harness can target a specific period. Defaults to the
  // platform-current quarter.
  const searchParams = useSearchParams();
  const quarterFromUrl = searchParams?.get("quarter") || null;
  const auditMode = searchParams?.get("audit_mode") === "1";
  const quarter = quarterFromUrl ?? pickQuarter();

  // Single-fetch authoritative state for the asset's released
  // quarterly KPIs (Revenue / OpEx / NOI / Capex). The KPI components
  // prefer state.canonical_metrics for any released period.
  const {
    state: authoritativeAssetState,
    lockState: authoritativeAssetLockState,
  } = useAuthoritativeState({
    entityType: "asset",
    entityId: params.assetId,
    quarter,
  });
  const _authoritativeAssetRenderable = isLockStateRenderable(authoritativeAssetLockState);

  const [section, setSection] = useState<SectionKey>("Home");

  // Core data
  const [detail, setDetail] = useState<ReV2AssetDetail | null>(null);
  const [financialState, setFinancialState] = useState<ReV2AssetQuarterState | null>(null);
  const [periods, setPeriods] = useState<ReV2AssetPeriod[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Leasing data (lazy-loaded on first Leasing tab activation)
  const [leaseSummary, setLeaseSummary] = useState<ReLeaseSummary | null>(null);
  const [leaseTenants, setLeaseTenants] = useState<ReLeaseTenant[]>([]);
  const [leaseWalt, setLeaseWalt] = useState<number | null>(null);
  const [leaseExpiration, setLeaseExpiration] = useState<ReLeaseExpirationBucket[]>([]);
  const [leaseTotalSf, setLeaseTotalSf] = useState(0);
  const [rentRoll, setRentRoll] = useState<ReRentRollRow[]>([]);
  const [leaseDocuments, setLeaseDocuments] = useState<ReLeaseDocument[]>([]);
  const [leaseEconomics, setLeaseEconomics] = useState<ReLeaseEconomics | null>(null);
  const [leasingLoading, setLeasingLoading] = useState(false);
  const leaseFetched = useRef(false);

  // Load core data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const assetDetail = await getReV2AssetDetail(params.assetId);
        if (cancelled) return;
        setDetail(assetDetail);

        const [finState, periodsData, lin] = await Promise.allSettled([
          getReV2AssetQuarterState(params.assetId, quarter),
          getReV2AssetPeriods(params.assetId),
          getReV2AssetLineage(params.assetId, quarter),
        ]);

        if (cancelled) return;
        setFinancialState(finState.status === "fulfilled" ? finState.value : null);
        setPeriods(periodsData.status === "fulfilled" ? periodsData.value : []);
        setLineage(lin.status === "fulfilled" ? lin.value : null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load asset");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [params.assetId, quarter]);

  // Lazy-load leasing data on first activation of the Leasing tab
  useEffect(() => {
    if (section !== "Leasing" || leaseFetched.current) return;
    leaseFetched.current = true;
    setLeasingLoading(true);

    Promise.allSettled([
      getAssetLeaseSummary(params.assetId),
      getAssetLeaseTenants(params.assetId),
      getAssetLeaseExpiration(params.assetId),
      getAssetRentRoll(params.assetId),
      getAssetLeaseDocuments(params.assetId),
      getAssetLeaseEconomics(params.assetId),
    ]).then(([sumRes, tenRes, expRes, rrRes, docRes, ecoRes]) => {
      if (sumRes.status === "fulfilled") setLeaseSummary(sumRes.value);
      if (tenRes.status === "fulfilled") {
        setLeaseTenants(tenRes.value.tenants);
        setLeaseWalt(tenRes.value.walt);
      }
      if (expRes.status === "fulfilled") {
        setLeaseExpiration(expRes.value.buckets);
        setLeaseTotalSf(expRes.value.total_leased_sf);
      }
      if (rrRes.status === "fulfilled") setRentRoll(rrRes.value.rows);
      if (docRes.status === "fulfilled") setLeaseDocuments(docRes.value.documents);
      if (ecoRes.status === "fulfilled") setLeaseEconomics(ecoRes.value);
    }).finally(() => setLeasingLoading(false));
  }, [section, params.assetId]);

  if (loading) {
    return <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-bm-muted2 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.14)] dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.92]">Loading asset...</div>;
  }

  if (error || !detail) {
    return (
      <div className="rounded-[28px] border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
        {error || "Asset not found"}
      </div>
    );
  }

  const { asset, property, investment, fund, env } = detail;
  const base = basePath || `/lab/env/${env.env_id}/re`;
  const m = resolveAssetMetrics(detail, financialState);

  return (
    <section className="space-y-4" data-testid="re-asset-homepage">
      {/* Authoritative State Lockdown — Phase 3
          TrustChip + AuditDrawer for the asset view. Per
          docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md (Invariants 3 + 8),
          every released KPI displays its provenance and ?audit_mode=1
          opens the full audit drawer with snapshot version, formulas,
          provenance, and null reasons. */}
      <div
        data-testid="asset-lineage-chip"
        className="flex flex-wrap items-center gap-3 text-xs text-slate-600"
      >
        <span className="font-semibold text-slate-700">Lineage</span>
        <TrustChip
          lockState={authoritativeAssetLockState}
          snapshotVersion={authoritativeAssetState?.snapshot_version}
          trustStatus={authoritativeAssetState?.trust_status}
        />
        <span className="text-slate-500">
          requested quarter: <span className="font-mono">{quarter}</span>
        </span>
      </div>
      {auditMode && (
        <AuditDrawer
          state={authoritativeAssetState}
          lockState={authoritativeAssetLockState}
          requestedQuarter={quarter}
        />
      )}
      {/* ── HEADER ── */}
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.18)] dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.92]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bm-muted2">
              <Link href={`${base}/funds/${fund.fund_id}`} className="hover:text-bm-accent hover:underline">
                {fund.name}
              </Link>
              <span>/</span>
              <Link href={`${base}/investments/${investment.investment_id}`} className="hover:text-bm-accent hover:underline">
                {investment.name}
              </Link>
              <span>/</span>
              <span className="text-bm-text">{asset.name}</span>
            </div>

            {/* Title + status */}
            <div className="mt-3 flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-bm-text">{asset.name}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                asset.status === "active"
                  ? "bg-green-500/15 text-green-400 border border-green-500/30"
                  : asset.status === "exited"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    : asset.status === "written_off"
                      ? "bg-red-500/15 text-red-400 border border-red-500/30"
                      : asset.status === "archived"
                        ? "bg-red-500/15 text-red-400 border border-red-500/30"
                        : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  asset.status === "active" ? "bg-green-400"
                    : asset.status === "exited" ? "bg-amber-400"
                    : asset.status === "written_off" || asset.status === "archived" ? "bg-red-400"
                    : "bg-slate-400"
                }`} />
                {asset.status}
              </span>
            </div>

            {/* Subtitle tags */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {property.property_type && (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-bm-muted2 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.06]">
                  {labelFn(PROPERTY_TYPE_LABELS, property.property_type)}
                </span>
              )}
              {property.city && (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-bm-muted2 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.06]">
                  {property.city}, {property.state}
                </span>
              )}
              {property.msa && (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-bm-muted2 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.06]">
                  {property.msa}
                </span>
              )}
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-bm-muted2 dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.06]">
                {fund.name}
              </span>
            </div>

            {/* Metadata grid */}
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Acquisition</dt>
                <dd className="text-sm font-medium text-bm-text truncate">{asset.acquisition_date ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Cost Basis</dt>
                <dd className="text-sm font-medium text-bm-text truncate">{fmtMoney(asset.cost_basis)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
                  {m.isExited ? m.assetValue.label : "Current Value"}
                </dt>
                <dd className="text-sm font-medium text-bm-text truncate">
                  {m.isExited
                    ? (m.assetValue.value != null ? fmtMoney(m.assetValue.value) : "—")
                    : fmtMoney(financialState?.asset_value)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Property Type</dt>
                <dd className="text-sm font-medium text-bm-text truncate">{labelFn(PROPERTY_TYPE_LABELS, property.property_type ?? "")}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Market</dt>
                <dd className="text-sm font-medium text-bm-text truncate">{property.market ?? property.msa ?? "—"}</dd>
              </div>
              {m.isExited && m.saleDate ? (
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Sale Date</dt>
                  <dd className="text-sm font-medium text-bm-text truncate">
                    {new Date(m.saleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </dd>
                </div>
              ) : (
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Square Feet</dt>
                  <dd className="text-sm font-medium text-bm-text truncate">{property.square_feet ? `${(Number(property.square_feet) / 1000).toFixed(0)}K SF` : "—"}</dd>
                </div>
              )}
            </dl>
          </div>

        </div>
      </div>

      {/* ── SECTION NAV ── */}
      <div className="flex flex-wrap gap-2 rounded-full border border-slate-200 bg-white p-1.5 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.1)] dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.85]">
        {SECTIONS.map((lbl) => (
          <button
            key={lbl}
            type="button"
            onClick={() => setSection(lbl)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] transition ${
              section === lbl
                ? "border-slate-900 bg-slate-900 text-white dark:border-bm-border/50 dark:bg-bm-surface/40 dark:text-bm-text"
                : "border-transparent text-bm-muted2 hover:text-bm-text"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* ── HOME ── */}
      {section === "Home" && (
        <CockpitSection
          detail={detail}
          financialState={financialState}
          periods={periods}
          occupancy={property.occupancy}
          leaseSummary={leaseSummary}
        />
      )}

      {/* ── LEASING ── */}
      {section === "Leasing" && (
        <LeasingSection
          assetId={asset.asset_id}
          summary={leaseSummary}
          tenants={leaseTenants}
          walt={leaseWalt}
          expirationBuckets={leaseExpiration}
          totalLeasedSf={leaseTotalSf}
          rentRoll={rentRoll}
          documents={leaseDocuments}
          economics={leaseEconomics}
          loading={leasingLoading}
        />
      )}

      {/* ── FINANCIALS ── */}
      {section === "Financials" && (
        <FinancialsSection
          assetId={asset.asset_id}
          quarter={quarter}
          financialState={financialState}
          periods={periods}
        />
      )}

      {/* ── CASH FLOW ── */}
      {section === "Cash Flow" && (
        <CashFlowSection
          assetId={asset.asset_id}
          quarter={quarter}
          auditMode={auditMode}
        />
      )}

      {/* ── DEBT ── */}
      {section === "Debt" && (
        <DebtSection
          financialState={financialState}
          periods={periods}
          assetId={params.assetId}
        />
      )}

      {/* ── VALUATION ── */}
      {section === "Valuation" && (
        <ValuationSection
          financialState={financialState}
          periods={periods}
        />
      )}

      {/* ── DOCUMENTS ── */}
      {section === "Documents" && businessId && environmentId && (
        <DocumentsSection
          businessId={businessId}
          environmentId={environmentId}
          assetId={asset.asset_id}
        />
      )}

      {/* ── AUDIT ── */}
      {section === "Audit" && (
        <AuditSection
          assetId={asset.asset_id}
          quarter={quarter}
          financialState={financialState}
          periods={periods}
          lineage={lineage}
          assetCreatedAt={asset.created_at}
        />
      )}

    </section>
  );
}

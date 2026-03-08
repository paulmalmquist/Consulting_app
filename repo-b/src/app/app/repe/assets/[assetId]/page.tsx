"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getReV2AssetDetail,
  getReV2AssetQuarterState,
  getReV2AssetPeriods,
  getReV2AssetLineage,
  generateReV2AssetReport,
  ReV2AssetDetail,
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
  ReV2EntityLineageResponse,
} from "@/lib/bos-api";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";
import { PROPERTY_TYPE_LABELS, label as labelFn } from "@/lib/labels";
import CockpitSection from "@/components/repe/asset-cockpit/CockpitSection";
import FinancialsSection from "@/components/repe/asset-cockpit/FinancialsSection";
import DebtSection from "@/components/repe/asset-cockpit/DebtSection";
import ValuationSection from "@/components/repe/asset-cockpit/ValuationSection";
import DocumentsSection from "@/components/repe/asset-cockpit/DocumentsSection";
import AuditSection from "@/components/repe/asset-cockpit/AuditSection";

const SECTIONS = ["Cockpit", "Financials", "Debt", "Valuation", "Documents", "Audit"] as const;
type SectionKey = (typeof SECTIONS)[number];

function pickQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}Q${q}`;
}

const REPORT_TYPES = [
  { value: "snapshot", label: "Asset Snapshot" },
  { value: "pnl", label: "Quarterly P&L Package" },
  { value: "trial_balance", label: "Trial Balance Export" },
  { value: "transactions", label: "Transaction Ledger" },
  { value: "occupancy", label: "Occupancy & Rent Summary" },
  { value: "audit", label: "Asset Audit Pack" },
] as const;

export default function ReAssetDetailPage({ params }: { params: { assetId: string } }) {
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const quarter = pickQuarter();
  const [section, setSection] = useState<SectionKey>("Cockpit");

  // Core data
  const [detail, setDetail] = useState<ReV2AssetDetail | null>(null);
  const [financialState, setFinancialState] = useState<ReV2AssetQuarterState | null>(null);
  const [periods, setPeriods] = useState<ReV2AssetPeriod[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Report generation
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportType, setReportType] = useState("snapshot");
  const [reportQuarter, setReportQuarter] = useState(quarter);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportResult, setReportResult] = useState<string | null>(null);

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

  // Report generation handler
  async function handleGenerateReport() {
    setReportGenerating(true);
    setReportResult(null);
    try {
      const result = await generateReV2AssetReport(params.assetId, {
        report_type: reportType,
        quarter: reportQuarter,
        format: "json",
      });
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${detail?.asset.name || "asset"}_${reportType}_${reportQuarter}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setReportResult("Report generated and downloaded.");
      setTimeout(() => setReportResult(null), 5000);
      setReportModalOpen(false);
    } catch (err) {
      setReportResult(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setReportGenerating(false);
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">Loading asset...</div>;
  }

  if (error || !detail) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
        {error || "Asset not found"}
      </div>
    );
  }

  const { asset, property, investment, fund, env } = detail;
  const base = basePath || `/lab/env/${env.env_id}/re`;

  return (
    <section className="space-y-4" data-testid="re-asset-homepage">
      {/* Header + Breadcrumb */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-bm-muted2">
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
            <div className="mt-2 flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{asset.name}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                asset.status === "active"
                  ? "bg-green-500/15 text-green-400 border border-green-500/30"
                  : asset.status === "archived"
                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  asset.status === "active" ? "bg-green-400" : asset.status === "archived" ? "bg-red-400" : "bg-amber-400"
                }`} />
                {asset.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {property.property_type && (
                <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2.5 py-0.5 text-xs text-bm-muted2">
                  {labelFn(PROPERTY_TYPE_LABELS, property.property_type)}
                </span>
              )}
              {property.city && (
                <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2.5 py-0.5 text-xs text-bm-muted2">
                  {property.city}, {property.state}
                </span>
              )}
              {property.msa && (
                <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2.5 py-0.5 text-xs text-bm-muted2">
                  {property.msa}
                </span>
              )}
              <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2.5 py-0.5 text-xs text-bm-muted2">
                {fund.name}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${base}/models?asset=${asset.asset_id}&fund=${fund.fund_id}`}
              className="rounded-lg border border-bm-accent/60 bg-bm-accent/10 px-3 py-2 text-sm text-bm-accent hover:bg-bm-accent/20"
            >
              Run Model
            </Link>
            <button
              type="button"
              onClick={() => setReportModalOpen(true)}
              className="rounded-lg bg-bm-accent px-3 py-2 text-sm text-white hover:bg-bm-accent/80"
            >
              Generate Report
            </button>
            <Link
              href={`${base}/assets`}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Back to Assets
            </Link>
          </div>
        </div>
      </div>

      {/* Section Nav */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2">
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setSection(label)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                section === label
                  ? "border-bm-accent/60 bg-bm-accent/10"
                  : "border-bm-border/70 hover:bg-bm-surface/40"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── COCKPIT ── */}
      {section === "Cockpit" && (
        <CockpitSection
          detail={detail}
          financialState={financialState}
          periods={periods}
          occupancy={property.occupancy}
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

      {/* ── DEBT ── */}
      {section === "Debt" && (
        <DebtSection
          financialState={financialState}
          periods={periods}
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

      {/* ── REPORT TOAST ── */}
      {reportResult && !reportModalOpen && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-3 shadow-lg backdrop-blur">
          <p className="text-sm font-medium text-green-300">{reportResult}</p>
        </div>
      )}

      {/* ── REPORT GENERATION MODAL ── */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl border border-bm-border bg-bm-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Generate Asset Report</h2>
            <p className="mt-1 text-sm text-bm-muted2">{asset.name}</p>

            <div className="mt-4 space-y-3">
              <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
                Report Type
                <select
                  className="mt-1 block w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  {REPORT_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>{rt.label}</option>
                  ))}
                </select>
              </label>

              <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
                Quarter
                <input
                  className="mt-1 block w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                  value={reportQuarter}
                  onChange={(e) => setReportQuarter(e.target.value)}
                  placeholder="2026Q1"
                />
              </label>
            </div>

            {reportResult && (
              <p className="mt-3 text-sm text-bm-muted2">{reportResult}</p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={reportGenerating}
                className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/80 disabled:opacity-50"
              >
                {reportGenerating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

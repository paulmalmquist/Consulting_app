"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getReV2AssetDetail,
  getReV2AssetQuarterState,
  getReV2AssetPeriods,
  getReV2AssetLineage,
  generateReV2AssetReport,
  listReV2Scenarios,
  ReV2AssetDetail,
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
  ReV2EntityLineageResponse,
  ReV2Scenario,
} from "@/lib/bos-api";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";
import CockpitSection from "@/components/repe/asset-cockpit/CockpitSection";
import ModelInputsSection from "@/components/repe/asset-cockpit/ModelInputsSection";
import ValuationReturnsSection from "@/components/repe/asset-cockpit/ValuationReturnsSection";
import OpsAuditSection from "@/components/repe/asset-cockpit/OpsAuditSection";

const SECTIONS = ["Cockpit", "Model Inputs", "Valuation & Returns", "Ops & Audit"] as const;
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
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
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

        const [finState, periodsData, lin, scenariosData] = await Promise.allSettled([
          getReV2AssetQuarterState(params.assetId, quarter),
          getReV2AssetPeriods(params.assetId),
          getReV2AssetLineage(params.assetId, quarter),
          listReV2Scenarios(assetDetail.fund.fund_id),
        ]);

        if (cancelled) return;
        setFinancialState(finState.status === "fulfilled" ? finState.value : null);
        setPeriods(periodsData.status === "fulfilled" ? periodsData.value : []);
        setLineage(lin.status === "fulfilled" ? lin.value : null);
        setScenarios(scenariosData.status === "fulfilled" ? scenariosData.value : []);
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
  const isPropertyAsset = String(asset.asset_type || "").toLowerCase() === "property";
  const sustainabilityHref = `${base}/sustainability?section=${isPropertyAsset ? "asset-sustainability" : "overview"}&fundId=${fund.fund_id}&investmentId=${investment.investment_id}&assetId=${asset.asset_id}`;

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
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{asset.name}</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              {asset.asset_type.toUpperCase()}
              {property.property_type ? ` · ${property.property_type}` : ""}
              {property.city ? ` · ${property.city}, ${property.state}` : property.market ? ` · ${property.market}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
          financialState={financialState}
          periods={periods}
          occupancy={property.occupancy}
        />
      )}

      {/* ── MODEL INPUTS ── */}
      {section === "Model Inputs" && (
        <ModelInputsSection
          detail={detail}
          financialState={financialState}
          scenarios={scenarios}
          quarter={quarter}
          sustainabilityHref={sustainabilityHref}
        />
      )}

      {/* ── VALUATION & RETURNS ── */}
      {section === "Valuation & Returns" && (
        <ValuationReturnsSection
          assetId={asset.asset_id}
          quarter={quarter}
          financialState={financialState}
          periods={periods}
          fundId={fund.fund_id}
        />
      )}

      {/* ── OPS & AUDIT ── */}
      {section === "Ops & Audit" && (
        <OpsAuditSection
          assetId={asset.asset_id}
          quarter={quarter}
          financialState={financialState}
          periods={periods}
          lineage={lineage}
          businessId={businessId ?? undefined}
          environmentId={environmentId ?? undefined}
          assetCreatedAt={asset.created_at}
        />
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

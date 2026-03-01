"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getReV2AssetDetail,
  getReV2AssetQuarterState,
  getReV2AssetPeriods,
  getReV2AssetLineage,
  getReV2AssetTrialBalance,
  getReV2AssetPnl,
  getReV2AssetTransactions,
  generateReV2AssetReport,
  listReV2Scenarios,
  ReV2AssetDetail,
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
  ReV2EntityLineageResponse,
  ReV2TrialBalanceRow,
  ReV2PnlRow,
  ReV2TransactionRow,
  ReV2Scenario,
} from "@/lib/bos-api";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";
import ValuationLeverPanel from "@/components/repe/ValuationLeverPanel";

const TABS = [
  "Overview",
  "Financials",
  "Occupancy",
  "Debt",
  "Valuation",
  "Sustainability",
  "Documents",
  "Accounting",
  "Runs / Audit",
] as const;
type TabKey = (typeof TABS)[number];

function pickQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}Q${q}`;
}

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n) || !n) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  if (n <= 1 && n >= 0) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

function fmtText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString() : "—";
  return String(v);
}

function fmtX(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

const REPORT_TYPES = [
  { value: "snapshot", label: "Asset Snapshot" },
  { value: "pnl", label: "Quarterly P&L Package" },
  { value: "trial_balance", label: "Trial Balance Export" },
  { value: "transactions", label: "Transaction Ledger" },
  { value: "occupancy", label: "Occupancy & Rent Summary" },
  { value: "audit", label: "Asset Audit Pack" },
] as const;

// Simple bar chart component (no chart library needed)
function MiniBarChart({
  data,
  valueKey,
  labelKey,
  color = "bg-blue-500",
  formatValue,
}: {
  data: Record<string, unknown>[];
  valueKey: string;
  labelKey: string;
  color?: string;
  formatValue?: (v: unknown) => string;
}) {
  if (!data.length) return <p className="text-sm text-bm-muted2">No data available.</p>;
  const maxVal = Math.max(...data.map((d) => Math.abs(Number(d[valueKey] ?? 0))), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const val = Number(d[valueKey] ?? 0);
        const pct = Math.abs(val) / maxVal;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-bm-muted2 shrink-0">{String(d[labelKey])}</span>
            <div className="flex-1 h-4 rounded bg-bm-surface/30 overflow-hidden">
              <div
                className={`h-full ${color} rounded`}
                style={{ width: `${(pct * 100).toFixed(1)}%` }}
              />
            </div>
            <span className="w-20 text-right font-medium">{formatValue ? formatValue(val) : fmtMoney(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Dual-series trend: Occupancy vs NOI
function OccupancyNoiTrend({ periods }: { periods: ReV2AssetPeriod[] }) {
  if (!periods.length) {
    return <p className="text-sm text-bm-muted2">No quarterly data available for trend chart.</p>;
  }
  const maxNoi = Math.max(...periods.map((p) => Math.abs(Number(p.noi ?? 0))), 1);
  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Occupancy vs NOI Trend</h3>
      <div className="space-y-2">
        {periods.map((p, i) => {
          const noiPct = Math.abs(Number(p.noi ?? 0)) / maxNoi;
          const occ = Number(p.occupancy ?? 0);
          const occDisplay = occ <= 1 ? (occ * 100).toFixed(1) : occ.toFixed(1);
          return (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-16 text-bm-muted2 shrink-0">{p.quarter}</span>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-1">
                  <span className="w-8 text-blue-300">NOI</span>
                  <div className="flex-1 h-3 rounded bg-bm-surface/30 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded" style={{ width: `${(noiPct * 100).toFixed(1)}%` }} />
                  </div>
                  <span className="w-16 text-right font-medium">{fmtMoney(p.noi)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-8 text-green-300">Occ</span>
                  <div className="flex-1 h-3 rounded bg-bm-surface/30 overflow-hidden">
                    <div className="h-full bg-green-500 rounded" style={{ width: `${occDisplay}%` }} />
                  </div>
                  <span className="w-16 text-right font-medium">{occDisplay}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-bm-muted2">
        NOI is accounting-derived (Revenue - OpEx). Occupancy from asset quarter state.
      </p>
    </div>
  );
}

export default function ReAssetDetailPage({ params }: { params: { assetId: string } }) {
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const quarter = pickQuarter();
  const [tab, setTab] = useState<TabKey>("Overview");

  // Core data
  const [detail, setDetail] = useState<ReV2AssetDetail | null>(null);
  const [financialState, setFinancialState] = useState<ReV2AssetQuarterState | null>(null);
  const [periods, setPeriods] = useState<ReV2AssetPeriod[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Accounting tab data (lazy loaded)
  const [trialBalance, setTrialBalance] = useState<ReV2TrialBalanceRow[]>([]);
  const [pnl, setPnl] = useState<ReV2PnlRow[]>([]);
  const [transactions, setTransactions] = useState<ReV2TransactionRow[]>([]);
  const [acctLoading, setAcctLoading] = useState(false);
  const [acctLoaded, setAcctLoaded] = useState(false);

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

  // Lazy load accounting data
  useEffect(() => {
    if (tab !== "Accounting" || acctLoaded) return;
    let cancelled = false;
    setAcctLoading(true);

    (async () => {
      const [tb, pl, tx] = await Promise.allSettled([
        getReV2AssetTrialBalance(params.assetId, quarter),
        getReV2AssetPnl(params.assetId, quarter),
        getReV2AssetTransactions(params.assetId, quarter),
      ]);
      if (cancelled) return;
      setTrialBalance(tb.status === "fulfilled" ? tb.value : []);
      setPnl(pl.status === "fulfilled" ? pl.value : []);
      setTransactions(tx.status === "fulfilled" ? tx.value : []);
      setAcctLoaded(true);
      setAcctLoading(false);
    })();

    return () => { cancelled = true; };
  }, [tab, acctLoaded, params.assetId, quarter]);

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
            <Link
              href={sustainabilityHref}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Sustainability
            </Link>
            <button
              type="button"
              onClick={() => setReportModalOpen(true)}
              className="rounded-lg bg-bm-accent px-3 py-2 text-sm text-white hover:bg-bm-accent/80"
            >
              Generate Report
            </button>
            <button
              type="button"
              onClick={() => setLineageOpen(true)}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Lineage
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

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "NOI", value: fmtMoney(financialState?.noi) },
          { label: "Occupancy", value: fmtPct(financialState?.occupancy ?? property.occupancy) },
          { label: "Value", value: fmtMoney(financialState?.asset_value) },
          { label: "Cap Rate", value: financialState?.asset_value && financialState?.noi
            ? fmtPct((Number(financialState.noi) * 4) / Number(financialState.asset_value))
            : "—" },
          { label: "NAV", value: fmtMoney(financialState?.nav) },
          { label: "Debt Balance", value: fmtMoney(financialState?.debt_balance) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{m.label}</p>
            <p className="mt-1 text-lg font-bold">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2">
        <div className="flex flex-wrap gap-2">
          {TABS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setTab(label)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
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

      {/* ── OVERVIEW TAB ── */}
      {tab === "Overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Property Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-bm-muted2">Property Type</dt><dd className="font-medium">{fmtText(property.property_type)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Market</dt><dd className="font-medium">{fmtText(property.market)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">City / State</dt><dd className="font-medium">{property.city ? `${property.city}, ${property.state}` : "—"}</dd></div>
              <div><dt className="text-xs text-bm-muted2">MSA</dt><dd className="font-medium">{fmtText(property.msa)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Address</dt><dd className="font-medium">{fmtText(property.address)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Units</dt><dd className="font-medium">{fmtText(property.units)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Square Feet</dt><dd className="font-medium">{property.square_feet ? `${(Number(property.square_feet) / 1000).toFixed(0)}K SF` : "—"}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Year Built</dt><dd className="font-medium">{fmtText(property.year_built)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Cost Basis</dt><dd className="font-medium">{fmtMoney(asset.cost_basis)}</dd></div>
              <div><dt className="text-xs text-bm-muted2">Status</dt><dd className="font-medium">{asset.status}</dd></div>
            </dl>
          </div>

          {/* Sector Capacity Card */}
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            {property.property_type ? (
              <>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
                  {property.property_type} Capacity
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {(property.property_type.toLowerCase() === "multifamily") ? (
                    <>
                      <div><dt className="text-xs text-bm-muted2">Units</dt><dd className="font-medium">{fmtText(property.units)}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Avg Rent / Unit</dt><dd className="font-medium">{property.avg_rent_per_unit != null ? fmtMoney(property.avg_rent_per_unit) : "—"}</dd></div>
                    </>
                  ) : null}
                  {(property.property_type.toLowerCase() === "senior_housing" || property.property_type.toLowerCase() === "senior housing") ? (
                    <>
                      <div><dt className="text-xs text-bm-muted2">Beds</dt><dd className="font-medium">{fmtText(property.beds)}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Licensed Beds</dt><dd className="font-medium">{fmtText(property.licensed_beds)}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Rev / Occupied Bed</dt><dd className="font-medium">{property.revenue_per_occupied_bed != null ? fmtMoney(property.revenue_per_occupied_bed) : "—"}</dd></div>
                    </>
                  ) : null}
                  {(property.property_type.toLowerCase() === "student_housing" || property.property_type.toLowerCase() === "student housing") ? (
                    <>
                      <div><dt className="text-xs text-bm-muted2">Beds</dt><dd className="font-medium">{fmtText(property.beds_student)}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Pre-Leased</dt><dd className="font-medium">{property.preleased_pct != null ? fmtPct(property.preleased_pct) : "—"}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">University</dt><dd className="font-medium">{fmtText(property.university_name)}</dd></div>
                    </>
                  ) : null}
                  {(property.property_type.toLowerCase() === "medical_office" || property.property_type.toLowerCase() === "medical office" || property.property_type.toLowerCase() === "mob") ? (
                    <>
                      <div><dt className="text-xs text-bm-muted2">Leasable SF</dt><dd className="font-medium">{property.leasable_sf != null ? `${(Number(property.leasable_sf) / 1000).toFixed(0)}K` : "—"}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Leased SF</dt><dd className="font-medium">{property.leased_sf != null ? `${(Number(property.leased_sf) / 1000).toFixed(0)}K` : "—"}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">WALT (yrs)</dt><dd className="font-medium">{property.walt_years != null ? `${Number(property.walt_years).toFixed(1)}` : "—"}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Anchor Tenant</dt><dd className="font-medium">{fmtText(property.anchor_tenant)}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Health System</dt><dd className="font-medium">{fmtText(property.health_system_affiliation)}</dd></div>
                    </>
                  ) : null}
                  {(property.property_type.toLowerCase() === "industrial") ? (
                    <>
                      <div><dt className="text-xs text-bm-muted2">Warehouse SF</dt><dd className="font-medium">{property.warehouse_sf != null ? `${(Number(property.warehouse_sf) / 1000).toFixed(0)}K` : "—"}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Office SF</dt><dd className="font-medium">{property.office_sf != null ? `${(Number(property.office_sf) / 1000).toFixed(0)}K` : "—"}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Clear Height</dt><dd className="font-medium">{property.clear_height_ft != null ? `${Number(property.clear_height_ft).toFixed(0)} ft` : "—"}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Dock Doors</dt><dd className="font-medium">{fmtText(property.dock_doors)}</dd></div>
                      <div><dt className="text-xs text-bm-muted2">Rail Served</dt><dd className="font-medium">{property.rail_served != null ? (property.rail_served ? "Yes" : "No") : "—"}</dd></div>
                    </>
                  ) : null}
                </dl>
              </>
            ) : (
              <OccupancyNoiTrend periods={periods} />
            )}
          </div>

          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              This Quarter P&L Summary · {quarter}
            </h2>
            {financialState ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Revenue", value: fmtMoney(financialState.revenue) },
                  { label: "OpEx", value: fmtMoney(financialState.opex) },
                  { label: "NOI", value: fmtMoney(financialState.noi) },
                  { label: "CapEx", value: fmtMoney(financialState.capex) },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-bm-border/60 p-3">
                    <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{m.label}</p>
                    <p className="mt-1 font-medium">{m.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-bm-muted2">No quarter state data for {quarter}.</p>
            )}
          </div>
        </div>
      ) : null}

      {/* ── FINANCIALS TAB ── */}
      {tab === "Financials" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">Quarterly Financials</h2>
          {periods.length === 0 ? (
            <p className="text-sm text-bm-muted2">No quarterly data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-3 py-2 text-left font-medium">Quarter</th>
                    <th className="px-3 py-2 text-right font-medium">Revenue</th>
                    <th className="px-3 py-2 text-right font-medium">OpEx</th>
                    <th className="px-3 py-2 text-right font-medium">NOI</th>
                    <th className="px-3 py-2 text-right font-medium">Margin</th>
                    <th className="px-3 py-2 text-right font-medium">CapEx</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {periods.map((p) => {
                    const margin = Number(p.revenue) > 0
                      ? Number(p.noi ?? 0) / Number(p.revenue)
                      : 0;
                    return (
                      <tr key={p.quarter} className="hover:bg-bm-surface/20">
                        <td className="px-3 py-2 font-medium">
                          <button
                            type="button"
                            onClick={() => { setTab("Accounting"); }}
                            className="text-bm-accent hover:underline"
                          >
                            {p.quarter}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">{fmtMoney(p.revenue)}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(p.opex)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtMoney(p.noi)}</td>
                        <td className="px-3 py-2 text-right">{fmtPct(margin)}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(p.capex)}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(p.asset_value)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* ── OCCUPANCY TAB ── */}
      {tab === "Occupancy" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">Occupancy Trend</h2>
            <MiniBarChart
              data={periods as unknown as Record<string, unknown>[]}
              valueKey="occupancy"
              labelKey="quarter"
              color="bg-green-500"
              formatValue={(v) => {
                const n = Number(v);
                return n <= 1 ? `${(n * 100).toFixed(1)}%` : `${n.toFixed(1)}%`;
              }}
            />
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">Current Property Data</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-bm-muted2">Static Occupancy</dt>
                <dd className="font-medium">{fmtPct(property.occupancy)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Units</dt>
                <dd className="font-medium">{fmtText(property.units)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Current NOI</dt>
                <dd className="font-medium">{fmtMoney(property.current_noi)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Square Feet</dt>
                <dd className="font-medium">{property.square_feet ? `${(Number(property.square_feet) / 1000).toFixed(0)}K SF` : "—"}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {/* ── DEBT TAB ── */}
      {tab === "Debt" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Debt</h2>
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-xs text-bm-muted2">Debt Balance</dt>
              <dd className="font-medium">{fmtMoney(financialState?.debt_balance)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">Debt Service</dt>
              <dd className="font-medium">{fmtMoney(financialState?.debt_service)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">LTV</dt>
              <dd className="font-medium">{fmtPct(financialState?.ltv)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">DSCR</dt>
              <dd className="font-medium">{fmtX(financialState?.dscr)}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-lg border border-bm-border/40 bg-bm-surface/10 p-3 text-sm text-bm-muted2">
            Loan-level details will populate here from the debt surveillance module.
          </div>
        </div>
      ) : null}

      {/* ── VALUATION TAB ── */}
      {tab === "Valuation" ? (
        <div className="space-y-4">
          {/* Current snapshot summary */}
          {financialState ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">
                Current Snapshot · {financialState.quarter}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><dt className="text-xs text-bm-muted2">Gross Value</dt><dd className="font-medium">{fmtMoney(financialState.asset_value)}</dd></div>
                <div><dt className="text-xs text-bm-muted2">NAV</dt><dd className="font-medium">{fmtMoney(financialState.nav)}</dd></div>
                <div><dt className="text-xs text-bm-muted2">Method</dt><dd className="font-medium">{fmtText(financialState.valuation_method)}</dd></div>
                <div><dt className="text-xs text-bm-muted2">NOI (Qtr)</dt><dd className="font-medium">{fmtMoney(financialState.noi)}</dd></div>
              </div>
            </div>
          ) : null}

          {/* Value Trend */}
          {periods.length > 0 ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-2">Value Trend</h3>
              <MiniBarChart
                data={periods as unknown as Record<string, unknown>[]}
                valueKey="asset_value"
                labelKey="quarter"
                color="bg-purple-500"
              />
            </div>
          ) : null}

          {/* Interactive lever panel */}
          <ValuationLeverPanel
            assetId={asset.asset_id}
            quarter={quarter}
            propertyType={property.property_type}
            scenarios={scenarios.map((s) => ({ id: s.scenario_id, name: s.name }))}
          />
        </div>
      ) : null}

      {tab === "Sustainability" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Sustainability Module</h2>
            {isPropertyAsset ? (
              <>
                <p className="mt-2 text-sm text-bm-muted2">
                  This property is eligible for asset-level utility, emissions, certification, and regulatory analytics inside the shared sustainability workspace.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={sustainabilityHref}
                    className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90"
                  >
                    Open Asset Sustainability
                  </Link>
                  <Link
                    href={`${base}/sustainability?section=regulatory-risk&fundId=${fund.fund_id}&investmentId=${investment.investment_id}&assetId=${asset.asset_id}`}
                    className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
                  >
                    Review Regulatory Risk
                  </Link>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-bm-muted2">
                Not applicable. Debt and CMBS assets do not participate in property-level sustainability calculations.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Current Context</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-bm-muted2">Asset Type</dt>
                <dd className="font-medium">{asset.asset_type}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Property Type</dt>
                <dd className="font-medium">{fmtText(property.property_type)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Square Feet</dt>
                <dd className="font-medium">{property.square_feet ? `${Number(property.square_feet).toLocaleString()} SF` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-bm-muted2">Quarter</dt>
                <dd className="font-medium">{quarter}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {/* ── DOCUMENTS TAB ── */}
      {tab === "Documents" ? (
        businessId && environmentId ? (
          <RepeEntityDocuments
            businessId={businessId}
            envId={environmentId}
            entityType="asset"
            entityId={asset.asset_id}
          />
        ) : (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
            Environment context is required to load documents.
          </div>
        )
      ) : null}

      {/* ── ACCOUNTING TAB ── */}
      {tab === "Accounting" ? (
        <div className="space-y-4">
          {acctLoading ? (
            <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">
              Loading accounting data for {quarter}...
            </div>
          ) : (
            <>
              {/* Trial Balance */}
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">
                  Trial Balance · {quarter}
                </h2>
                {trialBalance.length === 0 ? (
                  <p className="text-sm text-bm-muted2">No trial balance data for this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                        <th className="px-3 py-2 text-left font-medium">Account</th>
                        <th className="px-3 py-2 text-left font-medium">Name</th>
                        <th className="px-3 py-2 text-left font-medium">Category</th>
                        <th className="px-3 py-2 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bm-border/40">
                      {trialBalance.map((row, i) => (
                        <tr key={i} className="hover:bg-bm-surface/20">
                          <td className="px-3 py-2 font-mono text-xs">{row.account_code}</td>
                          <td className="px-3 py-2">{row.account_name}</td>
                          <td className="px-3 py-2 text-bm-muted2">{row.category}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmtMoney(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* P&L */}
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">
                  P&L by Category · {quarter}
                </h2>
                {pnl.length === 0 ? (
                  <p className="text-sm text-bm-muted2">No P&L data for this period.</p>
                ) : (
                  <MiniBarChart
                    data={pnl as unknown as Record<string, unknown>[]}
                    valueKey="amount"
                    labelKey="line_code"
                    color="bg-emerald-500"
                  />
                )}
              </div>

              {/* Transactions */}
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">
                  Transactions · {quarter}
                </h2>
                {transactions.length === 0 ? (
                  <p className="text-sm text-bm-muted2">No transactions for this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                          <th className="px-3 py-2 text-left font-medium">Period</th>
                          <th className="px-3 py-2 text-left font-medium">Account</th>
                          <th className="px-3 py-2 text-left font-medium">Name</th>
                          <th className="px-3 py-2 text-left font-medium">Category</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bm-border/40">
                        {transactions.map((tx, i) => (
                          <tr key={i} className="hover:bg-bm-surface/20">
                            <td className="px-3 py-2 text-bm-muted2">{String(tx.period_month).slice(0, 10)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{tx.gl_account}</td>
                            <td className="px-3 py-2">{tx.name}</td>
                            <td className="px-3 py-2 text-bm-muted2">{tx.category}</td>
                            <td className="px-3 py-2 text-right font-medium">{fmtMoney(tx.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* ── RUNS / AUDIT TAB ── */}
      {tab === "Runs / Audit" ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Runs & Audit Trail</h2>
          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
              <p className="font-medium">Asset Created</p>
              <p className="text-xs text-bm-muted2">{asset.created_at?.slice(0, 19).replace("T", " ") || "—"}</p>
            </div>
            {financialState ? (
              <>
                <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
                  <p className="font-medium">Latest Quarter State</p>
                  <p className="text-xs text-bm-muted2">Quarter: {financialState.quarter} · Run: {financialState.run_id?.slice(0, 8) || "—"}</p>
                  <p className="text-xs text-bm-muted2">Inputs Hash: {financialState.inputs_hash || "—"}</p>
                </div>
                <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
                  <p className="font-medium">Quarter State Count</p>
                  <p className="text-xs text-bm-muted2">{periods.length} quarters with data</p>
                </div>
              </>
            ) : null}
            <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
              <p className="font-medium">Accounting Records</p>
              <p className="text-xs text-bm-muted2">
                Trial Balance: {trialBalance.length} accounts · P&L: {pnl.length} line codes · Transactions: {transactions.length} entries
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── REPORT GENERATION MODAL ── */}
      {reportModalOpen ? (
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

            {reportResult ? (
              <p className="mt-3 text-sm text-bm-muted2">{reportResult}</p>
            ) : null}

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

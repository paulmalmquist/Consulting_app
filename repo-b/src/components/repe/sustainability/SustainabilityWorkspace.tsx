"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createReV2AssetCertification,
  createReV2AssetRegulatoryExposure,
  createReV2AssetUtilityAccount,
  getReV2AssetSustainabilityDashboard,
  getReV2FundPortfolioFootprint,
  getReV2InvestmentFootprint,
  getReV2SustainabilityOverview,
  getReV2SustainabilityProjection,
  getReV2SustainabilityReport,
  importReV2UtilityMonthly,
  listReV1Funds,
  listReV2AssetCertifications,
  listReV2AssetRegulatoryExposure,
  listReV2AssetUtilityAccounts,
  runReV2SustainabilityScenario,
  type SusAssetDashboardResponse,
  type SusCertification,
  type SusOverviewResponse,
  type SusPortfolioFootprintResponse,
  type SusProjectionResponse,
  type SusRegulatoryExposure,
  type SusReportPayload,
  type SusUtilityAccount,
  type SusUtilityImportResult,
} from "@/lib/bos-api";
import { useRepeBasePath, useRepeContext } from "@/lib/repe-context";
import { DataQualityBadge } from "@/components/repe/sustainability/DataQualityBadge";
import { RegulatoryRiskBadge } from "@/components/repe/sustainability/RegulatoryRiskBadge";

import {
  fmtMoney as _fmtMoney,
  fmtNumber as _fmtNumber,
  fmtPct as _fmtPct,
} from '@/lib/format-utils';

function fmtNumber(value: unknown, digits = 1): string {
  return _fmtNumber(value as number | string | null | undefined, digits);
}

function fmtMoney(value: unknown): string {
  return _fmtMoney(value as number | string | null | undefined);
}

function fmtPct(value: unknown): string {
  return _fmtPct(value as number | string | null | undefined);
}

const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "portfolio-footprint", label: "Portfolio Footprint" },
  { key: "asset-sustainability", label: "Asset Sustainability" },
  { key: "utility-bills", label: "Utility Bills" },
  { key: "certifications", label: "Certifications" },
  { key: "regulatory-risk", label: "Regulatory Risk" },
  { key: "decarbonization-scenarios", label: "Decarbonization Scenarios" },
  { key: "reporting-exports", label: "Reporting & Exports" },
] as const;

const REPORT_KEYS = [
  { key: "gresb", label: "GRESB-aligned" },
  { key: "lp_esg_summary", label: "LP ESG Summary" },
  { key: "sfdr_annex_ii", label: "SFDR Annex II" },
  { key: "tcfd_summary", label: "TCFD Risk Summary" },
  { key: "carbon_disclosure", label: "Carbon Disclosure" },
  { key: "quarterly_lp_section", label: "Quarterly LP Section" },
] as const;

function currentQuarter(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}Q${Math.ceil((now.getUTCMonth() + 1) / 3)}`;
}

function currentYear(): number {
  return new Date().getUTCFullYear();
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach((key) => acc.add(key));
      return acc;
    }, new Set())
  );
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const raw = row[header];
          const cell = raw === null || raw === undefined ? "" : String(raw).replace(/"/g, '""');
          return `"${cell}"`;
        })
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SustainabilityWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();

  const section = searchParams.get("section") || "overview";
  const fundId = searchParams.get("fundId") || "";
  const investmentId = searchParams.get("investmentId") || "";
  const assetId = searchParams.get("assetId") || "";
  const scenarioId = searchParams.get("scenarioId") || "";
  const quarter = searchParams.get("quarter") || currentQuarter();
  const year = Number(searchParams.get("year") || currentYear());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<SusOverviewResponse | null>(null);
  const [footprint, setFootprint] = useState<SusPortfolioFootprintResponse | null>(null);
  const [assetDashboard, setAssetDashboard] = useState<SusAssetDashboardResponse | null>(null);
  const [utilityAccounts, setUtilityAccounts] = useState<SusUtilityAccount[]>([]);
  const [certifications, setCertifications] = useState<SusCertification[]>([]);
  const [regulatoryRows, setRegulatoryRows] = useState<SusRegulatoryExposure[]>([]);
  const [importResult, setImportResult] = useState<SusUtilityImportResult | null>(null);
  const [projection, setProjection] = useState<SusProjectionResponse | null>(null);
  const [report, setReport] = useState<SusReportPayload | null>(null);
  const [reportKey, setReportKey] = useState<string>("gresb");
  const [funds, setFunds] = useState<{ fund_id: string; name: string }[]>([]);

  const [utilityForm, setUtilityForm] = useState({
    provider_name: "Utility Demo",
    account_number: "NEW-ACCOUNT",
    utility_type: "electric",
  });
  const [importForm, setImportForm] = useState({
    filename: "utility_upload.csv",
    csv_text: "asset_id,utility_type,year,month,usage_kwh,cost_total\n",
  });
  const [certForm, setCertForm] = useState({
    certification_type: "ENERGY_STAR",
    level: "",
    score: "80",
  });
  const [regForm, setRegForm] = useState({
    regulation_name: "NYC Local Law 97",
    compliance_status: "monitor",
    target_year: String(year),
  });
  const [scenarioForm, setScenarioForm] = useState({
    scenario_id: scenarioId,
    base_quarter: quarter,
    horizon_years: "5",
    projection_mode: "carbon_tax",
  });
  const latestProjectionFundRow =
    projection && projection.fund_rows.length > 0
      ? projection.fund_rows[projection.fund_rows.length - 1]
      : null;

  function setQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    });
    router.push(`${basePath}/sustainability?${params.toString()}`);
  }

  // Load available funds and auto-select the first if none is chosen
  useEffect(() => {
    if (!environmentId) return;
    listReV1Funds({ env_id: environmentId }).then((rows) => {
      const mapped = rows.map((f: { fund_id: string; name: string }) => ({ fund_id: f.fund_id, name: f.name }));
      setFunds(mapped);
      if (!fundId && mapped.length > 0) {
        setQuery({ fundId: mapped[0].fund_id });
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environmentId]);

  useEffect(() => {
    if (!environmentId || !businessId) return;
    const scopedEnvironmentId = environmentId;
    const scopedBusinessId = businessId;
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const overviewData = await getReV2SustainabilityOverview({
          env_id: scopedEnvironmentId,
          business_id: scopedBusinessId,
          quarter,
          scenario_id: scenarioId || undefined,
        });
        if (cancelled) return;
        setOverview(overviewData);

        if (section === "portfolio-footprint" && fundId) {
          const data = await getReV2FundPortfolioFootprint(fundId, {
            year: String(year),
            scenario_id: scenarioId || undefined,
          });
          if (!cancelled) setFootprint(data);
        } else if (section === "portfolio-footprint" && investmentId) {
          const data = await getReV2InvestmentFootprint(investmentId, {
            year: String(year),
            scenario_id: scenarioId || undefined,
          });
          if (!cancelled) setFootprint(data);
        } else if (!cancelled) {
          setFootprint(null);
        }

        if ((section === "asset-sustainability" || section === "utility-bills") && assetId) {
          const data = await getReV2AssetSustainabilityDashboard(assetId, {
            year: String(year),
            scenario_id: scenarioId || undefined,
          });
          if (!cancelled) setAssetDashboard(data);
        }

        if (section === "utility-bills" && assetId) {
          const accounts = await listReV2AssetUtilityAccounts(assetId);
          if (!cancelled) setUtilityAccounts(accounts);
        }

        if (section === "certifications" && assetId) {
          const rows = await listReV2AssetCertifications(assetId);
          if (!cancelled) setCertifications(rows);
        }

        if (section === "regulatory-risk" && assetId) {
          const rows = await listReV2AssetRegulatoryExposure(assetId);
          if (!cancelled) setRegulatoryRows(rows);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load sustainability workspace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [assetId, businessId, environmentId, fundId, investmentId, quarter, scenarioId, section, year]);

  async function handleAddUtilityAccount() {
    if (!assetId || !environmentId || !businessId) return;
    setError(null);
    try {
      const row = await createReV2AssetUtilityAccount(assetId, {
        env_id: environmentId,
        business_id: businessId,
        utility_type: utilityForm.utility_type as "electric" | "gas" | "water" | "steam" | "district",
        provider_name: utilityForm.provider_name,
        account_number: utilityForm.account_number,
      });
      setUtilityAccounts((prev) => [row, ...prev]);
      setUtilityForm((prev) => ({ ...prev, account_number: `${prev.account_number}-1` }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create utility account");
    }
  }

  async function handleImportUtilityCsv() {
    if (!environmentId || !businessId) return;
    setError(null);
    try {
      const result = await importReV2UtilityMonthly({
        env_id: environmentId,
        business_id: businessId,
        filename: importForm.filename,
        csv_text: importForm.csv_text,
        import_mode: "manual",
        created_by: "ui",
      });
      setImportResult(result);
      if (assetId) {
        const refreshed = await getReV2AssetSustainabilityDashboard(assetId, { year: String(year) });
        setAssetDashboard(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import utility CSV");
    }
  }

  async function handleCsvFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const csvText = await file.text();
      setImportForm({
        filename: file.name,
        csv_text: csvText,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read CSV file");
    } finally {
      event.target.value = "";
    }
  }

  async function handleAddCertification() {
    if (!assetId || !environmentId || !businessId) return;
    setError(null);
    try {
      const row = await createReV2AssetCertification(assetId, {
        env_id: environmentId,
        business_id: businessId,
        certification_type: certForm.certification_type,
        level: certForm.level || undefined,
        score: certForm.score ? Number(certForm.score) : undefined,
        status: "active",
      });
      setCertifications((prev) => [row, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add certification");
    }
  }

  async function handleAddRegulatoryExposure() {
    if (!assetId || !environmentId || !businessId) return;
    setError(null);
    try {
      const row = await createReV2AssetRegulatoryExposure(assetId, {
        env_id: environmentId,
        business_id: businessId,
        regulation_name: regForm.regulation_name,
        compliance_status: regForm.compliance_status as "compliant" | "monitor" | "at_risk" | "non_compliant" | "not_applicable",
        target_year: Number(regForm.target_year),
      });
      setRegulatoryRows((prev) => [row, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add regulatory exposure");
    }
  }

  async function handleRunScenario() {
    if (!fundId || !scenarioForm.scenario_id) {
      setError("Fund ID and scenario ID are required.");
      return;
    }
    setError(null);
    try {
      const run = await runReV2SustainabilityScenario({
        fund_id: fundId,
        scenario_id: scenarioForm.scenario_id,
        base_quarter: scenarioForm.base_quarter,
        horizon_years: Number(scenarioForm.horizon_years),
        projection_mode: scenarioForm.projection_mode as "base" | "carbon_tax" | "utility_shock" | "retrofit" | "solar" | "custom",
      });
      const detail = await getReV2SustainabilityProjection(run.projection_run_id);
      setProjection(detail);
      setQuery({ scenarioId: scenarioForm.scenario_id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run decarbonization scenario");
    }
  }

  async function handleLoadReport() {
    if (!fundId) {
      setError("Select a fund first.");
      return;
    }
    setError(null);
    try {
      const payload = await getReV2SustainabilityReport(fundId, reportKey, {
        scenario_id: scenarioId || undefined,
      });
      setReport(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    }
  }

  if (!businessId || !environmentId) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
        Sustainability requires an active REPE environment and business context.
      </div>
    );
  }

  return (
    <section className="space-y-4" data-testid="re-sustainability-workspace">
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Sustainability</p>
            <h1 className="mt-1 text-2xl font-display font-semibold tracking-tight">Institutional Sustainability Workspace</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              Fund-, investment-, asset-, and scenario-aware ESG analytics for the current REPE environment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={() => overview && downloadJson("sustainability-overview.json", overview)}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Export JSON
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px,1fr]">
        <aside className="rounded-xl border border-bm-border/70 bg-bm-bg p-3 h-fit">
          <nav className="space-y-1.5" data-testid="sus-left-nav">
            {SECTIONS.map((item) => {
              const active = section === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setQuery({ section: item.key })}
                  className={`block w-full rounded-lg border px-3 py-2.5 text-left text-sm ${
                    active
                      ? "border-transparent border-l-2 border-l-bm-accent bg-bm-surface/30 text-bm-text"
                      : "border-transparent text-bm-muted hover:bg-bm-surface/30 hover:text-bm-text"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center">
              <h3 className="text-lg font-semibold text-bm-text">Sustainability Module</h3>
              <p className="mt-2 text-sm text-bm-muted2">
                The Sustainability module is being configured for this environment.
                Portfolio footprint, utility tracking, and ESG reporting will appear here once provisioned.
              </p>
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
              Loading sustainability data...
            </div>
          ) : null}

          {section === "overview" && overview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Energy</p>
                  <p className="mt-1 text-xl font-semibold">{fmtNumber(overview.top_cards.total_annual_energy_kwh_equiv, 0)}</p>
                </div>
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Emissions</p>
                  <p className="mt-1 text-xl font-semibold">{fmtNumber(overview.top_cards.total_emissions_tons, 1)}</p>
                </div>
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Intensity / SF</p>
                  <p className="mt-1 text-xl font-semibold">{fmtNumber(overview.top_cards.emissions_intensity_per_sf, 4)}</p>
                </div>
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Utility Cost</p>
                  <p className="mt-1 text-xl font-semibold">{fmtMoney(overview.top_cards.total_utility_cost)}</p>
                </div>
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Renewable</p>
                  <p className="mt-1 text-xl font-semibold">{fmtPct(overview.top_cards.renewable_pct)}</p>
                </div>
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Open Issues</p>
                  <p className="mt-1 text-xl font-semibold">{overview.open_issues}</p>
                </div>
              </div>
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-bm-muted2">Use the workspace selectors above, or deep-link from a fund, investment, or asset page.</p>
                  <span className="text-xs text-bm-muted2">
                    Last Calculated: {overview.audit_timestamp ? new Date(overview.audit_timestamp).toLocaleString() : "—"}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {section === "portfolio-footprint" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
                {fundId || investmentId ? (
                  <p>
                    Showing footprint for {fundId ? `fund ${fundId}` : `investment ${investmentId}`} in {year}.
                  </p>
                ) : (
                  <p>Select a fund or investment using the selector above or a deep link.</p>
                )}
              </div>
              {footprint ? (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Total Emissions</p>
                      <p className="mt-1 text-lg font-semibold">{fmtNumber(footprint.summary.total_emissions, 1)}</p>
                    </div>
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Intensity / SF</p>
                      <p className="mt-1 text-lg font-semibold">{fmtNumber(footprint.summary.emissions_intensity_per_sf, 4)}</p>
                    </div>
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Utility Cost</p>
                      <p className="mt-1 text-lg font-semibold">{fmtMoney(footprint.summary.total_utility_cost)}</p>
                    </div>
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Renewable</p>
                      <p className="mt-1 text-lg font-semibold">{fmtPct(footprint.summary.renewable_pct)}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-bm-border/70 overflow-hidden">
                    <div className="border-b border-bm-border/70 bg-bm-surface/20 px-4 py-3">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Asset Ranking</h2>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-bm-border/50 bg-bm-surface/10 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                          <th className="px-4 py-3">Asset</th>
                          <th className="px-4 py-3 text-right">Emissions</th>
                          <th className="px-4 py-3 text-right">Intensity</th>
                          <th className="px-4 py-3 text-right">Utility Cost</th>
                          <th className="px-4 py-3">Risk</th>
                          <th className="px-4 py-3">Quality</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bm-border/40">
                        {footprint.asset_rows.map((row, index) => (
                          <tr key={`${String(row.asset_id)}-${index}`} className="hover:bg-bm-surface/20">
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setQuery({ assetId: String(row.asset_id), section: "asset-sustainability" })}
                                className="text-left text-bm-accent hover:underline"
                              >
                                {String(row.asset_name || row.asset_id)}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right">{fmtNumber(row.total_emissions, 1)}</td>
                            <td className="px-4 py-3 text-right">{fmtNumber(row.emissions_intensity_per_sf, 4)}</td>
                            <td className="px-4 py-3 text-right">{fmtMoney(row.utility_cost_total)}</td>
                            <td className="px-4 py-3"><RegulatoryRiskBadge status={String(row.compliance_status || "monitor")} /></td>
                            <td className="px-4 py-3"><DataQualityBadge status={String(row.data_quality_status || "review")} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {section === "asset-sustainability" && (
            <div className="space-y-4">
              {!assetId ? (
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
                  Select an asset using the selector above or an asset detail deep link.
                </div>
              ) : null}
              {assetDashboard ? (
                <>
                  {assetDashboard.not_applicable ? (
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
                      {assetDashboard.reason}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <DataQualityBadge status={String(assetDashboard.cards.data_quality_status || "review")} />
                        <span className="text-xs text-bm-muted2">
                          Last Calculated: {assetDashboard.audit_timestamp ? new Date(assetDashboard.audit_timestamp).toLocaleString() : "—"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Energy</p><p className="mt-1 text-lg font-semibold">{fmtNumber(assetDashboard.cards.total_annual_energy_kwh_equiv, 0)}</p></div>
                        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Emissions</p><p className="mt-1 text-lg font-semibold">{fmtNumber(assetDashboard.cards.total_emissions_tons, 1)}</p></div>
                        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Intensity / SF</p><p className="mt-1 text-lg font-semibold">{fmtNumber(assetDashboard.cards.emissions_intensity_per_sf, 4)}</p></div>
                        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Energy Cost / SF</p><p className="mt-1 text-lg font-semibold">{fmtMoney(assetDashboard.cards.energy_cost_per_sf)}</p></div>
                        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Renewable</p><p className="mt-1 text-lg font-semibold">{fmtPct(assetDashboard.cards.renewable_pct)}</p></div>
                        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">ENERGY STAR</p><p className="mt-1 text-lg font-semibold">{fmtNumber(assetDashboard.cards.energy_star_score, 0)}</p></div>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 lg:col-span-2">
                          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Monthly Energy Trend</h2>
                          <div className="mt-4 space-y-2">
                            {Array.isArray(assetDashboard.trends.monthly_energy) && assetDashboard.trends.monthly_energy.length > 0 ? (
                              (assetDashboard.trends.monthly_energy as Array<Record<string, unknown>>).slice(-12).map((row) => (
                                <div key={String(row.period)} className="flex items-center gap-3 text-xs">
                                  <span className="w-20 text-bm-muted2">{String(row.period)}</span>
                                  <div className="h-3 flex-1 rounded bg-bm-surface/40 overflow-hidden">
                                    <div
                                      className="h-full rounded bg-emerald-500"
                                      style={{ width: `${Math.min((Number(row.value || 0) / 250000) * 100, 100)}%` }}
                                    />
                                  </div>
                                  <span className="w-20 text-right font-medium">{fmtNumber(row.value, 0)}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-bm-muted2">No monthly energy history is available.</p>
                            )}
                          </div>
                        </div>
                        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Open Issues</h2>
                          <div className="mt-3 space-y-2">
                            {assetDashboard.issues.length === 0 ? <p className="text-sm text-bm-muted2">No open issues.</p> : null}
                            {assetDashboard.issues.map((row, index) => (
                              <div key={index} className="rounded-lg border border-bm-border/60 p-3">
                                <p className="text-xs font-medium">{String(row.issue_code || "issue")}</p>
                                <p className="mt-1 text-xs text-bm-muted2">{String(row.message || "")}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : null}
            </div>
          )}

          {section === "utility-bills" && (
            <div className="space-y-4">
              {!assetId ? (
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
                  Select a property asset to manage utility bills.
                </div>
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Utility Accounts</h2>
                      <div className="mt-3 space-y-2">
                        {utilityAccounts.length === 0 ? <p className="text-sm text-bm-muted2">No utility accounts yet.</p> : null}
                        {utilityAccounts.map((row) => (
                          <div key={row.utility_account_id} className="rounded-lg border border-bm-border/60 p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{row.provider_name}</span>
                              <span className="text-xs text-bm-muted2 uppercase">{row.utility_type}</span>
                            </div>
                            <p className="mt-1 text-xs text-bm-muted2">{row.account_number}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                        <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={utilityForm.provider_name} onChange={(e) => setUtilityForm((prev) => ({ ...prev, provider_name: e.target.value }))} placeholder="Provider" />
                        <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={utilityForm.account_number} onChange={(e) => setUtilityForm((prev) => ({ ...prev, account_number: e.target.value }))} placeholder="Account #" />
                        <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={utilityForm.utility_type} onChange={(e) => setUtilityForm((prev) => ({ ...prev, utility_type: e.target.value }))}>
                          <option value="electric">Electric</option>
                          <option value="gas">Gas</option>
                          <option value="water">Water</option>
                          <option value="steam">Steam</option>
                          <option value="district">District</option>
                        </select>
                      </div>
                      <button type="button" onClick={() => void handleAddUtilityAccount()} className="mt-3 rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90">
                        Add Utility Account
                      </button>
                    </div>

                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Manual CSV Upload</h2>
                      <div className="mt-3 space-y-2">
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(event) => void handleCsvFileSelect(event)}
                          className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-bm-accent/15 file:px-3 file:py-1.5 file:text-sm file:text-bm-text"
                        />
                        <input className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={importForm.filename} onChange={(e) => setImportForm((prev) => ({ ...prev, filename: e.target.value }))} />
                        <textarea className="min-h-[180px] w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-xs font-mono" value={importForm.csv_text} onChange={(e) => setImportForm((prev) => ({ ...prev, csv_text: e.target.value }))} />
                        <button type="button" onClick={() => void handleImportUtilityCsv()} className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90">
                          Import Utility CSV
                        </button>
                        {importResult ? (
                          <div className="rounded-lg border border-bm-border/60 p-3 text-xs text-bm-muted2">
                            {importResult.rows_written} written / {importResult.rows_blocked} blocked · {importResult.status}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {assetDashboard?.utility_rows ? (
                    <div className="rounded-xl border border-bm-border/70 overflow-hidden">
                      <div className="border-b border-bm-border/70 bg-bm-surface/20 px-4 py-3">
                        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Utility Bill Drill-Down</h2>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-bm-border/50 bg-bm-surface/10 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                            <th className="px-4 py-3">Period</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3 text-right">Usage</th>
                            <th className="px-4 py-3 text-right">Cost</th>
                            <th className="px-4 py-3 text-right">Peak</th>
                            <th className="px-4 py-3">Quality</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bm-border/40">
                          {assetDashboard.utility_rows.map((row, index) => (
                            <tr key={`${String(row.utility_monthly_id || index)}-${index}`}>
                              <td className="px-4 py-3">{String(row.year)}-{String(row.month).padStart(2, "0")}</td>
                              <td className="px-4 py-3 uppercase text-bm-muted2">{String(row.utility_type || "—")}</td>
                              <td className="px-4 py-3 text-right">{fmtNumber(row.usage_kwh_equiv, 0)}</td>
                              <td className="px-4 py-3 text-right">{fmtMoney(row.cost_total)}</td>
                              <td className="px-4 py-3 text-right">{fmtNumber(row.peak_kw, 0)}</td>
                              <td className="px-4 py-3"><DataQualityBadge status={String(row.quality_status || "review")} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          {section === "certifications" && (
            <div className="space-y-4">
              {!assetId ? (
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
                  Select a property asset to manage certifications.
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Active Certifications</h2>
                    <div className="mt-3 space-y-2">
                      {certifications.length === 0 ? <p className="text-sm text-bm-muted2">No certifications recorded.</p> : null}
                      {certifications.map((row) => (
                        <div key={row.asset_certification_id} className="rounded-lg border border-bm-border/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{row.certification_type}</span>
                            <span className="text-xs text-bm-muted2">{row.status}</span>
                          </div>
                          <p className="mt-1 text-xs text-bm-muted2">{row.level || "No level"} · Score {fmtNumber(row.score, 0)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Add Certification</h2>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={certForm.certification_type} onChange={(e) => setCertForm((prev) => ({ ...prev, certification_type: e.target.value }))} />
                      <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={certForm.level} onChange={(e) => setCertForm((prev) => ({ ...prev, level: e.target.value }))} placeholder="Level" />
                      <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={certForm.score} onChange={(e) => setCertForm((prev) => ({ ...prev, score: e.target.value }))} placeholder="Score" />
                    </div>
                    <button type="button" onClick={() => void handleAddCertification()} className="mt-3 rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90">
                      Add Certification
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {section === "regulatory-risk" && (
            <div className="space-y-4">
              {!assetId ? (
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
                  Select a property asset to manage regulatory exposure.
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Regulatory Exposure</h2>
                    <div className="mt-3 space-y-2">
                      {regulatoryRows.length === 0 ? <p className="text-sm text-bm-muted2">No regulatory exposure records yet.</p> : null}
                      {regulatoryRows.map((row) => (
                        <div key={row.regulatory_exposure_id} className="rounded-lg border border-bm-border/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{row.regulation_name}</span>
                            <RegulatoryRiskBadge status={row.compliance_status} />
                          </div>
                          <p className="mt-1 text-xs text-bm-muted2">
                            Target {row.target_year || "—"} · Penalty {fmtMoney(row.estimated_penalty)} · Upgrade {fmtMoney(row.estimated_upgrade_cost)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Add Regulatory Risk</h2>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={regForm.regulation_name} onChange={(e) => setRegForm((prev) => ({ ...prev, regulation_name: e.target.value }))} />
                      <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={regForm.compliance_status} onChange={(e) => setRegForm((prev) => ({ ...prev, compliance_status: e.target.value }))}>
                        <option value="compliant">Compliant</option>
                        <option value="monitor">Monitor</option>
                        <option value="at_risk">At Risk</option>
                        <option value="non_compliant">Non Compliant</option>
                        <option value="not_applicable">Not Applicable</option>
                      </select>
                      <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={regForm.target_year} onChange={(e) => setRegForm((prev) => ({ ...prev, target_year: e.target.value }))} />
                    </div>
                    <button type="button" onClick={() => void handleAddRegulatoryExposure()} className="mt-3 rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90">
                      Add Regulatory Exposure
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {section === "decarbonization-scenarios" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Run Sustainability Scenario</h2>
                <p className="mt-2 text-sm text-bm-muted2">
                  Use a RE V2 scenario ID with `sus.*` overrides to project 5-year decarbonization impacts.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                  <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={fundId} onChange={(e) => setQuery({ fundId: e.target.value })} placeholder="Fund ID" />
                  <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={scenarioForm.scenario_id} onChange={(e) => setScenarioForm((prev) => ({ ...prev, scenario_id: e.target.value }))} placeholder="Scenario ID" />
                  <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={scenarioForm.base_quarter} onChange={(e) => setScenarioForm((prev) => ({ ...prev, base_quarter: e.target.value }))} placeholder="Base Quarter" />
                  <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={scenarioForm.projection_mode} onChange={(e) => setScenarioForm((prev) => ({ ...prev, projection_mode: e.target.value }))}>
                    <option value="carbon_tax">Carbon Tax</option>
                    <option value="utility_shock">Utility Shock</option>
                    <option value="retrofit">Retrofit</option>
                    <option value="solar">Solar</option>
                    <option value="base">Base</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <button type="button" onClick={() => void handleRunScenario()} className="mt-3 rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90">
                  Run 5-Year Projection
                </button>
              </div>

              {projection ? (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Projected Fund IRR</p><p className="mt-1 text-lg font-semibold">{fmtPct(latestProjectionFundRow?.projected_fund_irr)}</p></div>
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Projected LP Net IRR</p><p className="mt-1 text-lg font-semibold">{fmtPct(latestProjectionFundRow?.projected_lp_net_irr)}</p></div>
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Projected Carry</p><p className="mt-1 text-lg font-semibold">{fmtMoney(latestProjectionFundRow?.projected_carry)}</p></div>
                    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"><p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Projection Years</p><p className="mt-1 text-lg font-semibold">{projection.fund_rows.length}</p></div>
                  </div>
                  <div className="rounded-xl border border-bm-border/70 overflow-hidden">
                    <div className="border-b border-bm-border/70 bg-bm-surface/20 px-4 py-3">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">5-Year Fund Projection</h2>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-bm-border/50 bg-bm-surface/10 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                          <th className="px-4 py-3">Year</th>
                          <th className="px-4 py-3 text-right">NOI Delta</th>
                          <th className="px-4 py-3 text-right">Emissions</th>
                          <th className="px-4 py-3 text-right">Fund IRR</th>
                          <th className="px-4 py-3 text-right">LP Net IRR</th>
                          <th className="px-4 py-3 text-right">Carry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bm-border/40">
                        {projection.fund_rows.map((row, index) => (
                          <tr key={index}>
                            <td className="px-4 py-3">{String(row.projection_year)}</td>
                            <td className="px-4 py-3 text-right">{fmtMoney(row.noi_delta)}</td>
                            <td className="px-4 py-3 text-right">{fmtNumber(row.emissions_total, 1)}</td>
                            <td className="px-4 py-3 text-right">{fmtPct(row.projected_fund_irr)}</td>
                            <td className="px-4 py-3 text-right">{fmtPct(row.projected_lp_net_irr)}</td>
                            <td className="px-4 py-3 text-right">{fmtMoney(row.projected_carry)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {section === "reporting-exports" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">Institutional Reporting</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={fundId} onChange={(e) => setQuery({ fundId: e.target.value })}>
                    <option value="">Select a fund…</option>
                    {funds.map((f) => <option key={f.fund_id} value={f.fund_id}>{f.name}</option>)}
                  </select>
                  <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
                    {REPORT_KEYS.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
                  </select>
                  <button type="button" onClick={() => void handleLoadReport()} className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90">
                    Load Report
                  </button>
                  <button type="button" onClick={() => report && downloadJson(`${report.report_key}.json`, report)} className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40">
                    Export JSON
                  </button>
                  <button type="button" onClick={() => report && downloadCsv(`${report.report_key}.csv`, report.appendix_rows)} className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40">
                    Export CSV
                  </button>
                </div>
              </div>

              {report ? (
                <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5" data-testid="sus-report-view">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">{report.report_key}</p>
                      <h2 className="mt-1 text-xl font-semibold">{report.report_title}</h2>
                    </div>
                    <span className="text-xs text-bm-muted2">
                      Audit Timestamp: {report.generated_at ? new Date(report.generated_at).toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="mt-4 space-y-4">
                    {report.sections.map((row, index) => (
                      <section key={index} className="rounded-xl border border-bm-border/60 p-4">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">{String(row.title || row.key || `Section ${index + 1}`)}</h3>
                        <pre className="mt-3 overflow-auto rounded-lg bg-bm-bg/40 p-3 text-xs whitespace-pre-wrap">{JSON.stringify(row.body, null, 2)}</pre>
                      </section>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

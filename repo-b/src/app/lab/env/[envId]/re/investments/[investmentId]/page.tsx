"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  getReV2Investment,
  listReV2Jvs,
  getReV2InvestmentQuarterState,
  getReV2InvestmentAssets,
  getReV2InvestmentLineage,
  getRepeFund,
  listReV2Models,
  listReV2Scenarios,
  listReV2ScenarioVersions,
  ReV2Investment,
  ReV2Jv,
  ReV2InvestmentQuarterState,
  ReV2InvestmentAsset,
  ReV2EntityLineageResponse,
  RepeFundDetail,
  ReV2Model,
  ReV2Scenario,
  ReV2ScenarioVersion,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import NoiComparisonPanel from "@/components/repe/asset-cockpit/NoiComparisonPanel";
import { CHART_COLORS } from "@/components/charts/chart-theme";

/* ── helpers ── */

function pickQ(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n) || !n) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
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

function fmtX(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function fmtDate(v: string | undefined): string {
  return v ? v.slice(0, 10) : "—";
}

const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closing",
  operating: "Operating",
  exited: "Exited",
};

function holdPeriodLabel(acquisitionDate?: string): string {
  if (!acquisitionDate) return "—";
  const acquired = new Date(acquisitionDate);
  if (Number.isNaN(acquired.getTime())) return "—";
  const now = new Date();
  const months =
    (now.getUTCFullYear() - acquired.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - acquired.getUTCMonth());
  if (months <= 0) return "0 mo";
  if (months < 12) return `${months} mo`;
  return `${(months / 12).toFixed(1)} yrs`;
}

/* ── cockpit component ── */

function InvestmentCockpit({
  params,
}: {
  params: { envId: string; investmentId: string };
}) {
  const { businessId } = useReEnv();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Spine context from URL
  const selectedModelId = searchParams.get("modelId") || "";
  const selectedScenarioId = searchParams.get("scenarioId") || "";
  const selectedVersionId = searchParams.get("versionId") || "";

  // Core state
  const [inv, setInv] = useState<ReV2Investment | null>(null);
  const [fundDetail, setFundDetail] = useState<RepeFundDetail | null>(null);
  const [state, setState] = useState<ReV2InvestmentQuarterState | null>(null);
  const [assets, setAssets] = useState<ReV2InvestmentAsset[]>([]);
  const [jvs, setJvs] = useState<ReV2Jv[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  // Spine state
  const [models, setModels] = useState<ReV2Model[]>([]);
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [versions, setVersions] = useState<ReV2ScenarioVersion[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const quarter = pickQ();
  const base = `/lab/env/${params.envId}/re`;

  // URL param helper — cascade-clears children when a parent selector changes
  const setSpineParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (value) p.set(key, value);
      else p.delete(key);
      if (key === "modelId") {
        p.delete("scenarioId");
        p.delete("versionId");
      }
      if (key === "scenarioId") {
        p.delete("versionId");
      }
      router.replace(`?${p.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  // ── data load ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const investment = await getReV2Investment(params.investmentId);
        if (cancelled) return;
        setInv(investment);

        const results = await Promise.allSettled([
          listReV2Jvs(params.investmentId),
          getReV2InvestmentQuarterState(params.investmentId, quarter),
          getReV2InvestmentAssets(
            params.investmentId,
            quarter,
            selectedScenarioId || undefined,
          ),
          getReV2InvestmentLineage(params.investmentId, quarter),
          getRepeFund(investment.fund_id),
          listReV2Models(investment.fund_id),
          listReV2Scenarios(investment.fund_id),
        ]);
        if (cancelled) return;

        setJvs(results[0].status === "fulfilled" ? results[0].value : []);
        setState(results[1].status === "fulfilled" ? results[1].value : null);
        setAssets(results[2].status === "fulfilled" ? results[2].value : []);
        setLineage(results[3].status === "fulfilled" ? results[3].value : null);
        setFundDetail(
          results[4].status === "fulfilled" ? results[4].value : null,
        );
        setModels(results[5].status === "fulfilled" ? results[5].value : []);
        setScenarios(
          results[6].status === "fulfilled" ? results[6].value : [],
        );
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load investment",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.investmentId, quarter, selectedScenarioId]);

  // Load versions when a scenario is selected
  useEffect(() => {
    if (!selectedScenarioId) {
      setVersions([]);
      return;
    }
    listReV2ScenarioVersions(selectedScenarioId)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [selectedScenarioId]);

  // Scenarios filtered by selected model
  const filteredScenarios = useMemo(() => {
    if (!selectedModelId) return scenarios;
    return scenarios.filter((s) => s.model_id === selectedModelId);
  }, [scenarios, selectedModelId]);

  // ── computed metrics ──
  const totalNoi = useMemo(
    () => assets.reduce((sum, a) => sum + Number(a.noi ?? 0), 0),
    [assets],
  );
  const totalAssetValue = useMemo(
    () => assets.reduce((sum, a) => sum + Number(a.asset_value ?? 0), 0),
    [assets],
  );
  const totalDebt = useMemo(
    () => assets.reduce((sum, a) => sum + Number(a.debt_balance ?? 0), 0),
    [assets],
  );
  const totalInvestmentNav = useMemo(
    () => assets.reduce((sum, a) => sum + Number(a.nav ?? 0), 0),
    [assets],
  );
  const computedLtv = totalAssetValue ? totalDebt / totalAssetValue : null;
  const capRate =
    totalAssetValue && totalNoi ? (totalNoi * 4) / totalAssetValue : null;

  // Sector exposure (% of value by property_type)
  const sectorData = useMemo(() => {
    if (!assets.length) return [];
    const byType: Record<string, number> = {};
    let total = 0;
    for (const a of assets) {
      const type = a.property_type || a.asset_type || "Other";
      const val = Number(a.asset_value ?? 0);
      byType[type] = (byType[type] ?? 0) + val;
      total += val;
    }
    if (!total) return [];
    return Object.entries(byType)
      .map(([type, val]) => ({ type, value: val, pct: val / total }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  // Sustainability link
  const propertyAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          String(asset.asset_type || "").toLowerCase() === "property",
      ),
    [assets],
  );
  const sustainabilityHref = inv
    ? `${base}/sustainability?section=${propertyAssets[0] ? "asset-sustainability" : "portfolio-footprint"}&fundId=${inv.fund_id}&investmentId=${inv.investment_id}${propertyAssets[0] ? `&assetId=${propertyAssets[0].asset_id}` : ""}`
    : `${base}/sustainability`;

  // Build scenario-preserving query string for asset drill-through links
  const assetQs = selectedScenarioId
    ? `?scenarioId=${selectedScenarioId}`
    : "";

  const selectedScenarioName =
    scenarios.find((scenario) => scenario.scenario_id === selectedScenarioId)?.name ||
    undefined;

  // ── render ──
  if (loading)
    return (
      <div className="p-6 text-sm text-bm-muted2">Loading investment...</div>
    );
  if (error || !inv) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
        {error || "Investment not available"}
      </div>
    );
  }

  return (
    <section className="space-y-5" data-testid="re-investment-cockpit">
      {/* ── Band A: Identity + Model/Scenario/Version ── */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
              Investment
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              {inv.name}
            </h1>
            <p className="mt-1 text-sm text-bm-muted2">
              {inv.investment_type?.toUpperCase()} &middot;{" "}
              {STAGE_LABELS[inv.stage] || inv.stage}
              {fundDetail?.fund?.name ? ` \u00B7 ${fundDetail.fund.name}` : ""}
            </p>
            <p className="mt-1 text-xs text-bm-muted2">
              Acquisition: {fmtDate(inv.target_close_date)} &middot; Hold:{" "}
              {holdPeriodLabel(inv.target_close_date)} &middot; As of {quarter}
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
              onClick={() => setLineageOpen(true)}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Lineage
            </button>
            <Link
              href={`${base}/funds/${inv.fund_id}`}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Back to Fund
            </Link>
          </div>
        </div>

        {/* Model / Scenario / Version selectors */}
        {(models.length > 0 || scenarios.length > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-bm-border/40 pt-4">
            {models.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  Model
                </label>
                <select
                  value={selectedModelId}
                  onChange={(e) => setSpineParam("modelId", e.target.value)}
                  className="rounded-lg border border-bm-border/70 bg-bm-surface/30 px-3 py-1.5 text-sm"
                  data-testid="selector-model"
                >
                  <option value="">All Models</option>
                  {models.map((m) => (
                    <option key={m.model_id} value={m.model_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {scenarios.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  Scenario
                </label>
                <select
                  value={selectedScenarioId}
                  onChange={(e) =>
                    setSpineParam("scenarioId", e.target.value)
                  }
                  className="rounded-lg border border-bm-border/70 bg-bm-surface/30 px-3 py-1.5 text-sm"
                  data-testid="selector-scenario"
                >
                  <option value="">Default</option>
                  {filteredScenarios.map((s) => (
                    <option key={s.scenario_id} value={s.scenario_id}>
                      {s.name}
                      {s.is_base ? " (Base)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {versions.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  Version
                </label>
                <select
                  value={selectedVersionId}
                  onChange={(e) =>
                    setSpineParam("versionId", e.target.value)
                  }
                  className="rounded-lg border border-bm-border/70 bg-bm-surface/30 px-3 py-1.5 text-sm"
                  data-testid="selector-version"
                >
                  <option value="">Latest</option>
                  {versions.map((v) => (
                    <option key={v.version_id} value={v.version_id}>
                      v{v.version_number}
                      {v.label ? ` — ${v.label}` : ""}
                      {v.is_locked ? " (locked)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Band B: KPI Strip ── */}
      <KpiStrip
        kpis={[
          { label: "NAV", value: fmtMoney(state?.nav) },
          { label: "NOI", value: fmtMoney(totalNoi || null) },
          { label: "Gross Value", value: fmtMoney(state?.gross_asset_value) },
          { label: "Debt", value: fmtMoney(state?.debt_balance ?? (totalDebt || null)) },
          { label: "LTV", value: fmtPct(computedLtv) },
          { label: "IRR", value: fmtPct(state?.net_irr ?? state?.gross_irr) },
          { label: "MOIC", value: fmtX(state?.equity_multiple) },
          { label: "Assets", value: String(assets.length) },
        ]}
      />

      {/* ── Band C: Charts + Capital ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <NoiComparisonPanel
          entityType="investment"
          entityId={inv.investment_id}
          entityName={inv.name}
          actualNoiAnnual={Math.max(totalNoi * 4, Number(state?.nav ?? inv.invested_capital ?? 0) * 0.04)}
          assetValue={Math.max(totalAssetValue, Number(state?.gross_asset_value ?? 0), Number(state?.nav ?? 0))}
          loanBalance={Math.max(totalDebt, Number(state?.debt_balance ?? 0))}
          startDate={inv.target_close_date}
          selectedScenarioLabel={selectedScenarioName}
        />

        {/* Capital & Returns */}
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="mb-3 text-xs uppercase tracking-[0.12em] text-bm-muted2">
            Capital &amp; Returns
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Committed",
                value: fmtMoney(inv.committed_capital),
              },
              {
                label: "Invested",
                value: fmtMoney(inv.invested_capital),
              },
              {
                label: "Distributions",
                value: fmtMoney(inv.realized_distributions),
              },
              {
                label: "Fund NAV Contrib.",
                value: fmtMoney(state?.fund_nav_contribution ?? state?.nav),
              },
              { label: "Gross IRR", value: fmtPct(state?.gross_irr) },
              { label: "Net IRR", value: fmtPct(state?.net_irr) },
              { label: "MOIC", value: fmtX(state?.equity_multiple) },
              {
                label: "Cap Rate",
                value: capRate ? `${(capRate * 100).toFixed(2)}%` : "—",
              },
            ].map((d) => (
              <div
                key={d.label}
                className="rounded-lg border border-bm-border/60 p-3"
              >
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">
                  {d.label}
                </p>
                <p className="mt-1 font-medium">{d.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Band C2: Debt & Capital Stack ── */}
      {(totalDebt > 0 || computedLtv) && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="capital-stack">
          <h3 className="mb-3 text-xs uppercase tracking-[0.12em] text-bm-muted2">
            Debt &amp; Capital Stack
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Visual capital stack bar */}
            <div className="space-y-2">
              <div className="text-xs text-bm-muted2 uppercase tracking-wide">Capital Stack</div>
              <div className="h-8 w-full rounded-lg overflow-hidden flex" title={`Debt: ${fmtMoney(totalDebt)} | Equity: ${fmtMoney(totalAssetValue - totalDebt)}`}>
                {computedLtv != null && computedLtv > 0 && (
                  <div
                    className={`h-full flex items-center justify-center text-xs font-medium text-white ${
                      computedLtv > 0.70 ? "bg-red-500" : computedLtv > 0.60 ? "bg-amber-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${Math.min(computedLtv * 100, 100)}%` }}
                  >
                    Debt {(computedLtv * 100).toFixed(0)}%
                  </div>
                )}
                <div
                  className="h-full flex items-center justify-center text-xs font-medium text-white bg-green-600"
                  style={{ width: `${Math.max(100 - (computedLtv || 0) * 100, 0)}%` }}
                >
                  Equity {((1 - (computedLtv || 0)) * 100).toFixed(0)}%
                </div>
              </div>
              {/* LTV Gauge */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-bm-muted2">LTV</span>
                <div className="flex-1 h-3 rounded-full bg-bm-surface/30 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      (computedLtv || 0) > 0.70 ? "bg-red-500" : (computedLtv || 0) > 0.60 ? "bg-amber-500" : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min((computedLtv || 0) * 100, 100)}%` }}
                  />
                </div>
                <span className={`text-sm font-medium ${
                  (computedLtv || 0) > 0.70 ? "text-red-400" : (computedLtv || 0) > 0.60 ? "text-amber-400" : "text-green-400"
                }`}>
                  {computedLtv != null ? `${(computedLtv * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>
            {/* Debt metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Total Debt</p>
                <p className="mt-1 font-medium">{fmtMoney(totalDebt || null)}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Equity Value</p>
                <p className="mt-1 font-medium">{fmtMoney(totalAssetValue - totalDebt || null)}</p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">DSCR</p>
                <p className={`mt-1 font-medium ${
                  totalNoi && totalDebt ? ((totalNoi * 4) / (totalDebt * 0.05) < 1.25 ? "text-red-400" : "text-green-400") : ""
                }`}>
                  {totalNoi && totalDebt ? `${((totalNoi * 4) / (totalDebt * 0.05)).toFixed(2)}x` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-bm-muted2">Debt Yield</p>
                <p className="mt-1 font-medium">
                  {totalNoi && totalDebt ? `${((totalNoi * 4 / totalDebt) * 100).toFixed(1)}%` : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Band D: Sector Exposure ── */}
      {sectorData.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="mb-3 text-xs uppercase tracking-[0.12em] text-bm-muted2">
            Sector Exposure
          </h3>
          <div className="space-y-2">
            {sectorData.map((s) => (
              <div key={s.type} className="flex items-center gap-3">
                <span className="w-28 truncate text-sm">{s.type}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-full bg-bm-surface/30">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(s.pct * 100).toFixed(1)}%`,
                      backgroundColor: CHART_COLORS.noi,
                    }}
                  />
                </div>
                <span className="w-16 text-right text-sm text-bm-muted2">
                  {(s.pct * 100).toFixed(1)}%
                </span>
                <span className="w-20 text-right text-sm">
                  {fmtMoney(s.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Band E: Asset List with Contribution % ── */}
      <div className="overflow-hidden rounded-xl border border-bm-border/70">
        <div className="border-b border-bm-border/50 bg-bm-surface/30 px-4 py-3">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
            Assets ({assets.length})
          </h3>
        </div>
        {assets.length === 0 ? (
          <div className="bg-amber-500/10 p-4 text-sm text-amber-200">
            No assets linked to this investment.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 bg-bm-surface/20 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Structure</th>
                <th className="px-4 py-3 font-medium text-right">NOI</th>
                <th className="px-4 py-3 font-medium text-right">Value</th>
                <th className="px-4 py-3 font-medium text-right">NAV</th>
                <th className="px-4 py-3 font-medium text-right">% of NAV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {assets.map((asset) => {
                const assetNav = Number(asset.nav ?? 0);
                const pctOfNav = totalInvestmentNav ? assetNav / totalInvestmentNav : 0;
                return (
                  <tr
                    key={asset.asset_id}
                    data-testid={`investment-asset-row-${asset.asset_id}`}
                    className="hover:bg-bm-surface/20"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`${base}/assets/${asset.asset_id}${assetQs}`}
                        className="text-bm-accent hover:underline"
                      >
                        {asset.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-bm-muted2">
                      {asset.property_type || asset.asset_type}
                    </td>
                    <td className="px-4 py-3 text-bm-muted2">
                      {asset.jv_id ? "JV" : "Direct"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {fmtMoney(asset.noi)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {fmtMoney(asset.asset_value)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {fmtMoney(asset.nav)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {pctOfNav
                        ? `${(pctOfNav * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── JV Entities ── */}
      {jvs.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="mb-3 text-xs uppercase tracking-[0.12em] text-bm-muted2">
            JV Entities
          </h3>
          <div className="space-y-2">
            {jvs.map((jv) => (
              <div
                key={jv.jv_id}
                className="flex items-center justify-between rounded-lg border border-bm-border/60 px-3 py-2 text-sm"
              >
                <Link
                  href={`${base}/jv/${jv.jv_id}`}
                  className="font-medium text-bm-accent hover:underline"
                >
                  {jv.legal_name}
                </Link>
                <span className="text-bm-muted2">
                  {fmtPct(jv.ownership_percent)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Documents (collapsible) ── */}
      {businessId && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20">
          <button
            type="button"
            onClick={() => setDocsOpen(!docsOpen)}
            className="flex w-full items-center justify-between p-4"
          >
            <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
              Documents
            </h3>
            <span className="text-bm-muted2">{docsOpen ? "▲" : "▼"}</span>
          </button>
          {docsOpen && (
            <div className="border-t border-bm-border/40 p-4">
              <RepeEntityDocuments
                businessId={businessId}
                envId={params.envId}
                entityType="investment"
                entityId={inv.investment_id}
                title="Investment Documents"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Lineage Panel ── */}
      <EntityLineagePanel
        open={lineageOpen}
        onOpenChange={setLineageOpen}
        title={`Investment Lineage \u00B7 ${quarter}`}
        lineage={lineage}
      />
    </section>
  );
}

export default function InvestmentHomePage({
  params,
}: {
  params: { envId: string; investmentId: string };
}) {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-bm-muted2">
          Loading investment...
        </div>
      }
    >
      <InvestmentCockpit params={params} />
    </Suspense>
  );
}

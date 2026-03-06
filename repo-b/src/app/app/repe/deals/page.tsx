"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  listReV2InvestmentsFiltered,
  createReV2Investment,
  listReV1Funds,
  RepeFund,
  ReV2FundInvestmentRollupRow,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { KpiStrip } from "@/components/repe/asset-cockpit/KpiStrip";
import {
  RepeIndexScaffold,
  reIndexActionClass,
  reIndexControlLabelClass,
  reIndexInputClass,
  reIndexNumericCellClass,
  reIndexPrimaryCellClass,
  reIndexSecondaryCellClass,
  reIndexTableBodyClass,
  reIndexTableClass,
  reIndexTableHeadRowClass,
  reIndexTableRowClass,
  reIndexTableShellClass,
} from "@/components/repe/RepeIndexScaffold";

const STAGE_OPTIONS = [
  "sourcing",
  "underwriting",
  "ic",
  "closing",
  "operating",
  "exited",
] as const;

const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closing",
  operating: "Operating",
  exited: "Exited",
};

function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
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

function DataHealthDot({ missing }: { missing: number | undefined }) {
  if (missing == null) return <span className="text-bm-muted2">—</span>;
  if (missing === 0) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-400" title="All assets have data" />;
  if (missing <= 2) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" title={`${missing} asset(s) missing data`} />;
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" title={`${missing} assets missing data`} />;
}

function InvestmentCreateModal({
  open,
  onClose,
  funds,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  funds: RepeFund[];
  onCreated: () => void;
}) {
  const [fundId, setFundId] = useState(funds[0]?.fund_id || "");
  const [form, setForm] = useState({
    name: "",
    deal_type: "equity" as "equity" | "debt",
    stage: "sourcing" as string,
    sponsor: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && funds.length > 0 && !fundId) {
      setFundId(funds[0].fund_id);
    }
  }, [open, funds, fundId]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fundId) return;
    setSaving(true);
    setError(null);
    try {
      await createReV2Investment(fundId, {
        name: form.name,
        deal_type: form.deal_type,
        stage: form.stage,
        sponsor: form.sponsor || undefined,
      });
      setForm({ name: "", deal_type: "equity", stage: "sourcing", sponsor: "" });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create investment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-bm-border bg-bm-bg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">New Investment</h3>
          <button type="button" onClick={onClose} className="text-bm-muted2 hover:text-bm-text text-xl">&times;</button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Fund
            <select
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              required
            >
              {funds.map((f) => (
                <option key={f.fund_id} value={f.fund_id}>{f.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Investment Name
            <input
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              placeholder="Downtown JV"
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
              Type
              <select
                className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={form.deal_type}
                onChange={(e) => setForm((v) => ({ ...v, deal_type: e.target.value as "equity" | "debt" }))}
              >
                <option value="equity">Equity</option>
                <option value="debt">Debt</option>
              </select>
            </label>
            <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
              Stage
              <select
                className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={form.stage}
                onChange={(e) => setForm((v) => ({ ...v, stage: e.target.value }))}
              >
                {STAGE_OPTIONS.map((o) => (
                  <option key={o} value={o}>{STAGE_LABELS[o]}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Sponsor / Counterparty
            <input
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={form.sponsor}
              onChange={(e) => setForm((v) => ({ ...v, sponsor: e.target.value }))}
              placeholder="ABC Sponsor"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white disabled:opacity-50">
              {saving ? "Creating..." : "Create Investment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RepeInvestmentsPageContent() {
  const { businessId, environmentId, loading: ctxLoading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quarter = pickCurrentQuarter();

  const [rows, setRows] = useState<ReV2FundInvestmentRollupRow[]>([]);
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Filters from URL params
  const fundFilter = searchParams.get("fund") || "";
  const stageFilter = searchParams.get("stage") || "All";
  const typeFilter = searchParams.get("type") || "All";
  const sponsorFilter = searchParams.get("sponsor") || "";
  const searchQuery = searchParams.get("q") || "";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "All" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  // Load funds for filter dropdown
  useEffect(() => {
    if (!businessId && !environmentId) return;
    listReV1Funds({
      env_id: environmentId || undefined,
      business_id: businessId || undefined,
    }).then(setFunds).catch(() => {});
  }, [businessId, environmentId]);

  // Derive filter options from loaded data
  const availableStages = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.stage) set.add(r.stage); });
    return Array.from(set).sort();
  }, [rows]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.deal_type) set.add(r.deal_type); });
    return Array.from(set).sort();
  }, [rows]);

  const availableSponsors = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.sponsor) set.add(r.sponsor); });
    return Array.from(set).sort();
  }, [rows]);

  // Fetch investments with server-side filtering
  const fetchInvestments = useCallback(async () => {
    if (!environmentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listReV2InvestmentsFiltered({
        env_id: environmentId,
        fund_id: fundFilter || undefined,
        stage: stageFilter !== "All" ? stageFilter : undefined,
        type: typeFilter !== "All" ? typeFilter : undefined,
        sponsor: sponsorFilter || undefined,
        q: searchQuery || undefined,
        quarter,
      });
      setRows(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load investments");
    } finally {
      setLoading(false);
    }
  }, [environmentId, fundFilter, stageFilter, typeFilter, sponsorFilter, searchQuery, quarter]);

  useEffect(() => {
    fetchInvestments();
  }, [fetchInvestments]);

  // KPI aggregates from filtered data
  const totalInvestments = rows.length;
  const aggregateNav = rows.reduce((s, r) => s + Number(r.nav || 0), 0);
  const aggregateNoi = rows.reduce((s, r) => s + Number(r.total_noi || 0), 0);
  const totalValue = rows.reduce((s, r) => s + Number(r.total_asset_value || 0), 0);
  const avgWeightedOccupancy = totalValue > 0
    ? rows.reduce((s, r) => s + Number(r.weighted_occupancy || 0) * Number(r.total_asset_value || 0), 0) / totalValue
    : 0;

  const hasActiveFilters =
    fundFilter !== "" ||
    stageFilter !== "All" ||
    typeFilter !== "All" ||
    sponsorFilter !== "" ||
    searchQuery !== "";

  const clearFilters = () => {
    router.replace("?", { scroll: false });
  };

  if (!businessId) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-4 text-sm space-y-2">
        <p className="text-bm-muted2">{ctxLoading ? "Initializing RE workspace..." : "RE workspace not initialized."}</p>
        {contextError ? <p className="text-red-400">{contextError}</p> : null}
        {!ctxLoading ? (
          <button
            type="button"
            className="rounded-lg border border-bm-border px-3 py-2 hover:bg-bm-surface/40"
            onClick={() => void initializeWorkspace()}
          >
            Retry Context Setup
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <RepeIndexScaffold
      title="Investments"
      subtitle={`Portfolio investments across all funds · As of ${quarter}`}
      action={
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={reIndexActionClass}
          data-testid="btn-new-investment"
        >
          + New Investment
        </button>
      }
      metrics={
        <KpiStrip
          variant="band"
          kpis={[
            { label: "Total Investments", value: totalInvestments },
            { label: "Aggregate NAV", value: fmtMoney(aggregateNav) },
            { label: "Aggregate NOI", value: fmtMoney(aggregateNoi) },
            { label: "Avg Occupancy", value: fmtPct(avgWeightedOccupancy) },
          ]}
        />
      }
      controls={
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3 border-b border-bm-border/20 pb-5">
          <label className={reIndexControlLabelClass}>
            Fund
            <select
              className={`${reIndexInputClass} w-44`}
              value={fundFilter}
              onChange={(e) => setFilter("fund", e.target.value)}
              data-testid="filter-fund"
            >
              <option value="">All Funds</option>
              {funds.map((f) => (
                <option key={f.fund_id} value={f.fund_id}>{f.name}</option>
              ))}
            </select>
          </label>

          <label className={reIndexControlLabelClass}>
            Stage
            <select
              className={`${reIndexInputClass} w-32`}
              value={stageFilter}
              onChange={(e) => setFilter("stage", e.target.value)}
              data-testid="filter-stage"
            >
              <option value="All">All Stages</option>
              {availableStages.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s] || s}</option>
              ))}
            </select>
          </label>

          <label className={reIndexControlLabelClass}>
            Type
            <select
              className={`${reIndexInputClass} w-28`}
              value={typeFilter}
              onChange={(e) => setFilter("type", e.target.value)}
              data-testid="filter-type"
            >
              <option value="All">All Types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </label>

          <label className={reIndexControlLabelClass}>
            Sponsor
            <select
              className={`${reIndexInputClass} w-40`}
              value={sponsorFilter}
              onChange={(e) => setFilter("sponsor", e.target.value)}
              data-testid="filter-sponsor"
            >
              <option value="">All Sponsors</option>
              {availableSponsors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className={reIndexControlLabelClass}>
            Search
            <input
              className={`${reIndexInputClass} w-48`}
              value={searchQuery}
              onChange={(e) => setFilter("q", e.target.value)}
              placeholder="Name, sponsor..."
              data-testid="filter-search"
            />
          </label>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-10 items-center rounded-md border border-bm-border/70 px-3 text-[11px] uppercase tracking-[0.12em] text-bm-muted2 transition-colors duration-100 hover:bg-bm-surface/25 hover:text-bm-text"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      }
      className="w-full"
    >
      <section data-testid="re-investments-list">
        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">
            Loading investments...
          </div>
        ) : (
          <div className={reIndexTableShellClass}>
            <table className={`${reIndexTableClass} min-w-[1240px]`}>
              <thead>
                <tr className={reIndexTableHeadRowClass}>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Fund</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Stage</th>
                  <th className="px-3 py-3 text-right font-medium">Assets</th>
                  <th className="px-3 py-3 font-medium">Market</th>
                  <th className="px-3 py-3 text-right font-medium">NAV</th>
                  <th className="px-3 py-3 text-right font-medium">NOI</th>
                  <th className="px-3 py-3 text-right font-medium">Occ</th>
                  <th className="px-3 py-3 text-right font-medium">LTV</th>
                  <th className="px-3 py-3 text-right font-medium">DSCR</th>
                  <th className="px-3 py-3 text-right font-medium">Value</th>
                  <th className="px-3 py-3 text-center font-medium">Health</th>
                </tr>
              </thead>
              <tbody className={reIndexTableBodyClass}>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-sm text-bm-muted2">
                      {hasActiveFilters
                        ? "No investments match the current filters."
                        : "No investments yet."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.investment_id}
                      data-testid={`investment-row-${row.investment_id}`}
                      className={reIndexTableRowClass}
                    >
                      <td className="px-3 py-4 align-middle">
                        <Link
                          href={`${basePath}/investments/${row.investment_id}`}
                          className={reIndexPrimaryCellClass}
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className={`px-3 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                        {row.fund_name || "—"}
                      </td>
                      <td className="px-3 py-4 align-middle text-[12px] uppercase tracking-[0.04em] text-bm-muted2">
                        {row.deal_type || "—"}
                      </td>
                      <td className="px-3 py-4 align-middle">
                        {row.stage ? (
                          <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] text-bm-muted2">
                            {STAGE_LABELS[row.stage] || row.stage}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-4 text-right align-middle text-[14px] tabular-nums text-bm-text">
                        {row.asset_count ?? "—"}
                      </td>
                      <td className={`px-3 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                        {row.primary_market || "—"}
                      </td>
                      <td className={`px-3 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtMoney(row.nav)}
                      </td>
                      <td className={`px-3 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtMoney(row.total_noi)}
                      </td>
                      <td className={`px-3 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtPct(row.weighted_occupancy)}
                      </td>
                      <td className={`px-3 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtPct(row.computed_ltv)}
                      </td>
                      <td className={`px-3 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {row.computed_dscr != null ? `${Number(row.computed_dscr).toFixed(2)}x` : "—"}
                      </td>
                      <td className={`px-3 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtMoney(row.total_asset_value)}
                      </td>
                      <td className="px-3 py-4 text-center align-middle">
                        <DataHealthDot missing={row.missing_quarter_state_count} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <InvestmentCreateModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          funds={funds}
          onCreated={fetchInvestments}
        />
      </section>
    </RepeIndexScaffold>
  );
}

export default function RepeInvestmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-bm-border/70 p-4 text-sm text-bm-muted2">
          Loading investments...
        </div>
      }
    >
      <RepeInvestmentsPageContent />
    </Suspense>
  );
}

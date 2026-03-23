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
  reIndexNumericCellClass,
  reIndexPrimaryCellClass,
  reIndexSecondaryCellClass,
  reIndexTableBodyClass,
  reIndexTableClass,
  reIndexTableHeadRowClass,
  reIndexTableRowClass,
  reIndexTableShellClass,
} from "@/components/repe/RepeIndexScaffold";

const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closing",
  operating: "Operating",
  exited: "Exited",
};

const STAGE_OPTIONS = ["sourcing", "underwriting", "ic", "closing", "operating", "exited"] as const;

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

// ── Column-header filter components ─────────────────────────────────────────

function ColTextFilter({
  value,
  onChange,
  placeholder = "Filter...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const active = value.length > 0;
  return (
    <div className="relative mt-1.5 flex items-center">
      <input
        className={`h-6 w-full min-w-[72px] rounded border px-2 pr-5 text-[11px] font-normal normal-case tracking-normal outline-none transition-colors placeholder:text-bm-muted2/40 ${
          active
            ? "border-bm-accent/50 bg-bm-accent/[0.06] text-bm-text"
            : "border-bm-border/40 bg-transparent text-bm-text"
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {active && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1 text-[12px] leading-none text-bm-muted2/70 hover:text-bm-text"
          aria-label="Clear filter"
        >
          ×
        </button>
      )}
    </div>
  );
}

function ColSelectFilter({
  value,
  onChange,
  options,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  const active = value !== "";
  return (
    <select
      className={`mt-1.5 h-6 w-full min-w-[72px] appearance-none rounded border px-2 text-[11px] font-normal normal-case tracking-normal outline-none transition-colors ${
        active
          ? "border-bm-accent/50 bg-bm-accent/[0.06] text-bm-accent"
          : "border-bm-border/40 bg-transparent text-bm-text"
      }`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function FundSelectFilter({
  value,
  onChange,
  funds,
}: {
  value: string;
  onChange: (v: string) => void;
  funds: { id: string; name: string }[];
}) {
  const active = value !== "";
  return (
    <select
      className={`mt-1.5 h-6 w-full min-w-[80px] appearance-none rounded border px-2 text-[11px] font-normal normal-case tracking-normal outline-none transition-colors ${
        active
          ? "border-bm-accent/50 bg-bm-accent/[0.06] text-bm-accent"
          : "border-bm-border/40 bg-transparent text-bm-text"
      }`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All Funds</option>
      {funds.map((f) => (
        <option key={f.id} value={f.id}>{f.name}</option>
      ))}
    </select>
  );
}

// ── Create modal ─────────────────────────────────────────────────────────────

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

// ── Main page content ─────────────────────────────────────────────────────────

function RepeInvestmentsPageContent() {
  const { businessId, environmentId, loading: ctxLoading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quarter = pickCurrentQuarter();

  const [allRows, setAllRows] = useState<ReV2FundInvestmentRollupRow[]>([]);
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // ── Filter state from URL params ────────────────────────────────────────
  const nameFilter = searchParams.get("q") || "";
  const fundFilter = searchParams.get("fund") || "";
  const typeFilter = searchParams.get("type") || "";
  const stageFilter = searchParams.get("stage") || "";
  const marketFilter = searchParams.get("market") || "";
  const sponsorFilter = searchParams.get("sponsor") || "";

  const setFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.replace("?", { scroll: false });
  }, [router]);

  // ── Load all funds (for create modal) ───────────────────────────────────
  useEffect(() => {
    if (!businessId && !environmentId) return;
    listReV1Funds({
      env_id: environmentId || undefined,
      business_id: businessId || undefined,
    }).then(setFunds).catch(() => {});
  }, [businessId, environmentId]);

  // ── Load all investments (no server-side filters) ────────────────────────
  const fetchInvestments = useCallback(async () => {
    if (!environmentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listReV2InvestmentsFiltered({
        env_id: environmentId,
        quarter,
      });
      setAllRows(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load investments");
    } finally {
      setLoading(false);
    }
  }, [environmentId, quarter]);

  useEffect(() => {
    fetchInvestments();
  }, [fetchInvestments]);

  // ── Client-side filtering ────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const nameLc = nameFilter.toLowerCase();
    const marketLc = marketFilter.toLowerCase();
    return allRows.filter((r) => {
      if (nameFilter && !r.name?.toLowerCase().includes(nameLc)) return false;
      if (fundFilter && r.fund_id !== fundFilter) return false;
      if (typeFilter && r.deal_type !== typeFilter) return false;
      if (stageFilter && r.stage !== stageFilter) return false;
      if (marketFilter && !r.primary_market?.toLowerCase().includes(marketLc)) return false;
      if (sponsorFilter && r.sponsor !== sponsorFilter) return false;
      return true;
    });
  }, [allRows, nameFilter, fundFilter, typeFilter, stageFilter, marketFilter, sponsorFilter]);

  // ── Derived filter options (from all unfiltered rows) ────────────────────
  const availableFunds = useMemo(() => {
    const seen = new Map<string, string>();
    allRows.forEach((r) => { if (r.fund_id && r.fund_name) seen.set(r.fund_id, r.fund_name); });
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach((r) => { if (r.deal_type) set.add(r.deal_type); });
    return Array.from(set).sort();
  }, [allRows]);

  const availableStages = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach((r) => { if (r.stage) set.add(r.stage); });
    return STAGE_OPTIONS.filter((s) => set.has(s));
  }, [allRows]);

  const availableSponsors = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach((r) => { if (r.sponsor) set.add(r.sponsor); });
    return Array.from(set).sort();
  }, [allRows]);

  // ── KPI aggregates (from filtered rows) ──────────────────────────────────
  const totalInvestments = filteredRows.length;
  const aggregateNav = filteredRows.reduce((s, r) => s + Number(r.nav || 0), 0);
  const aggregateNoi = filteredRows.reduce((s, r) => s + Number(r.total_noi || 0), 0);
  const totalValue = filteredRows.reduce((s, r) => s + Number(r.total_asset_value || 0), 0);
  const avgWeightedOccupancy = totalValue > 0
    ? filteredRows.reduce((s, r) => s + Number(r.weighted_occupancy || 0) * Number(r.total_asset_value || 0), 0) / totalValue
    : 0;

  const hasActiveFilters =
    nameFilter !== "" || fundFilter !== "" || typeFilter !== "" ||
    stageFilter !== "" || marketFilter !== "" || sponsorFilter !== "";

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
      subtitle={
        <span>
          Portfolio investments across all funds · As of {quarter}
          {hasActiveFilters && (
            <>
              {" "}·{" "}
              <button
                type="button"
                onClick={clearFilters}
                className="text-bm-accent underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
            </>
          )}
        </span>
      }
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
                  {/* Name — text filter */}
                  <th className="px-3 py-2.5 font-medium">
                    <div>Name</div>
                    <ColTextFilter
                      value={nameFilter}
                      onChange={(v) => setFilter("q", v)}
                      placeholder="Search..."
                    />
                  </th>

                  {/* Fund — select filter */}
                  <th className="px-3 py-2.5 font-medium">
                    <div>Fund</div>
                    <FundSelectFilter
                      value={fundFilter}
                      onChange={(v) => setFilter("fund", v)}
                      funds={availableFunds}
                    />
                  </th>

                  {/* Type — select filter */}
                  <th className="px-3 py-2.5 font-medium">
                    <div>Type</div>
                    <ColSelectFilter
                      value={typeFilter}
                      onChange={(v) => setFilter("type", v)}
                      options={availableTypes.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
                      allLabel="All"
                    />
                  </th>

                  {/* Stage — select filter */}
                  <th className="px-3 py-2.5 font-medium">
                    <div>Stage</div>
                    <ColSelectFilter
                      value={stageFilter}
                      onChange={(v) => setFilter("stage", v)}
                      options={availableStages.map((s) => ({ value: s, label: STAGE_LABELS[s] || s }))}
                      allLabel="All"
                    />
                  </th>

                  {/* Assets — no filter */}
                  <th className="px-3 py-2.5 text-right font-medium">Assets</th>

                  {/* Market — text filter */}
                  <th className="px-3 py-2.5 font-medium">
                    <div>Market</div>
                    <ColTextFilter
                      value={marketFilter}
                      onChange={(v) => setFilter("market", v)}
                      placeholder="Search..."
                    />
                  </th>

                  {/* Numeric cols — no filter */}
                  <th className="px-3 py-2.5 text-right font-medium">NAV</th>
                  <th className="px-3 py-2.5 text-right font-medium">NOI</th>
                  <th className="px-3 py-2.5 text-right font-medium">Occ</th>
                  <th className="px-3 py-2.5 text-right font-medium">LTV</th>
                  <th className="px-3 py-2.5 text-right font-medium">DSCR</th>
                  <th className="px-3 py-2.5 text-right font-medium">Value</th>

                  {/* Sponsor — select filter */}
                  <th className="px-3 py-2.5 font-medium">
                    <div>Sponsor</div>
                    <ColSelectFilter
                      value={sponsorFilter}
                      onChange={(v) => setFilter("sponsor", v)}
                      options={availableSponsors.map((s) => ({ value: s, label: s }))}
                      allLabel="All"
                    />
                  </th>

                  {/* Health — no filter */}
                  <th className="px-3 py-2.5 text-center font-medium">Health</th>
                </tr>
              </thead>
              <tbody className={reIndexTableBodyClass}>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-sm text-bm-muted2">
                      {hasActiveFilters
                        ? "No investments match the current filters."
                        : "No investments yet."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
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
                      <td className={`px-3 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                        {row.sponsor || "—"}
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

"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  listReV2Assets,
  listReV1Funds,
  listReV2InvestmentsFiltered,
  createReV2Asset,
  ReV2AssetListItem,
  RepeFund,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { KpiStrip } from "@/components/repe/asset-cockpit/KpiStrip";
import { fmtMoney, fmtPct } from '@/lib/format-utils';
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

const SECTORS = [
  "All",
  "Office",
  "Industrial",
  "Multifamily",
  "Senior Housing",
  "Medical Office",
  "Retail",
  "Hospitality",
  "Data Center",
  "Student Housing",
] as const;

const US_STATES = [
  "All",
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
] as const;

const STATUS_OPTIONS = ["All", "active", "disposed"] as const;

/* ── Asset Creation Modal ─────────────────────────────────────── */
function AssetCreateModal({
  open,
  onClose,
  funds,
  onCreated,
  environmentId,
}: {
  open: boolean;
  onClose: () => void;
  funds: RepeFund[];
  onCreated: () => void;
  environmentId: string;
}) {
  const [investments, setInvestments] = useState<{ investment_id: string; name: string }[]>([]);
  const [fundId, setFundId] = useState(funds[0]?.fund_id || "");
  const [investmentId, setInvestmentId] = useState("");
  const [form, setForm] = useState({
    name: "",
    property_type: "Multifamily",
    city: "",
    state: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load investments when fund changes
  useEffect(() => {
    if (!fundId || !environmentId) return;
    listReV2InvestmentsFiltered({ env_id: environmentId, fund_id: fundId })
      .then((rows) => {
        const mapped = rows.map((r) => ({
          investment_id: (r as { investment_id?: string }).investment_id || "",
          name: (r as { name?: string }).name || "",
        }));
        setInvestments(mapped);
        if (mapped.length > 0) setInvestmentId(mapped[0].investment_id);
        else setInvestmentId("");
      })
      .catch(() => {});
  }, [fundId, environmentId]);

  useEffect(() => {
    if (open && funds.length > 0 && !fundId) {
      setFundId(funds[0].fund_id);
    }
  }, [open, funds, fundId]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!investmentId) return;
    setSaving(true);
    setError(null);
    try {
      await createReV2Asset({
        investment_id: investmentId,
        name: form.name,
        property_type: form.property_type,
        city: form.city || undefined,
        state: form.state || undefined,
      });
      setForm({ name: "", property_type: "Multifamily", city: "", state: "" });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create asset");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-bm-border bg-bm-bg p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">New Asset</h3>
          <button type="button" onClick={onClose} className="text-xl text-bm-muted2 hover:text-bm-text">&times;</button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Fund
            <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={fundId} onChange={(e) => setFundId(e.target.value)} required>
              {funds.map((f) => <option key={f.fund_id} value={f.fund_id}>{f.name}</option>)}
            </select>
          </label>
          <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Investment
            <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={investmentId} onChange={(e) => setInvestmentId(e.target.value)} required>
              {investments.length === 0 && <option value="">No investments in this fund</option>}
              {investments.map((inv) => <option key={inv.investment_id} value={inv.investment_id}>{inv.name}</option>)}
            </select>
          </label>
          <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Asset Name
            <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              placeholder="123 Main Street" required />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
              Sector
              <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={form.property_type} onChange={(e) => setForm((v) => ({ ...v, property_type: e.target.value }))}>
                {["Multifamily","Office","Industrial","Retail","Senior Housing","Medical Office","Hospitality","Data Center","Student Housing"]
                  .map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
              City
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={form.city} onChange={(e) => setForm((v) => ({ ...v, city: e.target.value }))} placeholder="Chicago" />
            </label>
            <label className="block text-xs uppercase tracking-[0.1em] text-bm-muted2">
              State
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={form.state} onChange={(e) => setForm((v) => ({ ...v, state: e.target.value }))} placeholder="IL" maxLength={2} />
            </label>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40">Cancel</button>
            <button type="submit" disabled={saving || !investmentId}
              className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white disabled:opacity-50">
              {saving ? "Creating..." : "Create Asset"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssetsIndexContent() {
  const { environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [assets, setAssets] = useState<ReV2AssetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // Filters from URL params
  const fundFilter = searchParams.get("fund") || "";
  const sectorFilter = searchParams.get("sector") || "All";
  const stateFilter = searchParams.get("state") || "All";
  const msaFilter = searchParams.get("msa") || "";
  const statusFilter = searchParams.get("status") || "All";
  const searchQuery = searchParams.get("q") || "";
  const investmentFilter = searchParams.get("investment") || "";

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
    if (!environmentId) return;
    listReV1Funds({ env_id: environmentId }).then(setFunds).catch(() => {});
  }, [environmentId]);

  // Auto-open create modal when ?create=1 is in URL (from + Asset nav button)
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setModalOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("create");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    }
  }, [searchParams, router]);

  // Derive available MSAs from loaded assets
  const availableMsas = useMemo(() => {
    const msas = new Set<string>();
    assets.forEach((a) => {
      if (a.msa) msas.add(a.msa);
    });
    return Array.from(msas).sort();
  }, [assets]);

  // Derive available investments from loaded assets
  const availableInvestments = useMemo(() => {
    const map = new Map<string, string>();
    assets.forEach((a) => {
      if (a.investment_id && a.investment_name) {
        map.set(a.investment_id, a.investment_name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [assets]);

  const fetchAssets = useCallback(async () => {
    if (!environmentId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: environmentId,
      };
      if (fundFilter) params.fund_id = fundFilter;
      if (sectorFilter !== "All") params.sector = sectorFilter.toLowerCase();
      if (stateFilter !== "All") params.state = stateFilter;
      if (msaFilter) params.msa = msaFilter;
      if (statusFilter !== "All") params.status = statusFilter;
      if (searchQuery) params.q = searchQuery;
      if (investmentFilter) params.investment_id = investmentFilter;

      const result = await listReV2Assets(params as { env_id: string });
      setAssets(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [environmentId, fundFilter, sectorFilter, stateFilter, msaFilter, statusFilter, searchQuery, investmentFilter]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Quick stats
  const totalAssets = assets.length;
  const activeAssets = assets.filter((a) => a.status === "active").length;
  const totalNoi = assets.reduce((sum, a) => sum + Number(a.latest_noi || 0), 0);
  const avgOccupancy = assets.length
    ? assets.reduce((sum, a) => sum + Number(a.latest_occupancy || 0), 0) / assets.length
    : 0;

  const clearFilters = () => {
    router.replace("?", { scroll: false });
  };

  const hasActiveFilters =
    fundFilter !== "" ||
    sectorFilter !== "All" ||
    stateFilter !== "All" ||
    msaFilter !== "" ||
    statusFilter !== "All" ||
    searchQuery !== "" ||
    investmentFilter !== "";

  if (!environmentId) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">
        Initializing RE workspace...
      </div>
    );
  }

  return (
    <RepeIndexScaffold
      title="Assets"
      subtitle="All properties across funds and investments."
      action={
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={reIndexActionClass}
          data-testid="btn-new-asset"
        >
          + New Asset
        </button>
      }
      metrics={
        <KpiStrip
          variant="band"
          kpis={[
            { label: "Total Assets", value: totalAssets },
            { label: "Active", value: activeAssets },
            { label: "Total NOI", value: fmtMoney(totalNoi) },
            { label: "Avg Occupancy", value: fmtPct(avgOccupancy) },
          ]}
        />
      }
      controls={
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3 border-b border-bm-border/20 pb-5">
          <label className={reIndexControlLabelClass}>
            Fund
            <select
              className={`${reIndexInputClass} w-48`}
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
            Investment
            <select
              className={`${reIndexInputClass} w-48`}
              value={investmentFilter}
              onChange={(e) => setFilter("investment", e.target.value)}
              data-testid="filter-investment"
            >
              <option value="">All Investments</option>
              {availableInvestments.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>

          <label className={reIndexControlLabelClass}>
            Sector
            <select
              className={`${reIndexInputClass} w-36`}
              value={sectorFilter}
              onChange={(e) => setFilter("sector", e.target.value)}
              data-testid="filter-sector"
            >
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className={reIndexControlLabelClass}>
            State
            <select
              className={`${reIndexInputClass} w-24`}
              value={stateFilter}
              onChange={(e) => setFilter("state", e.target.value)}
              data-testid="filter-state"
            >
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className={reIndexControlLabelClass}>
            MSA
            <select
              className={`${reIndexInputClass} w-48`}
              value={msaFilter}
              onChange={(e) => setFilter("msa", e.target.value)}
              data-testid="filter-msa"
            >
              <option value="">All</option>
              {availableMsas.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className={reIndexControlLabelClass}>
            Status
            <select
              className={`${reIndexInputClass} w-28`}
              value={statusFilter}
              onChange={(e) => setFilter("status", e.target.value)}
              data-testid="filter-status"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "All" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </label>

          <label className={reIndexControlLabelClass}>
            Search
            <input
              className={`${reIndexInputClass} w-48`}
              value={searchQuery}
              onChange={(e) => setFilter("q", e.target.value)}
              placeholder="Name, city, address..."
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
      <section data-testid="re-assets-index">
        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">
            Loading assets...
          </div>
        ) : (
          <div className={reIndexTableShellClass}>
            <table className={`${reIndexTableClass} min-w-[1080px]`}>
              <thead>
                <tr className={reIndexTableHeadRowClass}>
                  <th className="px-4 py-3 font-medium">Asset</th>
                  <th className="px-4 py-3 font-medium">Sector</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">Units/SF</th>
                  <th className="px-4 py-3 text-right font-medium">NOI</th>
                  <th className="px-4 py-3 text-right font-medium">Occupancy</th>
                  <th className="px-4 py-3 text-right font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Investment</th>
                </tr>
              </thead>
              <tbody className={reIndexTableBodyClass}>
                {assets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-sm text-bm-muted2">
                      {hasActiveFilters
                        ? "No assets match the current filters."
                        : "No assets found."}
                    </td>
                  </tr>
                ) : (
                  assets.map((asset) => (
                    <tr
                      key={asset.asset_id}
                      data-testid={`asset-row-${asset.asset_id}`}
                      className={reIndexTableRowClass}
                    >
                      <td className="px-4 py-4 align-middle">
                        <Link
                          href={`${basePath}/assets/${asset.asset_id}`}
                          className={reIndexPrimaryCellClass}
                        >
                          {asset.name}
                        </Link>
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                        {asset.sector || "—"}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                        {asset.city || "—"}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                        {asset.state || "—"}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                        {(asset.units && asset.units > 0) ? `${asset.units.toLocaleString()} units` : (asset.square_feet && asset.square_feet > 0) ? `${Math.max(1, Math.round(asset.square_feet / 1000))}K SF` : "—"}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtMoney(asset.latest_noi)}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtPct(asset.latest_occupancy)}
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                        {fmtMoney(asset.latest_value)}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] capitalize text-bm-muted2">
                          {asset.status}
                        </span>
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                        {asset.investment_name || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <AssetCreateModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          funds={funds}
          onCreated={fetchAssets}
          environmentId={environmentId}
        />
      </section>
    </RepeIndexScaffold>
  );
}

export default function RepeAssetsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-bm-border/70 p-4 text-sm text-bm-muted2">
          Loading assets...
        </div>
      }
    >
      <AssetsIndexContent />
    </Suspense>
  );
}

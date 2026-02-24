"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  createRepeAsset,
  listReV1Funds,
  listRepeAssets,
  listRepeDeals,
  RepeAsset,
  RepeDeal,
  RepeFund,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";

type DealRow = RepeDeal & { fund_name: string };
type AssetRow = RepeAsset & { deal_name: string; fund_id: string; fund_name: string };

function RepeAssetsPageContent() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const searchParams = useSearchParams();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [selectedDealId, setSelectedDealId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const preferredFundFromQuery = searchParams.get("fund") || "";
  const preferredDealFromQuery = searchParams.get("deal") || "";

  const [form, setForm] = useState({
    asset_type: "property" as "property" | "cmbs",
    name: "",
    property_type: "multifamily",
    units: 0,
    market: "",
    tranche: "",
    rating: "",
  });

  const refreshData = useCallback(async (
    currentBusinessId: string | null,
    currentEnvId: string | null,
    preferredFundId?: string,
    preferredDealId?: string
  ) => {
    const fundRows = await listReV1Funds({
      env_id: currentEnvId || undefined,
      business_id: currentBusinessId || undefined,
    });
    setFunds(fundRows);

    const dealGroups = await Promise.all(
      fundRows.map(async (fund) => {
        const dealRows = await listRepeDeals(fund.fund_id).catch(() => []);
        return dealRows.map((deal) => ({ ...deal, fund_name: fund.name }));
      })
    );
    const allDeals = dealGroups.flat();
    setDeals(allDeals);

    const fundCandidate = preferredFundId || preferredFundFromQuery;
    const resolvedFundId = fundRows.some((fund) => fund.fund_id === fundCandidate)
      ? fundCandidate
      : fundRows[0]?.fund_id || "";
    setSelectedFundId(resolvedFundId);

    const dealsForFund = allDeals.filter((deal) => deal.fund_id === resolvedFundId);
    const dealCandidate = preferredDealId || preferredDealFromQuery;
    const resolvedDealId = dealsForFund.some((deal) => deal.deal_id === dealCandidate)
      ? dealCandidate
      : dealsForFund[0]?.deal_id || "";
    setSelectedDealId(resolvedDealId);

    const assetGroups = await Promise.all(
      allDeals.map(async (deal) => {
        const assetRows = await listRepeAssets(deal.deal_id).catch(() => []);
        return assetRows.map((asset) => ({
          ...asset,
          deal_name: deal.name,
          fund_id: deal.fund_id,
          fund_name: deal.fund_name,
        }));
      })
    );
    setAssets(assetGroups.flat());
  }, [preferredFundFromQuery, preferredDealFromQuery]);

  useEffect(() => {
    if (!businessId && !environmentId) return;
    refreshData(businessId, environmentId).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load asset workspace");
    });
  }, [businessId, environmentId, refreshData]);

  const dealsForSelectedFund = useMemo(
    () => deals.filter((deal) => deal.fund_id === selectedFundId),
    [deals, selectedFundId]
  );

  const visibleAssets = useMemo(() => {
    if (!selectedFundId && !selectedDealId) return assets;
    if (selectedDealId) return assets.filter((asset) => asset.deal_id === selectedDealId);
    return assets.filter((asset) => asset.fund_id === selectedFundId);
  }, [assets, selectedFundId, selectedDealId]);

  async function onCreateAsset(event: FormEvent) {
    event.preventDefault();
    if (!selectedDealId || (!businessId && !environmentId)) return;
    setError(null);
    setStatus("Creating asset...");
    try {
      await createRepeAsset(selectedDealId, {
        asset_type: form.asset_type,
        name: form.name,
        property_type: form.asset_type === "property" ? form.property_type : undefined,
        units: form.asset_type === "property" ? form.units : undefined,
        market: form.asset_type === "property" ? form.market : undefined,
        tranche: form.asset_type === "cmbs" ? form.tranche || undefined : undefined,
        rating: form.asset_type === "cmbs" ? form.rating || undefined : undefined,
      });
      await refreshData(businessId, environmentId, selectedFundId, selectedDealId);
      setStatus("Asset created.");
      setForm((prev) => ({ ...prev, name: "", market: "", tranche: "", rating: "" }));
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to create asset");
    }
  }

  if (!businessId) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-4 text-sm space-y-2">
        <p className="text-bm-muted2">{loading ? "Initializing RE workspace..." : "RE workspace not initialized."}</p>
        {contextError ? <p className="text-red-400">{contextError}</p> : null}
        {!loading ? (
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

  if (funds.length === 0) {
    return (
      <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2">
        <h2 className="text-lg font-semibold">Assets</h2>
        <p className="text-sm text-bm-muted2">Create a fund first, then create an investment before adding assets.</p>
        <Link href={`${basePath}/funds/new`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Create Fund
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-4" data-testid="re-assets-list">
      <div>
        <h2 className="text-lg font-semibold">Assets</h2>
        <p className="text-sm text-bm-muted2">Assets roll up under Investments.</p>
      </div>

      <form onSubmit={onCreateAsset} className="rounded-lg border border-bm-border/70 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Fund
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={selectedFundId}
            onChange={(e) => {
              const nextFundId = e.target.value;
              setSelectedFundId(nextFundId);
              const firstDeal = deals.find((deal) => deal.fund_id === nextFundId)?.deal_id || "";
              setSelectedDealId(firstDeal);
            }}
          >
            {funds.map((fund) => <option key={fund.fund_id} value={fund.fund_id}>{fund.name}</option>)}
          </select>
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Investment
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={selectedDealId}
            onChange={(e) => setSelectedDealId(e.target.value)}
          >
            {dealsForSelectedFund.map((deal) => <option key={deal.deal_id} value={deal.deal_id}>{deal.name}</option>)}
          </select>
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Asset Name
          <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="Asset name" required />
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Asset Type
          <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.asset_type} onChange={(e) => setForm((v) => ({ ...v, asset_type: e.target.value as "property" | "cmbs" }))}>
            <option value="property">Property</option>
            <option value="cmbs">CMBS</option>
          </select>
        </label>

        {form.asset_type === "property" ? (
          <>
            <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
              Property Type
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.property_type} onChange={(e) => setForm((v) => ({ ...v, property_type: e.target.value }))} placeholder="multifamily" />
            </label>
            <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
              Units
              <input type="number" className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.units} onChange={(e) => setForm((v) => ({ ...v, units: Number(e.target.value) }))} placeholder="0" />
            </label>
            <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2 md:col-span-2">
              Market
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.market} onChange={(e) => setForm((v) => ({ ...v, market: e.target.value }))} placeholder="Austin, TX" />
            </label>
          </>
        ) : (
          <>
            <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
              Tranche
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.tranche} onChange={(e) => setForm((v) => ({ ...v, tranche: e.target.value }))} placeholder="A" />
            </label>
            <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
              Rating
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.rating} onChange={(e) => setForm((v) => ({ ...v, rating: e.target.value }))} placeholder="AAA" />
            </label>
          </>
        )}

        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white" disabled={!selectedDealId}>
            Create Asset
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/70 bg-bm-surface/20">
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Asset</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Type</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Investment</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Fund</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {visibleAssets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-bm-muted2">No assets yet.</td>
              </tr>
            ) : (
              visibleAssets.map((asset) => (
                <tr key={asset.asset_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{asset.name}</td>
                  <td className="px-4 py-3 text-bm-muted2 uppercase">{asset.asset_type}</td>
                  <td className="px-4 py-3 text-bm-muted2">{asset.deal_name}</td>
                  <td className="px-4 py-3 text-bm-muted2">{asset.fund_name}</td>
                  <td className="px-4 py-3">
                    <Link href={`${basePath}/assets/${asset.asset_id}`} className="text-xs text-bm-accent hover:underline">Open →</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {status ? <p className="text-sm text-bm-muted2">{status}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
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
      <RepeAssetsPageContent />
    </Suspense>
  );
}

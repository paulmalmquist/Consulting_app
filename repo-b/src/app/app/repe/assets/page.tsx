"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  createRepeAsset,
  getRepeAssetOwnership,
  listRepeAssets,
  listRepeDeals,
  listRepeFunds,
  RepeAsset,
  RepeDeal,
  RepeFund,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";

export default function RepeAssetsPage() {
  const { businessId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [assets, setAssets] = useState<RepeAsset[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [selectedDealId, setSelectedDealId] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [ownershipSummary, setOwnershipSummary] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    asset_type: "property" as "property" | "cmbs",
    name: "",
    property_type: "multifamily",
    units: 0,
    market: "",
    current_noi: "",
    occupancy: "",
    tranche: "",
    rating: "",
    coupon: "",
    maturity_date: "",
  });

  async function loadDealsAndAssets(fundId: string) {
    const dealRows = await listRepeDeals(fundId);
    setDeals(dealRows);
    const firstDealId = dealRows[0]?.deal_id || "";
    setSelectedDealId(firstDealId);
    if (firstDealId) {
      const assetRows = await listRepeAssets(firstDealId);
      setAssets(assetRows);
    } else {
      setAssets([]);
    }
  }

  useEffect(() => {
    if (!businessId) return;
    listRepeFunds(businessId)
      .then(async (rows) => {
        setFunds(rows);
        const firstFundId = rows[0]?.fund_id || "";
        setSelectedFundId(firstFundId);
        if (firstFundId) {
          await loadDealsAndAssets(firstFundId);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load funds"));
  }, [businessId]);

  async function onFundChange(fundId: string) {
    setSelectedFundId(fundId);
    setSelectedAssetId("");
    setOwnershipSummary("");
    if (!fundId) {
      setDeals([]);
      setAssets([]);
      return;
    }
    await loadDealsAndAssets(fundId);
  }

  async function onDealChange(dealId: string) {
    setSelectedDealId(dealId);
    setSelectedAssetId("");
    setOwnershipSummary("");
    if (!dealId) {
      setAssets([]);
      return;
    }
    const rows = await listRepeAssets(dealId);
    setAssets(rows);
  }

  async function onCreateAsset(event: FormEvent) {
    event.preventDefault();
    if (!selectedDealId) return;
    setError(null);
    setStatus("Creating asset...");
    try {
      await createRepeAsset(selectedDealId, {
        asset_type: form.asset_type,
        name: form.name,
        property_type: form.asset_type === "property" ? form.property_type : undefined,
        units: form.asset_type === "property" ? form.units : undefined,
        market: form.asset_type === "property" ? form.market : undefined,
        current_noi: form.asset_type === "property" ? form.current_noi || undefined : undefined,
        occupancy: form.asset_type === "property" ? form.occupancy || undefined : undefined,
        tranche: form.asset_type === "cmbs" ? form.tranche || undefined : undefined,
        rating: form.asset_type === "cmbs" ? form.rating || undefined : undefined,
        coupon: form.asset_type === "cmbs" ? form.coupon || undefined : undefined,
        maturity_date: form.asset_type === "cmbs" ? form.maturity_date || undefined : undefined,
      });
      const rows = await listRepeAssets(selectedDealId);
      setAssets(rows);
      setStatus("Asset created.");
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to create asset");
    }
  }

  async function onSelectAsset(assetId: string) {
    setSelectedAssetId(assetId);
    if (!assetId) {
      setOwnershipSummary("");
      return;
    }
    try {
      const out = await getRepeAssetOwnership(assetId);
      setOwnershipSummary(`Links: ${out.links.length} · Effective edges: ${out.entity_edges.length}`);
    } catch {
      setOwnershipSummary("Ownership data unavailable");
    }
  }

  if (!businessId) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-4 text-sm space-y-2">
        <p className="text-bm-muted2">{loading ? "Initializing REPE workspace..." : "REPE workspace not initialized."}</p>
        {contextError ? <p className="text-red-400">{contextError}</p> : null}
        {!loading ? (
          <button
            type="button"
            className="rounded-lg border border-bm-border px-3 py-2 hover:bg-bm-surface/40"
            onClick={() => void initializeWorkspace()}
          >
            Initialize REPE Workspace
          </button>
        ) : null}
      </div>
    );
  }

  if (funds.length === 0) {
    return (
      <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2">
        <h2 className="text-lg font-semibold">Assets</h2>
        <p className="text-sm text-bm-muted2">Create a fund first, then create a deal before adding assets.</p>
        <Link href={`${basePath}/portfolio`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Create Fund
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-4">
      <h2 className="text-lg font-semibold">Assets</h2>
      <p className="text-sm text-bm-muted2">Asset creation branches by type: Property (equity) or CMBS (debt).</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
          Fund
          <select className="mt-2 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={selectedFundId} onChange={(e) => void onFundChange(e.target.value)}>
            {funds.map((fund) => <option key={fund.fund_id} value={fund.fund_id}>{fund.name}</option>)}
          </select>
        </label>
        <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
          Deal
          <select className="mt-2 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={selectedDealId} onChange={(e) => void onDealChange(e.target.value)}>
            {deals.map((deal) => <option key={deal.deal_id} value={deal.deal_id}>{deal.name}</option>)}
          </select>
        </label>
      </div>

      <form onSubmit={onCreateAsset} className="rounded-lg border border-bm-border/70 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="Asset name" required />
        <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.asset_type} onChange={(e) => setForm((v) => ({ ...v, asset_type: e.target.value as "property" | "cmbs" }))}>
          <option value="property">Property</option>
          <option value="cmbs">CMBS</option>
        </select>

        {form.asset_type === "property" ? (
          <>
            <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.property_type} onChange={(e) => setForm((v) => ({ ...v, property_type: e.target.value }))} placeholder="Property type" />
            <input type="number" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.units} onChange={(e) => setForm((v) => ({ ...v, units: Number(e.target.value) }))} placeholder="Units" />
            <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.market} onChange={(e) => setForm((v) => ({ ...v, market: e.target.value }))} placeholder="Market" />
            <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.current_noi} onChange={(e) => setForm((v) => ({ ...v, current_noi: e.target.value }))} placeholder="Current NOI" />
          </>
        ) : (
          <>
            <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.tranche} onChange={(e) => setForm((v) => ({ ...v, tranche: e.target.value }))} placeholder="Tranche" />
            <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.rating} onChange={(e) => setForm((v) => ({ ...v, rating: e.target.value }))} placeholder="Rating" />
            <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.coupon} onChange={(e) => setForm((v) => ({ ...v, coupon: e.target.value }))} placeholder="Coupon" />
            <input type="date" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.maturity_date} onChange={(e) => setForm((v) => ({ ...v, maturity_date: e.target.value }))} />
          </>
        )}

        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white">Create Asset</button>
        </div>
      </form>

      <div className="space-y-2">
        {assets.map((asset) => (
          <button
            key={asset.asset_id}
            type="button"
            onClick={() => void onSelectAsset(asset.asset_id)}
            className={`w-full text-left rounded-lg border px-3 py-2 ${selectedAssetId === asset.asset_id ? "border-bm-accent/70 bg-bm-accent/10" : "border-bm-border/70 bg-bm-surface/20"}`}
          >
            <p className="font-semibold">{asset.name}</p>
            <p className="text-xs text-bm-muted2">{asset.asset_type.toUpperCase()}</p>
          </button>
        ))}
      </div>

      {ownershipSummary ? <p className="text-sm text-bm-muted2">{ownershipSummary}</p> : null}
      {status ? <p className="text-sm text-bm-muted2">{status}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}

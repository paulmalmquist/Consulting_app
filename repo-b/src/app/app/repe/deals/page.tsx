"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createRepeDeal, listRepeDeals, listRepeFunds, RepeDeal, RepeFund } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";

export default function RepeDealsPage() {
  const { businessId, loading, contextError, initializeWorkspace } = useRepeContext();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const [form, setForm] = useState({
    name: "New Deal",
    deal_type: "equity" as "equity" | "debt",
    stage: "sourcing" as "sourcing" | "underwriting" | "ic" | "closing" | "operating" | "exited",
    sponsor: "",
  });

  async function refreshDeals(fundId: string) {
    const rows = await listRepeDeals(fundId);
    setDeals(rows);
  }

  useEffect(() => {
    if (!businessId) return;
    listRepeFunds(businessId)
      .then((rows) => {
        setFunds(rows);
        const first = rows[0]?.fund_id || "";
        setSelectedFundId(first);
        if (first) {
          return refreshDeals(first);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load funds"));
  }, [businessId]);

  async function onCreateDeal(event: FormEvent) {
    event.preventDefault();
    if (!selectedFundId) return;
    setError(null);
    setStatus("Creating deal...");
    try {
      const created = await createRepeDeal(selectedFundId, form);
      await refreshDeals(selectedFundId);
      setStatus(`Created deal: ${created.name}`);
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to create deal");
    }
  }

  async function onSelectFund(fundId: string) {
    setSelectedFundId(fundId);
    if (!fundId) {
      setDeals([]);
      return;
    }
    await refreshDeals(fundId);
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
      <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2" data-testid="repe-deals-empty-funds">
        <h2 className="text-lg font-semibold">Deals Workspace</h2>
        <p className="text-sm text-bm-muted2">You need a fund before creating deals.</p>
        <Link href="/app/repe/portfolio" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Create Fund
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-4">
      <h2 className="text-lg font-semibold">Deals Workspace</h2>
      <p className="text-sm text-bm-muted2">Underwriting is deal-scoped. Select a fund, then select or create deals.</p>

      <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
        Fund
        <select
          className="mt-2 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
          value={selectedFundId}
          onChange={(e) => void onSelectFund(e.target.value)}
        >
          {funds.map((fund) => (
            <option key={fund.fund_id} value={fund.fund_id}>{fund.name}</option>
          ))}
        </select>
      </label>

      <form onSubmit={onCreateDeal} className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-bm-border/70 p-3">
        <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="Deal name" required />
        <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.sponsor} onChange={(e) => setForm((v) => ({ ...v, sponsor: e.target.value }))} placeholder="Sponsor" />
        <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.deal_type} onChange={(e) => setForm((v) => ({ ...v, deal_type: e.target.value as "equity" | "debt" }))}>
          <option value="equity">Equity</option>
          <option value="debt">Debt</option>
        </select>
        <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.stage} onChange={(e) => setForm((v) => ({ ...v, stage: e.target.value as typeof form.stage }))}>
          <option value="sourcing">Sourcing</option>
          <option value="underwriting">Underwriting</option>
          <option value="ic">IC</option>
          <option value="closing">Closing</option>
          <option value="operating">Operating</option>
          <option value="exited">Exited</option>
        </select>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white">Create Deal</button>
        </div>
      </form>

      <div className="space-y-2">
        {deals.length === 0 ? <p className="text-sm text-bm-muted2">No deals yet for this fund.</p> : null}
        {deals.map((deal) => (
          <div key={deal.deal_id} className="rounded-lg border border-bm-border/70 bg-bm-surface/20 p-3">
            <p className="font-semibold">{deal.name}</p>
            <p className="text-xs text-bm-muted2">{deal.deal_type.toUpperCase()} · {deal.stage} · {deal.sponsor || "No sponsor"}</p>
          </div>
        ))}
      </div>

      {status ? <p className="text-sm text-bm-muted2">{status}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}

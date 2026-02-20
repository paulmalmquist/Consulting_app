"use client";

import Link from "next/link";
import React, { FormEvent, useEffect, useState } from "react";
import { createRepeFund, listRepeFunds, RepeFund, seedRepeBusiness } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";

export default function RepePortfolioPage() {
  const { businessId, loading } = useRepeContext();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: "GreenRock Value Add Fund I",
    vintage_year: new Date().getUTCFullYear(),
    strategy: "equity" as "equity" | "debt",
    fund_type: "closed_end" as "closed_end" | "open_end" | "sma" | "co_invest",
    sub_strategy: "value_add",
    target_size: "500000000",
    term_years: 10,
    preferred_return_rate: "0.08",
    carry_rate: "0.20",
    waterfall_style: "european" as "european" | "american",
  });

  async function refreshFunds(bizId: string) {
    const rows = await listRepeFunds(bizId);
    setFunds(rows);
  }

  useEffect(() => {
    let cancelled = false;
    if (!businessId) return;
    refreshFunds(businessId)
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load funds");
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  async function onCreateFund(event?: FormEvent) {
    event?.preventDefault();
    if (!businessId) return;
    setCreating(true);
    setError(null);
    setStatus("Creating fund...");
    try {
      const created = await createRepeFund(businessId, {
        name: form.name,
        vintage_year: form.vintage_year,
        strategy: form.strategy,
        fund_type: form.fund_type,
        sub_strategy: form.sub_strategy,
        target_size: form.target_size,
        term_years: form.term_years,
        preferred_return_rate: form.preferred_return_rate,
        carry_rate: form.carry_rate,
        waterfall_style: form.waterfall_style,
      });
      await refreshFunds(businessId);
      setStatus(`Fund created: ${created.name}`);
      window.location.href = `/app/repe/funds/${created.fund_id}`;
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to create fund");
    } finally {
      setCreating(false);
    }
  }

  async function onLoadSampleData() {
    if (!businessId) return;
    setError(null);
    setStatus("Loading sample REPE dataset...");
    try {
      await seedRepeBusiness(businessId);
      await refreshFunds(businessId);
      setStatus("Sample dataset loaded.");
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to seed sample data");
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-bm-border/70 p-4 text-sm text-bm-muted2">Resolving REPE context...</div>;
  }

  if (!businessId) {
    return <div className="rounded-xl border border-bm-border/70 p-4 text-sm text-bm-muted2">No business context available for this environment.</div>;
  }

  if (funds.length === 0) {
    return (
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-6" data-testid="repe-get-started">
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Get Started</p>
        <h2 className="mt-2 text-2xl font-semibold">Create your first fund</h2>
        <p className="mt-2 text-sm text-bm-muted2 max-w-2xl">
          Start with a fund, then add deals and assets. Underwriting is deal-scoped and waterfalls are fund-scoped.
        </p>

        <form onSubmit={onCreateFund} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Fund name" required />
          <input type="number" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.vintage_year} onChange={(e) => setForm((prev) => ({ ...prev, vintage_year: Number(e.target.value) }))} placeholder="Vintage year" required />
          <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.strategy} onChange={(e) => setForm((prev) => ({ ...prev, strategy: e.target.value as "equity" | "debt" }))}>
            <option value="equity">Equity</option>
            <option value="debt">Debt</option>
          </select>
          <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.target_size} onChange={(e) => setForm((prev) => ({ ...prev, target_size: e.target.value }))} placeholder="Target size" required />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="submit" className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white" disabled={creating} data-testid="repe-create-fund-cta">
              {creating ? "Creating..." : "Create Fund"}
            </button>
            <button type="button" className="rounded-lg border border-bm-border px-4 py-2 text-sm" disabled>
              Import Fund
            </button>
            <button type="button" className="rounded-lg border border-bm-border px-4 py-2 text-sm" onClick={onLoadSampleData}>
              Load Sample Data
            </button>
          </div>
        </form>

        {(status || error) && (
          <div className="mt-3 text-sm">
            {status ? <p className="text-bm-muted2">{status}</p> : null}
            {error ? <p className="text-red-400">{error}</p> : null}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 flex items-center justify-between gap-2">
        <p className="text-sm text-bm-muted2">Portfolio ready. Select a fund to continue operations.</p>
        <button
          type="button"
          onClick={() => void onCreateFund()}
          className="rounded-lg bg-bm-accent px-3 py-2 text-xs text-white"
        >
          Quick Create Fund
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {funds.map((fund) => (
          <Link key={fund.fund_id} href={`/app/repe/funds/${fund.fund_id}`} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 hover:bg-bm-surface/40">
            <p className="text-lg font-semibold">{fund.name}</p>
            <p className="text-xs text-bm-muted2">
              {fund.strategy.toUpperCase()} · Vintage {fund.vintage_year} · {fund.created_at?.slice(0, 10) || "n/a"}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

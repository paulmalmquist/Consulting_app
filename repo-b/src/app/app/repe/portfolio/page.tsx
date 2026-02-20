"use client";

import Link from "next/link";
import React, { FormEvent, useEffect, useState } from "react";
import { createFinFund, FinFund, listFinFunds, listFinPartitions } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";

export default function RepePortfolioPage() {
  const { businessId, loading } = useRepeContext();
  const [partitionId, setPartitionId] = useState("");
  const [funds, setFunds] = useState<FinFund[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    fund_code: "REPE1",
    name: "Real Estate Fund I",
    strategy: "Value Add",
    vintage_date: new Date().toISOString().slice(0, 10),
    pref_rate: "0.08",
    carry_rate: "0.20",
    waterfall_style: "american" as "american" | "european",
  });

  useEffect(() => {
    let cancelled = false;
    if (!businessId) return;

    async function load() {
      try {
        const partitions = await listFinPartitions(businessId);
        if (cancelled) return;
        const livePartitionId = partitions.find((row) => row.partition_type === "live")?.partition_id || partitions[0]?.partition_id || "";
        setPartitionId(livePartitionId);
        if (!livePartitionId) {
          setFunds([]);
          return;
        }
        const rows = await listFinFunds(businessId, livePartitionId);
        if (cancelled) return;
        setFunds(rows);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load funds");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  async function onCreateFund(event?: FormEvent) {
    event?.preventDefault();
    if (!businessId || !partitionId) return;
    setCreating(true);
    setError(null);
    setStatus("Creating fund...");
    try {
      const created = await createFinFund({
        business_id: businessId,
        partition_id: partitionId,
        fund_code: form.fund_code,
        name: form.name,
        strategy: form.strategy,
        vintage_date: form.vintage_date,
        pref_rate: form.pref_rate,
        carry_rate: form.carry_rate,
        waterfall_style: form.waterfall_style,
      });
      const rows = await listFinFunds(businessId, partitionId);
      setFunds(rows);
      setStatus(`Fund created: ${created.name}`);
      window.location.href = `/app/repe/funds/${created.fin_fund_id}`;
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to create fund");
    } finally {
      setCreating(false);
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
          Start with a fund, then add deals and assets. Underwriting and waterfalls operate on those objects.
        </p>

        <form onSubmit={onCreateFund} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Fund name" required />
          <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.fund_code} onChange={(e) => setForm((prev) => ({ ...prev, fund_code: e.target.value }))} placeholder="Fund code" required />
          <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.strategy} onChange={(e) => setForm((prev) => ({ ...prev, strategy: e.target.value }))} placeholder="Strategy" required />
          <input type="date" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={form.vintage_date} onChange={(e) => setForm((prev) => ({ ...prev, vintage_date: e.target.value }))} required />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="submit" className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white" disabled={creating} data-testid="repe-create-fund-cta">
              {creating ? "Creating..." : "Create Fund"}
            </button>
            <button type="button" className="rounded-lg border border-bm-border px-4 py-2 text-sm" disabled>
              Import Fund
            </button>
            <button type="button" className="rounded-lg border border-bm-border px-4 py-2 text-sm" disabled>
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
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4">
        <p className="text-sm text-bm-muted2">Portfolio ready. Select a fund to continue operations.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {funds.map((fund) => (
          <Link key={fund.fin_fund_id} href={`/app/repe/funds/${fund.fin_fund_id}`} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 hover:bg-bm-surface/40">
            <p className="text-lg font-semibold">{fund.name}</p>
            <p className="text-xs text-bm-muted2">{fund.fund_code} · {fund.vintage_date}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

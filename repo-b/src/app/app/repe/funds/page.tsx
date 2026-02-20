"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createRepeFund, listRepeFunds, RepeFund } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";

export default function RepeFundsPage() {
  const { businessId } = useRepeContext();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    listRepeFunds(businessId)
      .then(setFunds)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load funds"));
  }, [businessId]);

  async function onAddFund() {
    if (!businessId) return;
    setCreating(true);
    setError(null);
    setStatus("Creating fund...");
    try {
      const created = await createRepeFund(businessId, {
        name: `New Fund ${new Date().toISOString().slice(0, 10)}`,
        vintage_year: new Date().getUTCFullYear(),
        strategy: "equity",
        fund_type: "closed_end",
        sub_strategy: "value_add",
        target_size: "250000000",
        term_years: 10,
        preferred_return_rate: "0.08",
        carry_rate: "0.20",
        waterfall_style: "european",
      });
      const rows = await listRepeFunds(businessId);
      setFunds(rows);
      setStatus(`Fund created: ${created.name}`);
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to create fund");
    } finally {
      setCreating(false);
    }
  }

  if (!businessId) {
    return <div className="rounded-xl border border-bm-border/70 p-4 text-sm text-bm-muted2">No REPE business context found.</div>;
  }

  if (funds.length === 0) {
    return (
      <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Funds</h2>
          <button
            type="button"
            className="rounded-lg bg-bm-accent px-3 py-2 text-sm text-white disabled:opacity-60"
            onClick={() => void onAddFund()}
            disabled={creating}
          >
            {creating ? "Adding..." : "Add Fund"}
          </button>
        </div>
        <p className="text-sm text-bm-muted2">No funds yet. Create one from Portfolio to initialize the operating model.</p>
        <Link href="/app/repe/portfolio" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Go to Portfolio
        </Link>
        {status ? <p className="text-sm text-bm-muted2">{status}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Funds</h2>
        <button
          type="button"
          className="rounded-lg bg-bm-accent px-3 py-2 text-sm text-white disabled:opacity-60"
          onClick={() => void onAddFund()}
          disabled={creating}
        >
          {creating ? "Adding..." : "Add Fund"}
        </button>
      </div>
      {status ? <p className="text-sm text-bm-muted2">{status}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {funds.map((fund) => (
          <Link key={fund.fund_id} href={`/app/repe/funds/${fund.fund_id}`} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 hover:bg-bm-surface/40">
            <p className="text-base font-semibold">{fund.name}</p>
            <p className="text-xs text-bm-muted2">
              {fund.strategy.toUpperCase()} · {fund.sub_strategy || "general"} · {fund.status}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

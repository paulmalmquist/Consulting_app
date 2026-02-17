"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  FinFund,
  FinPartition,
  createFinFund,
  listFinFunds,
  listFinPartitions,
  runFinCapitalRollforward,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

function makeIdempotencyKey(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}`;
}

export default function RepeFinancePage() {
  const { businessId } = useBusinessContext();
  const [partitions, setPartitions] = useState<FinPartition[]>([]);
  const [partitionId, setPartitionId] = useState<string>("");
  const [funds, setFunds] = useState<FinFund[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string>("");

  const [form, setForm] = useState({
    fund_code: "",
    name: "",
    strategy: "core",
    pref_rate: "0.08",
    carry_rate: "0.2",
    waterfall_style: "european" as "american" | "european",
  });

  const activePartition = useMemo(
    () => partitions.find((p) => p.partition_id === partitionId),
    [partitions, partitionId]
  );

  useEffect(() => {
    if (!businessId) return;
    listFinPartitions(businessId)
      .then((rows) => {
        setPartitions(rows);
        const live = rows.find((r) => r.partition_type === "live");
        if (live) setPartitionId(live.partition_id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load partitions"));
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !partitionId) return;
    setLoading(true);
    listFinFunds(businessId, partitionId)
      .then((rows) => setFunds(rows))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load funds"))
      .finally(() => setLoading(false));
  }, [businessId, partitionId]);

  async function onCreateFund(e: FormEvent) {
    e.preventDefault();
    if (!businessId || !partitionId) return;
    setError(null);

    try {
      await createFinFund({
        business_id: businessId,
        partition_id: partitionId,
        fund_code: form.fund_code,
        name: form.name,
        strategy: form.strategy,
        pref_rate: form.pref_rate,
        carry_rate: form.carry_rate,
        waterfall_style: form.waterfall_style,
      });
      setForm((f) => ({ ...f, fund_code: "", name: "" }));
      const rows = await listFinFunds(businessId, partitionId);
      setFunds(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fund");
    }
  }

  async function onRunRollforward(fundId: string) {
    if (!businessId || !partitionId) return;
    setRunStatus("Running rollforward...");
    setError(null);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const out = await runFinCapitalRollforward(fundId, {
        business_id: businessId,
        partition_id: partitionId,
        as_of_date: today,
        idempotency_key: makeIdempotencyKey("rollforward"),
      });
      setRunStatus(`Run ${out.run.fin_run_id.slice(0, 8)} completed (${out.run.status})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run rollforward");
      setRunStatus("");
    }
  }

  if (!businessId) {
    return <p className="text-sm text-bm-muted">Select or create a business to access Finance.</p>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">REPE Workspace</p>
        <h1 className="text-2xl font-bold">Private Equity Waterfall Operations</h1>
        <p className="text-sm text-bm-muted">
          Configure fund economics and run deterministic capital rollforwards. Waterfall and
          distribution flows post to structured ledgers.
        </p>
      </div>

      <section className="bm-glass rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Partition</h2>
        <select
          className="w-full md:w-96 rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
          value={partitionId}
          onChange={(e) => setPartitionId(e.target.value)}
        >
          {partitions.map((p) => (
            <option key={p.partition_id} value={p.partition_id}>
              {p.key} ({p.partition_type})
            </option>
          ))}
        </select>
        {activePartition && (
          <p className="text-xs text-bm-muted2">
            Active partition: <span className="font-mono">{activePartition.partition_id}</span>
          </p>
        )}
      </section>

      <section className="bm-glass rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Create Fund</h2>
        <form onSubmit={onCreateFund} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            placeholder="Fund code (e.g. GRF1)"
            value={form.fund_code}
            onChange={(e) => setForm((f) => ({ ...f, fund_code: e.target.value }))}
            required
          />
          <input
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            placeholder="Fund name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            placeholder="Strategy"
            value={form.strategy}
            onChange={(e) => setForm((f) => ({ ...f, strategy: e.target.value }))}
            required
          />
          <select
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={form.waterfall_style}
            onChange={(e) =>
              setForm((f) => ({ ...f, waterfall_style: e.target.value as "american" | "european" }))
            }
          >
            <option value="european">European (Whole Fund)</option>
            <option value="american">American (Deal-by-Deal)</option>
          </select>
          <input
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            placeholder="Preferred return (e.g. 0.08)"
            value={form.pref_rate}
            onChange={(e) => setForm((f) => ({ ...f, pref_rate: e.target.value }))}
            required
          />
          <input
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            placeholder="Carry rate (e.g. 0.2)"
            value={form.carry_rate}
            onChange={(e) => setForm((f) => ({ ...f, carry_rate: e.target.value }))}
            required
          />
          <div>
            <button type="submit" className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white">
              Create Fund
            </button>
          </div>
        </form>
      </section>

      <section className="bm-glass rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Funds</h2>
        {loading ? (
          <p className="text-sm text-bm-muted2">Loading funds...</p>
        ) : funds.length === 0 ? (
          <p className="text-sm text-bm-muted2">No funds found in this partition.</p>
        ) : (
          <div className="space-y-2">
            {funds.map((fund) => (
              <div
                key={fund.fin_fund_id}
                className="rounded-lg border border-bm-border/70 bg-bm-surface/60 px-3 py-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium">{fund.name}</p>
                  <p className="text-xs text-bm-muted2">
                    {fund.fund_code} · {fund.strategy} · Pref {fund.pref_rate} · Carry {fund.carry_rate}
                  </p>
                </div>
                <button
                  onClick={() => onRunRollforward(fund.fin_fund_id)}
                  className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface"
                >
                  Run Capital Rollforward
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {(error || runStatus) && (
        <div className="space-y-1">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {runStatus && <p className="text-sm text-bm-muted">{runStatus}</p>}
        </div>
      )}
    </div>
  );
}

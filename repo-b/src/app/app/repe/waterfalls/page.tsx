"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listReV1Funds,
  RepeFund,
  runReWaterfallShadow,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";

function currentQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}Q${q}`;
}

export default function RepeWaterfallsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [quarter, setQuarter] = useState(currentQuarter());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!businessId && !environmentId) return;
    listReV1Funds({
      env_id: environmentId || undefined,
      business_id: businessId || undefined,
    })
      .then((rows) => {
        setFunds(rows);
        setSelectedFundId(rows[0]?.fund_id || "");
      })
      .catch(() => setFunds([]));
  }, [businessId, environmentId]);

  const selectedFund = useMemo(
    () => funds.find((fund) => fund.fund_id === selectedFundId) || null,
    [funds, selectedFundId]
  );

  async function runWaterfall() {
    if (!selectedFundId) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await runReWaterfallShadow({
        fin_fund_id: selectedFundId,
        quarter,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run waterfall");
    } finally {
      setRunning(false);
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
      <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2" data-testid="re-waterfall-empty-funds">
        <h2 className="text-lg font-semibold">Run Waterfall</h2>
        <p className="text-sm text-bm-muted2">Waterfall runs are fund-scoped. Create a fund first.</p>
        <Link href={`${basePath}/funds/new`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Create Fund
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-4" data-testid="re-waterfall-runner">
      <div>
        <h2 className="text-lg font-semibold">Run Waterfall</h2>
        <p className="text-sm text-bm-muted2">Execute a fund-level waterfall for the selected quarter.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Fund
          <select
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
          >
            {funds.map((fund) => (
              <option key={fund.fund_id} value={fund.fund_id}>{fund.name}</option>
            ))}
          </select>
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Quarter
          <input
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            placeholder="2026Q1"
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runWaterfall()}
          className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white disabled:opacity-40"
          disabled={running || !selectedFundId}
        >
          {running ? "Running..." : "Run Waterfall"}
        </button>
        {selectedFund ? (
          <Link href={`${basePath}/funds/${selectedFund.fund_id}`} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
            Back to Fund
          </Link>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {result ? (
        <div className="rounded-lg border border-bm-border/70 bg-bm-surface/20 p-3">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Latest Run Output</p>
          <pre className="mt-2 max-h-80 overflow-auto text-xs text-bm-muted2">{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  );
}

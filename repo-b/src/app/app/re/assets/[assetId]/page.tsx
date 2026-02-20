"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  computeReSurveillance,
  getReAssetQuarterState,
  runReStress,
  ReAssetFinancialState,
} from "@/lib/bos-api";

function pickQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}Q${q}`;
}

export default function ReAssetPage() {
  const params = useParams<{ assetId: string }>();
  const assetId = String(params.assetId);
  const [quarter, setQuarter] = useState(pickQuarter());
  const [state, setState] = useState<ReAssetFinancialState | null>(null);
  const [surveillance, setSurveillance] = useState<Record<string, unknown> | null>(null);
  const [stress, setStress] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await getReAssetQuarterState(assetId, quarter);
      setState(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load asset state");
    }
  }, [assetId, quarter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSurveillance() {
    setError(null);
    try {
      const out = await computeReSurveillance({ fin_asset_investment_id: assetId, quarter });
      setSurveillance(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compute surveillance");
    }
  }

  async function runStressNow() {
    setError(null);
    try {
      const out = await runReStress({ fin_asset_investment_id: assetId, quarter });
      setStress(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run stress");
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <h1 className="text-xl font-semibold">RE Asset</h1>
        <p className="text-sm text-bm-muted2">Asset: {assetId}</p>
        <label className="mt-3 block text-xs uppercase tracking-[0.12em] text-bm-muted2">
          Quarter
          <input
            className="mt-1 rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
          />
        </label>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-bm-border/70 p-4"><p className="text-xs text-bm-muted2">NOI</p><p className="mt-2 text-lg font-semibold">{state?.net_operating_income ?? "-"}</p></div>
        <div className="rounded-xl border border-bm-border/70 p-4"><p className="text-xs text-bm-muted2">NAV Equity</p><p className="mt-2 text-lg font-semibold">{state?.nav_equity ?? "-"}</p></div>
        <div className="rounded-xl border border-bm-border/70 p-4"><p className="text-xs text-bm-muted2">DSCR</p><p className="mt-2 text-lg font-semibold">{state?.dscr ?? "-"}</p></div>
        <div className="rounded-xl border border-bm-border/70 p-4"><p className="text-xs text-bm-muted2">LTV</p><p className="mt-2 text-lg font-semibold">{state?.ltv ?? "-"}</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void runStressNow()} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">Run Stress</button>
        <button type="button" onClick={() => void runSurveillance()} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">Compute Surveillance</button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-bm-border/70 p-4">
          <h2 className="text-base font-semibold">Stress Results</h2>
          <div className="mt-2 space-y-2">
            {stress.length === 0 ? <p className="text-sm text-bm-muted2">No stress results.</p> : null}
            {stress.map((row, idx) => (
              <pre key={idx} className="overflow-auto rounded-lg border border-bm-border/50 bg-bm-surface/20 p-2 text-xs">{JSON.stringify(row, null, 2)}</pre>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-bm-border/70 p-4">
          <h2 className="text-base font-semibold">Surveillance</h2>
          {!surveillance ? <p className="mt-2 text-sm text-bm-muted2">No surveillance snapshot.</p> : null}
          {surveillance ? <pre className="mt-2 overflow-auto rounded-lg border border-bm-border/50 bg-bm-surface/20 p-2 text-xs">{JSON.stringify(surveillance, null, 2)}</pre> : null}
        </div>
      </div>
    </section>
  );
}

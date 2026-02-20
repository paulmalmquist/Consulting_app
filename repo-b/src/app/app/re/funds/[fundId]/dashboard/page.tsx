"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { computeReFundSummary, getReFundSummary, ReFundSummary } from "@/lib/bos-api";

function pickQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}Q${q}`;
}

export default function ReFundDashboardPage() {
  const params = useParams<{ fundId: string }>();
  const fundId = String(params.fundId);
  const [quarter, setQuarter] = useState(pickQuarter());
  const [summary, setSummary] = useState<ReFundSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (doCompute: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = doCompute
        ? await computeReFundSummary({ fin_fund_id: fundId, quarter })
        : await getReFundSummary(fundId, quarter);
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fund summary");
    } finally {
      setLoading(false);
    }
  }, [fundId, quarter]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const concentration = useMemo(() => {
    const raw = summary?.concentration_json;
    if (!raw || typeof raw !== "object") return [] as Array<{ asset_id: string; nav_share: string }>;
    const assets = (raw as Record<string, unknown>).assets;
    return Array.isArray(assets) ? (assets as Array<{ asset_id: string; nav_share: string }>) : [];
  }, [summary]);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <h1 className="text-xl font-semibold">RE Fund Dashboard</h1>
        <p className="text-sm text-bm-muted2">Fund: {fundId}</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
            Quarter
            <input
              className="mt-1 rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void load(true)}
            className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white"
            disabled={loading}
          >
            Recompute
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-bm-border/70 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Portfolio NAV</p>
          <p className="mt-2 text-xl font-semibold">{summary?.portfolio_nav ?? "-"}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">TVPI</p>
          <p className="mt-2 text-xl font-semibold">{summary?.tvpi ?? "-"}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">DPI / RVPI</p>
          <p className="mt-2 text-xl font-semibold">{summary ? `${summary.dpi ?? "-"} / ${summary.rvpi ?? "-"}` : "-"}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Weighted LTV</p>
          <p className="mt-2 text-xl font-semibold">{summary?.weighted_ltv ?? "-"}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Weighted DSCR</p>
          <p className="mt-2 text-xl font-semibold">{summary?.weighted_dscr ?? "-"}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Waterfall Snapshot</p>
          <p className="mt-2 text-sm break-all">{summary?.waterfall_snapshot_id ?? "-"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-bm-border/70 p-4">
        <h2 className="text-base font-semibold">Concentration (Server-Computed)</h2>
        <div className="mt-2 space-y-2">
          {concentration.length === 0 ? <p className="text-sm text-bm-muted2">No concentration data.</p> : null}
          {concentration.map((row) => (
            <div key={row.asset_id} className="flex items-center justify-between rounded-lg border border-bm-border/50 px-3 py-2 text-sm">
              <span className="font-mono">{row.asset_id}</span>
              <span>{row.nav_share}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

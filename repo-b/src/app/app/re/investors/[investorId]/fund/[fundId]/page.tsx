"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getReInvestorStatement, ReInvestorStatement } from "@/lib/bos-api";

function pickQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}Q${q}`;
}

export default function ReInvestorFundPage() {
  const params = useParams<{ investorId: string; fundId: string }>();
  const investorId = String(params.investorId);
  const fundId = String(params.fundId);
  const [quarter, setQuarter] = useState(pickQuarter());
  const [statement, setStatement] = useState<ReInvestorStatement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const out = await getReInvestorStatement(investorId, fundId, quarter);
      setStatement(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load investor statement");
    }
  }, [investorId, fundId, quarter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <h1 className="text-xl font-semibold">Investor Capital Account</h1>
        <p className="text-sm text-bm-muted2">Investor: {investorId}</p>
        <p className="text-sm text-bm-muted2">Fund: {fundId}</p>
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
        <div className="rounded-xl border border-bm-border/70 p-4"><p className="text-xs text-bm-muted2">Contributions</p><p className="mt-2 text-lg font-semibold">{statement?.contributions ?? "-"}</p></div>
        <div className="rounded-xl border border-bm-border/70 p-4"><p className="text-xs text-bm-muted2">Distributions</p><p className="mt-2 text-lg font-semibold">{statement?.distributions ?? "-"}</p></div>
        <div className="rounded-xl border border-bm-border/70 p-4"><p className="text-xs text-bm-muted2">NAV Share</p><p className="mt-2 text-lg font-semibold">{statement?.nav_share ?? "-"}</p></div>
        <div className="rounded-xl border border-bm-border/70 p-4"><p className="text-xs text-bm-muted2">TVPI</p><p className="mt-2 text-lg font-semibold">{statement?.tvpi ?? "-"}</p></div>
      </div>

      <div className="rounded-xl border border-bm-border/70 p-4">
        <h2 className="text-base font-semibold">Performance Metrics</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="rounded-lg border border-bm-border/50 p-3 text-sm">DPI: <strong>{statement?.dpi ?? "-"}</strong></div>
          <div className="rounded-lg border border-bm-border/50 p-3 text-sm">RVPI: <strong>{statement?.rvpi ?? "-"}</strong></div>
          <div className="rounded-lg border border-bm-border/50 p-3 text-sm">TVPI: <strong>{statement?.tvpi ?? "-"}</strong></div>
        </div>
      </div>
    </section>
  );
}

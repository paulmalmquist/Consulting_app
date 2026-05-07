"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { fetchJson } from "@/lib/fetchJson";

interface EnvSpend {
  env_id: string;
  client_name: string;
  total_calls: number;
  total_cost_cents: number;
  open_recs: number;
  potential_savings_cents: number;
}

const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;
const fmtInt = (n: number) => n.toLocaleString("en-US");

/**
 * System-level AI Usage overview.
 *
 * Lists every environment the user has access to with a 30-day spend rollup
 * and a count of open recommendations. Each row links into the per-env
 * dashboard at /lab/env/[envId]/ai-usage.
 *
 * The data here is best-effort: each env's summary endpoint is hit in parallel.
 * Envs that error out show "—" rather than failing the whole page.
 */
export default function SystemAiUsagePage() {
  const { environments: availableEnvs } = useEnv();
  const [rows, setRows] = useState<EnvSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!availableEnvs?.length) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all(
      availableEnvs.map(async (env): Promise<EnvSpend> => {
        try {
          const [summary, recs] = await Promise.all([
            fetchJson<{ total_calls: number; total_cost_cents: number }>(
              `/api/ai-usage/v1/summary?env_id=${env.env_id}&days=30`
            ),
            fetchJson<{ rows: Array<{ est_monthly_savings_cents?: number }> }>(
              `/api/ai-usage/v1/recommendations?env_id=${env.env_id}`
            ),
          ]);
          const potential = (recs.rows ?? []).reduce(
            (s: number, r: { est_monthly_savings_cents?: number }) => s + (r.est_monthly_savings_cents || 0),
            0
          );
          return {
            env_id: env.env_id,
            client_name: env.client_name || env.env_id.slice(0, 8),
            total_calls: summary.total_calls || 0,
            total_cost_cents: summary.total_cost_cents || 0,
            open_recs: (recs.rows ?? []).length,
            potential_savings_cents: potential,
          };
        } catch {
          return {
            env_id: env.env_id,
            client_name: env.client_name || env.env_id.slice(0, 8),
            total_calls: 0,
            total_cost_cents: 0,
            open_recs: 0,
            potential_savings_cents: 0,
          };
        }
      })
    )
      .then((results) => setRows(results.sort((a, b) => b.total_cost_cents - a.total_cost_cents)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [availableEnvs]);

  const totalCost = rows.reduce((s, r) => s + r.total_cost_cents, 0);
  const totalCalls = rows.reduce((s, r) => s + r.total_calls, 0);
  const totalRecs = rows.reduce((s, r) => s + r.open_recs, 0);
  const totalSavings = rows.reduce((s, r) => s + r.potential_savings_cents, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-bm-text">AI Usage</h1>
        <p className="mt-0.5 font-mono text-xs text-bm-muted2">
          System-level overview · last 30 days · all environments you have access to
        </p>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-bm-muted2 animate-pulse">Loading…</p>
      ) : error ? (
        <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 p-4">
          <p className="font-mono text-xs text-bm-danger">Failed to load: {error}</p>
        </div>
      ) : rows.length === 0 ? (
        <p className="font-mono text-xs text-bm-muted2">
          No environments with access yet. Provision one from the Control Tower.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="30-Day Spend" value={fmtCents(totalCost)} />
            <Stat label="API Calls" value={fmtInt(totalCalls)} />
            <Stat label="Open Recommendations" value={fmtInt(totalRecs)} />
            <Stat label="Potential Monthly Savings" value={fmtCents(totalSavings)} />
          </div>

          <section>
            <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Spend by Environment
            </h2>
            <div className="overflow-x-auto rounded-lg border border-bm-border/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/40 bg-bm-surface2/40">
                    {["Environment", "Calls", "30-Day Cost", "Open Recs", "Potential Savings", ""].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.env_id} className="border-b border-bm-border/20 hover:bg-bm-surface2/30">
                      <td className="px-3 py-2 text-bm-text">{r.client_name}</td>
                      <td className="px-3 py-2 tabular-nums text-bm-text">{fmtInt(r.total_calls)}</td>
                      <td className="px-3 py-2 tabular-nums text-bm-text">{fmtCents(r.total_cost_cents)}</td>
                      <td className="px-3 py-2 tabular-nums text-bm-text">{fmtInt(r.open_recs)}</td>
                      <td className="px-3 py-2 tabular-nums text-bm-text">{fmtCents(r.potential_savings_cents)}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/lab/env/${r.env_id}/ai-usage`}
                          className="font-mono text-[10px] text-bm-accent hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface2/30 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-bm-text">{value}</p>
    </div>
  );
}

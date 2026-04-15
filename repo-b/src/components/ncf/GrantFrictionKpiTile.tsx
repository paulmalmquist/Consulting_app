"use client";

import { useEffect, useState } from "react";

type Summary = {
  env_id: string;
  count_high: number;
  count_watch: number;
  count_low: number;
  count_scored: number;
  latest_prediction_at: string | null;
  model_version: string | null;
};

type Props = {
  envId: string;
  onClick?: () => void;
  isActive?: boolean;
};

export default function GrantFrictionKpiTile({ envId, onClick, isActive }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/ncf/grant-friction/summary?env_id=${encodeURIComponent(envId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`http ${r.status}`))))
      .then((data: Summary) => {
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [envId]);

  const atRisk = summary ? summary.count_high + summary.count_watch : null;
  const unavailable = !loading && (error !== null || summary === null || summary.count_scored === 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-[22px] border bg-white p-5 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#1ba6d9]/40 ${
        isActive ? "ring-2 ring-[#1ba6d9]/60" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ backgroundColor: "#eef6e9", color: "#3f7a24" }}
        >
          Operational
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
          Model-scored
        </span>
      </div>
      <div className="mt-5 text-[11px] uppercase tracking-[0.16em] text-slate-500">
        Grants at Watch or Higher
      </div>
      {loading ? (
        <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-300">…</div>
      ) : unavailable ? (
        <div className="mt-1 text-sm font-medium leading-6 text-slate-500">
          Not available in current context.
        </div>
      ) : (
        <>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {atRisk?.toLocaleString() ?? "—"}
          </div>
          <div className="mt-2 text-xs text-slate-600">
            {summary?.count_high ?? 0} high &middot; {summary?.count_watch ?? 0} watch
          </div>
        </>
      )}
      <div className="mt-4 text-[11px] text-slate-400 group-hover:text-slate-600">
        Click for provenance &rarr;
      </div>
    </button>
  );
}

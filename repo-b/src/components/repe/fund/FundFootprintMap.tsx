"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { StateCard } from "@/components/ui/StateCard";
import { getAssetMapPoints, type AssetMapResponse } from "@/lib/bos-api";

const MapInner = dynamic(() => import("./FundFootprintMapInner"), { ssr: false });

type StatusFilter = "all" | "owned" | "pipeline" | "disposed";

const STATUS_CHIPS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Owned", value: "owned" },
  { label: "Pipeline", value: "pipeline" },
  { label: "Disposed", value: "disposed" },
];

const PANEL_CLASS =
  "rounded-[22px] border border-[#E2E8F0] bg-[#F8FAFC] shadow-[0_1px_2px_rgba(0,0,0,0.05)]";

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#64748B]">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums text-[#0F172A]">{String(value)}</p>
    </div>
  );
}

export function FundFootprintMap({
  envId,
  businessId,
  fundId,
}: {
  envId: string;
  businessId: string | null;
  fundId: string;
}) {
  const [data, setData] = useState<AssetMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!fundId) return;
    setLoading(true);
    getAssetMapPoints({
      env_id: envId,
      business_id: businessId ?? undefined,
      fund_id: fundId,
    })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [envId, businessId, fundId]);

  const points = data?.points ?? [];
  const filtered = filter === "all" ? points : points.filter((p) => p.status === filter);
  const summary = data?.summary;

  return (
    <div className={`${PANEL_CLASS} p-5`} data-testid="fund-footprint-map">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">Geographic Footprint</p>
          <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#0F172A]">Fund Footprint</h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-[#64748B]">
          Where the fund&apos;s owned, pipeline, and disposed assets are located across markets.
        </p>
      </div>

      <div className="mt-4">
        {loading ? (
          <StateCard state="loading" />
        ) : !data || points.length === 0 ? (
          <StateCard
            state="empty"
            title="No asset locations available yet"
            description="Map will populate once assets in this fund have location metadata (latitude/longitude)."
          />
        ) : (
          <div className="space-y-4">
            {/* Summary callouts */}
            <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-[#E2E8F0]/40 pb-3">
              <SummaryMetric label="Owned" value={summary?.owned_assets ?? 0} />
              <SummaryMetric label="Pipeline" value={summary?.pipeline_assets ?? 0} />
              <SummaryMetric label="Disposed" value={summary?.disposed_assets ?? 0} />
              <SummaryMetric label="Markets" value={summary?.markets ?? 0} />
            </div>

            {/* Status filter chips */}
            <div className="flex gap-1.5">
              {STATUS_CHIPS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setFilter(s.value)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors ${
                    filter === s.value
                      ? "bg-blue-500/15 text-blue-600"
                      : "text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Map */}
            <div className="h-[240px] sm:h-[340px] rounded-lg overflow-hidden border border-[#E2E8F0]/50">
              {mounted && <MapInner points={filtered} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

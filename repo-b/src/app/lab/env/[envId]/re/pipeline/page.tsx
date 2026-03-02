"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Plus, Building2, Loader2 } from "lucide-react";

import { bosFetch } from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import DealStatusBadge from "@/components/repe/pipeline/DealStatusBadge";
import DealFilterBar from "@/components/repe/pipeline/DealFilterBar";

const PipelineMap = dynamic(
  () => import("@/components/repe/pipeline/PipelineMap"),
  { ssr: false },
);

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */
type Deal = {
  deal_id: string;
  env_id: string;
  deal_name: string;
  status: string;
  source?: string;
  strategy?: string;
  property_type?: string;
  target_close_date?: string;
  headline_price?: number | null;
  target_irr?: number | null;
  target_moic?: number | null;
  notes?: string;
  created_at: string;
};

type MapMarker = {
  deal_id: string;
  deal_name: string;
  status: string;
  lat: number;
  lon: number;
  property_name?: string;
  property_type?: string;
  headline_price?: number | string | null;
};

/* ------------------------------------------------------------------ */
/* Format helpers                                                       */
/* ------------------------------------------------------------------ */
function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "--";
  const n = Number(v);
  if (Number.isNaN(n) || !n) return "--";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const STRATEGY_LABELS: Record<string, string> = {
  core: "Core",
  core_plus: "Core Plus",
  value_add: "Value Add",
  opportunistic: "Opportunistic",
  debt: "Debt",
  development: "Development",
};

/* ------------------------------------------------------------------ */
/* Inner page (reads useSearchParams)                                   */
/* ------------------------------------------------------------------ */
function PipelinePageInner() {
  const { envId } = useReEnv();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [strategy, setStrategy] = useState(searchParams.get("strategy") ?? "");

  /* ---- Fetch deals ---- */
  const fetchDeals = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: envId,
        status: status || undefined,
        strategy: strategy || undefined,
      };
      const data = await bosFetch<Deal[]>("/api/re/v2/pipeline/deals", { params });
      setDeals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [envId, status, strategy]);

  /* ---- Fetch map markers ---- */
  const fetchMarkers = useCallback(async () => {
    if (!envId) return;
    try {
      const data = await bosFetch<MapMarker[]>("/api/re/v2/pipeline/map/markers", {
        params: {
          env_id: envId,
          // fetch all US markers initially
          sw_lat: "24.0",
          sw_lon: "-125.0",
          ne_lat: "50.0",
          ne_lon: "-66.0",
        },
      });
      setMarkers(data);
    } catch {
      // markers are optional; silently fail
    }
  }, [envId]);

  useEffect(() => {
    fetchDeals();
    fetchMarkers();
  }, [fetchDeals, fetchMarkers]);

  /* ---- Navigate to deal detail on marker click ---- */
  function handleMarkerClick(dealId: string) {
    router.push(`/lab/env/${envId}/re/pipeline/${dealId}`);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-bm-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-bm-text">Deal Pipeline</h1>
          <p className="text-sm text-bm-muted">
            {deals.length} deal{deals.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <DealFilterBar
            status={status}
            strategy={strategy}
            onStatusChange={setStatus}
            onStrategyChange={setStrategy}
          />
          <Link
            href={`/lab/env/${envId}/re/pipeline/new`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New Deal
          </Link>
        </div>
      </div>

      {/* Body: split panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: deal list (40%) */}
        <div className="w-2/5 overflow-y-auto border-r border-bm-border">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
            </div>
          )}

          {error && (
            <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && deals.length === 0 && (
            <div className="py-16 text-center text-sm text-bm-muted">
              No deals match the current filters.
            </div>
          )}

          {!loading &&
            deals.map((deal) => (
              <Link
                key={deal.deal_id}
                href={`/lab/env/${envId}/re/pipeline/${deal.deal_id}`}
                className="block border-b border-bm-border px-5 py-4 transition-colors hover:bg-bm-surface/40"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-bm-muted" />
                  <span className="font-medium text-bm-text">{deal.deal_name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <DealStatusBadge status={deal.status} />
                  {deal.headline_price != null && (
                    <span className="text-xs text-bm-muted">{fmtMoney(deal.headline_price)}</span>
                  )}
                  {deal.strategy && (
                    <span className="text-xs text-bm-muted">
                      {STRATEGY_LABELS[deal.strategy] ?? deal.strategy}
                    </span>
                  )}
                  {deal.property_type && (
                    <span className="text-xs text-bm-muted">{deal.property_type}</span>
                  )}
                </div>
              </Link>
            ))}
        </div>

        {/* Right: map (60%) */}
        <div className="w-3/5 bg-bm-bg">
          <PipelineMap markers={markers} onMarkerClick={handleMarkerClick} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Default export: wrapped in Suspense for useSearchParams              */
/* ------------------------------------------------------------------ */
export default function PipelinePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
        </div>
      }
    >
      <PipelinePageInner />
    </Suspense>
  );
}

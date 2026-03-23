"use client";

/* ── UW vs Actual Detail Page ─────────────────────────────────────
   Side-by-side metric comparison, attribution bridge chart,
   and lineage panel for a single entity.
   ────────────────────────────────────────────────────────────────── */

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import MetricComparisonCard from "@/components/repe/reports/MetricComparisonCard";
import AttributionBridgeChart, {
  BridgeDriver,
} from "@/components/repe/reports/AttributionBridgeChart";
import LineagePanel, {
  LineageInfo,
} from "@/components/repe/reports/LineagePanel";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────────────── */

interface MetricsBlock {
  irr: number | null;
  equity_multiple: number | null;
  nav: number | null;
  tvpi: number | null;
  dpi: number | null;
}

interface DetailResponse {
  entity_id: string;
  name: string;
  level: string;
  quarter: string;
  baseline: string;
  uw_metrics: MetricsBlock;
  actual_metrics: MetricsBlock;
  deltas: MetricsBlock;
  lineage: LineageInfo;
}

interface BridgeResponse {
  entity_id: string;
  level: string;
  quarter: string;
  baseline: string;
  mode: string;
  drivers: BridgeDriver[];
  total_irr_impact_bps: number;
  uw_irr: number;
  actual_irr: number;
}

/* ── API helpers (inline until bos-api.ts is extended) ─────────── */

async function fetchDetail(
  level: string,
  entityId: string,
  params: { asof: string; baseline: string },
): Promise<DetailResponse> {
  const { bosFetch } = await import("@/lib/bos-api");
  return bosFetch(`/api/re/v2/reports/uw-vs-actual/${level}/${entityId}`, {
    params: {
      asof: params.asof,
      baseline: params.baseline,
    },
  });
}

async function fetchBridge(
  level: string,
  entityId: string,
  params: { asof: string; baseline: string },
): Promise<BridgeResponse> {
  const { bosFetch } = await import("@/lib/bos-api");
  return bosFetch(
    `/api/re/v2/reports/uw-vs-actual/${level}/${entityId}/bridge`,
    {
      method: "POST",
      params: {
        asof: params.asof,
        baseline: params.baseline,
        mode: "fast",
      },
    },
  );
}

/* ── Inner component (uses useSearchParams) ───────────────────── */

function UwVsActualDetailInner() {
  const { envId } = useReEnv();
  const params = useParams();
  const searchParams = useSearchParams();

  const level = params.level as string;
  const entityId = params.entityId as string;
  const asof = searchParams.get("asof") || "2024Q4";
  const baseline = searchParams.get("baseline") || "IO";

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [bridge, setBridge] = useState<BridgeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId || !level) return;
    setLoading(true);
    setError(null);

    const queryParams = { asof, baseline };

    Promise.allSettled([
      fetchDetail(level, entityId, queryParams),
      fetchBridge(level, entityId, queryParams),
    ]).then(([detailRes, bridgeRes]) => {
      if (detailRes.status === "fulfilled") {
        setDetail(detailRes.value);
      } else {
        setError("Failed to load detail metrics");
      }
      if (bridgeRes.status === "fulfilled") {
        setBridge(bridgeRes.value);
      }
      // Bridge failure is non-fatal -- detail still renders
      setLoading(false);
    });
  }, [entityId, level, asof, baseline]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-bm-muted2">Loading detail...</div>
    );
  }

  if (error && !detail) {
    return (
      <section className="space-y-4">
        <Link
          href={`/lab/env/${envId}/re/reports/uw-vs-actual`}
          className="inline-flex items-center gap-1 text-xs text-bm-muted2 hover:text-bm-text transition-colors"
        >
          <ArrowLeft size={12} />
          Back to Scorecard
        </Link>
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      </section>
    );
  }

  if (!detail) return null;

  const uw = detail.uw_metrics;
  const act = detail.actual_metrics;

  return (
    <section className="space-y-5" data-testid="uw-vs-actual-detail-page">
      {/* Header */}
      <div>
        <Link
          href={`/lab/env/${envId}/re/reports/uw-vs-actual`}
          className="inline-flex items-center gap-1 text-xs text-bm-muted2 hover:text-bm-text transition-colors mb-2"
        >
          <ArrowLeft size={12} />
          Back to Scorecard
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{detail.name}</h1>
        <p className="mt-1 text-sm text-bm-muted2">
          {detail.level} &middot; {detail.quarter} &middot; Baseline:{" "}
          {detail.baseline}
        </p>
      </div>

      {/* Metric Comparison Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricComparisonCard
          label="IRR"
          uwValue={uw.irr}
          actualValue={act.irr}
          unit="%"
        />
        <MetricComparisonCard
          label="Equity Multiple (MOIC)"
          uwValue={uw.equity_multiple}
          actualValue={act.equity_multiple}
          unit="x"
        />
        <MetricComparisonCard
          label="NAV"
          uwValue={uw.nav}
          actualValue={act.nav}
          unit="$"
        />
        <MetricComparisonCard
          label="TVPI"
          uwValue={uw.tvpi}
          actualValue={act.tvpi}
          unit="x"
        />
        <MetricComparisonCard
          label="DPI"
          uwValue={uw.dpi}
          actualValue={act.dpi}
          unit="x"
        />
      </div>

      {/* Attribution Bridge Chart */}
      {bridge && (
        <AttributionBridgeChart
          drivers={bridge.drivers}
          uw_irr={bridge.uw_irr}
          actual_irr={bridge.actual_irr}
        />
      )}

      {/* Lineage Panel */}
      {detail.lineage && <LineagePanel lineage={detail.lineage} />}
    </section>
  );
}

/* ── Exported page with Suspense boundary ─────────────────────── */

export default function UwVsActualDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-bm-muted2">Loading...</div>
      }
    >
      <UwVsActualDetailInner />
    </Suspense>
  );
}

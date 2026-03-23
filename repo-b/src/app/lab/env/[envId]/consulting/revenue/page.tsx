"use client";

import { useEffect, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";

type MetricsSnapshot = {
  id: string;
  weighted_pipeline: number;
  unweighted_pipeline: number;
  open_opportunities: number;
  close_rate_90d: number | null;
  won_count_90d: number;
  lost_count_90d: number;
  outreach_count_30d: number;
  response_rate_30d: number | null;
  meetings_30d: number;
  revenue_mtd: number;
  revenue_qtd: number;
  forecast_90d: number;
  avg_deal_size: number | null;
  avg_margin_pct: number | null;
  active_engagements: number;
  active_clients: number;
  snapshot_date: string;
  computed_at: string;
};

function fmtCurrency(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

type MetricCardProps = {
  label: string;
  value: string;
  subtitle?: string;
};

function MetricCard({ label, value, subtitle }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">{label}</p>
        <p className="text-2xl font-semibold mt-1 truncate">{value}</p>
        {subtitle && <p className="text-xs text-bm-muted mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function RevenuePage({
  params,
}: {
  params: { envId: string };
}) {
  const { businessId } = useConsultingEnv();
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    apiFetch<MetricsSnapshot>(
      `/bos/api/consulting/metrics/latest?env_id=${params.envId}&business_id=${businessId}`,
    )
      .then(setMetrics)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [businessId, params.envId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-24 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Revenue Section */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Revenue Intelligence
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Revenue MTD"
            value={fmtCurrency(metrics?.revenue_mtd ?? 0)}
          />
          <MetricCard
            label="Revenue QTD"
            value={fmtCurrency(metrics?.revenue_qtd ?? 0)}
          />
          <MetricCard
            label="Forecast (90d)"
            value={fmtCurrency(metrics?.forecast_90d ?? 0)}
          />
          <MetricCard
            label="Avg Deal Size"
            value={fmtCurrency(metrics?.avg_deal_size ?? null)}
          />
        </div>
      </div>

      {/* Pipeline Section */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Pipeline Health
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Weighted Pipeline"
            value={fmtCurrency(metrics?.weighted_pipeline ?? 0)}
            subtitle={`${fmtCurrency(metrics?.unweighted_pipeline ?? 0)} unweighted`}
          />
          <MetricCard
            label="Open Opportunities"
            value={String(metrics?.open_opportunities ?? 0)}
          />
          <MetricCard
            label="Close Rate (90d)"
            value={fmtPct(metrics?.close_rate_90d ?? null)}
            subtitle={`${metrics?.won_count_90d ?? 0} won / ${metrics?.lost_count_90d ?? 0} lost`}
          />
          <MetricCard
            label="Avg Margin"
            value={fmtPct(metrics?.avg_margin_pct ?? null)}
          />
        </div>
      </div>

      {/* Outreach & Engagement Section */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Activity & Delivery
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Outreach (30d)"
            value={String(metrics?.outreach_count_30d ?? 0)}
          />
          <MetricCard
            label="Response Rate (30d)"
            value={fmtPct(metrics?.response_rate_30d ?? null)}
          />
          <MetricCard
            label="Meetings (30d)"
            value={String(metrics?.meetings_30d ?? 0)}
          />
          <MetricCard
            label="Active Engagements"
            value={String(metrics?.active_engagements ?? 0)}
            subtitle={`${metrics?.active_clients ?? 0} active clients`}
          />
        </div>
      </div>

      {/* Snapshot metadata */}
      {metrics && (
        <div className="text-xs text-bm-muted2 text-right">
          Snapshot: {metrics.snapshot_date} · Computed: {new Date(metrics.computed_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}

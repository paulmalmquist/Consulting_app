"use client";

import { useEffect, useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { MetricCard } from "@/components/ui/MetricCard";
import { InsightRail, type InsightSection } from "@/components/ui/InsightRail";
import { QuickActions, type QuickAction } from "@/components/ui/QuickActions";
import { apiFetch } from "@/lib/api";

type MetricsSnapshot = {
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
  active_engagements: number;
  active_clients: number;
};

function fmtCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function ConsultingCommandCenter({
  params,
}: {
  params: { envId: string };
}) {
  const { businessId } = useConsultingEnv();
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);

  useEffect(() => {
    if (!businessId) return;
    apiFetch<MetricsSnapshot>(
      `/bos/api/consulting/metrics/latest?env_id=${params.envId}&business_id=${businessId}`,
    )
      .then(setMetrics)
      .catch(() => null);
  }, [businessId, params.envId]);

  const m = metrics;
  const base = `/lab/env/${params.envId}/consulting`;

  const quickActions = useMemo<QuickAction[]>(
    () => [
      { label: "Add Lead", href: `${base}/outreach` },
      { label: "Log Outreach", href: `${base}/outreach` },
      { label: "Create Proposal", href: `${base}/proposals` },
      { label: "Convert to Client", href: `${base}/clients` },
      { label: "View Pipeline", href: `${base}/pipeline` },
      { label: "Revenue Dashboard", href: `${base}/revenue` },
    ],
    [base],
  );

  const insightSections = useMemo<InsightSection[]>(() => {
    const sections: InsightSection[] = [];

    // Top opportunities insight
    if (m && m.open_opportunities > 0) {
      sections.push({
        title: "Pipeline Health",
        items: [
          {
            id: "open-deals",
            severity: m.open_opportunities > 10 ? "info" : "warning",
            label: `${m.open_opportunities} open deals`,
            detail: `Weighted: ${fmtCurrency(m.weighted_pipeline)}`,
            action: { label: "Pipeline", href: `${base}/pipeline` },
          },
          ...(m.won_count_90d > 0
            ? [
                {
                  id: "won-90d",
                  severity: "info" as const,
                  label: `${m.won_count_90d} won (90d)`,
                  detail: `Close rate: ${fmtPct(m.close_rate_90d)}`,
                },
              ]
            : []),
          ...(m.lost_count_90d > 0
            ? [
                {
                  id: "lost-90d",
                  severity: "warning" as const,
                  label: `${m.lost_count_90d} lost (90d)`,
                  detail: "Review lost deal patterns",
                  action: { label: "Review", href: `${base}/pipeline` },
                },
              ]
            : []),
        ],
      });
    }

    // Outreach performance
    sections.push({
      title: "Outreach Performance",
      items: [
        {
          id: "outreach-volume",
          severity:
            m && m.outreach_count_30d > 0 ? "info" : "critical",
          label: `${m?.outreach_count_30d ?? 0} outreach (30d)`,
          detail: m
            ? `Response rate: ${fmtPct(m.response_rate_30d)}`
            : "No data yet",
          action: { label: "Outreach", href: `${base}/outreach` },
        },
        {
          id: "meetings",
          severity: m && m.meetings_30d > 0 ? "info" : "warning",
          label: `${m?.meetings_30d ?? 0} meetings (30d)`,
          detail: "Scheduled meetings this period",
        },
      ],
    });

    return sections;
  }, [m, base]);

  return (
    <div className="space-y-6">
      {/* Hero Revenue Strip */}
      <div>
        <p className="bm-section-label mb-3">Revenue Overview</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard
            label="Weighted Pipeline"
            value={fmtCurrency(m?.weighted_pipeline)}
            size="large"
            status={m && m.weighted_pipeline > 0 ? "success" : "neutral"}
          />
          <MetricCard
            label="Forecast (90d)"
            value={fmtCurrency(m?.forecast_90d)}
            size="large"
          />
          <MetricCard
            label="Revenue MTD"
            value={fmtCurrency(m?.revenue_mtd)}
            size="large"
            status={m && m.revenue_mtd > 0 ? "success" : "neutral"}
          />
          <MetricCard
            label="Close Rate (90d)"
            value={fmtPct(m?.close_rate_90d)}
            size="large"
          />
          <MetricCard
            label="Outreach (30d)"
            value={String(m?.outreach_count_30d ?? 0)}
            size="large"
          />
          <MetricCard
            label="Active Engagements"
            value={String(m?.active_engagements ?? 0)}
            size="large"
          />
        </div>
      </div>

      {/* Execution Strip */}
      <div>
        <p className="bm-section-label mb-3">Execution Snapshot</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard
            label="Open Deals"
            value={String(m?.open_opportunities ?? 0)}
            size="compact"
          />
          <MetricCard
            label="Active Clients"
            value={String(m?.active_clients ?? 0)}
            size="compact"
          />
          <MetricCard
            label="Avg Deal Size"
            value={fmtCurrency(m?.avg_deal_size)}
            size="compact"
          />
          <MetricCard
            label="Won (90d)"
            value={String(m?.won_count_90d ?? 0)}
            size="compact"
            status={m && m.won_count_90d > 0 ? "success" : "neutral"}
          />
          <MetricCard
            label="Lost (90d)"
            value={String(m?.lost_count_90d ?? 0)}
            size="compact"
            status={m && m.lost_count_90d > 0 ? "warning" : "neutral"}
          />
          <MetricCard
            label="Revenue QTD"
            value={fmtCurrency(m?.revenue_qtd)}
            size="compact"
          />
        </div>
      </div>

      {/* Main Content: Quick Actions + Insight Rail */}
      <div className="grid xl:grid-cols-[1fr,320px] gap-6">
        <QuickActions actions={quickActions} title="Quick Actions" />

        {/* Insight Rail */}
        <div className="hidden xl:block">
          <div className="sticky top-20">
            <InsightRail sections={insightSections} />
          </div>
        </div>
      </div>
    </div>
  );
}

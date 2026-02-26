"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/buttonVariants";
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

type KPI = { label: string; value: string };

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

function buildKpis(m: MetricsSnapshot | null): KPI[] {
  if (!m) {
    return [
      { label: "Weighted Pipeline", value: "$0" },
      { label: "Forecast (90d)", value: "$0" },
      { label: "Revenue MTD", value: "$0" },
      { label: "Close Rate (90d)", value: "—" },
      { label: "Outreach (30d)", value: "0" },
      { label: "Meetings (30d)", value: "0" },
    ];
  }
  return [
    { label: "Weighted Pipeline", value: fmtCurrency(m.weighted_pipeline) },
    { label: "Forecast (90d)", value: fmtCurrency(m.forecast_90d) },
    { label: "Revenue MTD", value: fmtCurrency(m.revenue_mtd) },
    { label: "Close Rate (90d)", value: fmtPct(m.close_rate_90d) },
    { label: "Outreach (30d)", value: String(m.outreach_count_30d) },
    { label: "Meetings (30d)", value: String(m.meetings_30d) },
  ];
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

  const kpis = buildKpis(metrics);
  const base = `/lab/env/${params.envId}/consulting`;

  const quickActions = [
    { label: "Add Lead", href: `${base}/outreach` },
    { label: "Log Outreach", href: `${base}/outreach` },
    { label: "Create Proposal", href: `${base}/proposals` },
    { label: "Convert to Client", href: `${base}/clients` },
    { label: "View Pipeline", href: `${base}/pipeline` },
    { label: "Revenue Dashboard", href: `${base}/revenue` },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Revenue Overview
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
                  {kpi.label}
                </p>
                <p className="text-2xl font-semibold mt-1 truncate">
                  {kpi.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Pipeline Summary + Engagement Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          href={`${base}/pipeline`}
          className="bm-glass-interactive rounded-xl p-4 border border-bm-border/70 hover:border-bm-accent/35 transition-colors"
        >
          <p className="text-sm font-medium">
            {metrics?.open_opportunities ?? 0} open deals
          </p>
          <p className="text-xs text-bm-muted mt-1">Pipeline</p>
        </Link>
        <Link
          href={`${base}/clients`}
          className="bm-glass-interactive rounded-xl p-4 border border-bm-border/70 hover:border-bm-accent/35 transition-colors"
        >
          <p className="text-sm font-medium">
            {metrics?.active_clients ?? 0} active clients
          </p>
          <p className="text-xs text-bm-muted mt-1">Client portfolio</p>
        </Link>
        <Link
          href={`${base}/revenue`}
          className="bm-glass-interactive rounded-xl p-4 border border-bm-border/70 hover:border-bm-accent/35 transition-colors"
        >
          <p className="text-sm font-medium">
            {metrics?.active_engagements ?? 0} active engagements
          </p>
          <p className="text-xs text-bm-muted mt-1">Delivery</p>
        </Link>
        <Link
          href={`${base}/outreach`}
          className="bm-glass-interactive rounded-xl p-4 border border-bm-warning/40 hover:border-bm-warning/70 transition-colors"
        >
          <p className="text-sm font-medium">
            {metrics
              ? `${fmtPct(metrics.response_rate_30d)} response rate`
              : "Start outreach"}
          </p>
          <p className="text-xs text-bm-muted mt-1">Outreach performance</p>
        </Link>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Quick Actions
        </h2>
        <Card>
          <CardContent className="flex flex-wrap gap-2 py-4">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={buttonVariants({ variant: "secondary" })}
              >
                {action.label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

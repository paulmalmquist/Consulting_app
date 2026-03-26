"use client";

import { useEffect, useState } from "react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { RepeIndexScaffold } from "@/components/repe/RepeIndexScaffold";
import { DevKpiStrip } from "@/components/repe/development/DevKpiStrip";
import { DevProjectTable } from "@/components/repe/development/DevProjectTable";
import { DevSpendChart } from "@/components/repe/development/DevSpendChart";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import {
  getDevPortfolio,
  type DevPortfolioResponse,
} from "@/lib/bos-api";

export default function DevelopmentPortfolioPage() {
  const { envId, businessId } = useReEnv();
  const [data, setData] = useState<DevPortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!envId) return;
    setLoading(true);
    getDevPortfolio(envId, businessId ?? undefined)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load development portfolio");
      })
      .finally(() => setLoading(false));
  }, [envId, businessId]);

  useEffect(() => {
    publishAssistantPageContext({
      route: envId ? `/lab/env/${envId}/re/development` : null,
      surface: "development_workspace",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: envId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        development_projects: (data?.projects || []).map((project) => ({
          entity_type: "development_project",
          entity_id: project.link_id,
          name: project.project_name,
          metadata: {
            asset_name: project.asset_name,
            status: project.status,
            stage: project.stage,
            health: project.health,
          },
        })),
        metrics: {
          project_count: data?.projects.length || 0,
          spend_points: data?.spend_trend.length || 0,
        },
        notes: ["Development portfolio workspace"],
      },
    });
    return () => resetAssistantPageContext();
  }, [data, envId]);

  const basePath = `/lab/env/${envId}/re/development`;

  if (loading) {
    return (
      <RepeIndexScaffold title="Development" subtitle="Loading...">
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-bm-border border-t-indigo-500" />
        </div>
      </RepeIndexScaffold>
    );
  }

  if (error) {
    return (
      <RepeIndexScaffold title="Development" subtitle="Construction & development project bridge">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </RepeIndexScaffold>
    );
  }

  return (
    <RepeIndexScaffold
      title="Development"
      subtitle="Construction & development project bridge to REPE assets"
      metrics={data?.kpis ? <DevKpiStrip kpis={data.kpis} /> : undefined}
    >
      <div className="space-y-8">
        {data?.spend_trend && data.spend_trend.length > 0 && (
          <DevSpendChart data={data.spend_trend} />
        )}

        <DevProjectTable
          projects={data?.projects ?? []}
          basePath={basePath}
        />
      </div>
    </RepeIndexScaffold>
  );
}

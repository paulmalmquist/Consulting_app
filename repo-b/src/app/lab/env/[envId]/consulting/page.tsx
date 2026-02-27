"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { InsightRail, type InsightSection } from "@/components/ui/InsightRail";
import { QuickActions, type QuickAction } from "@/components/ui/QuickActions";
import {
  fetchClients,
  fetchLatestMetrics,
  fetchLeads,
  fetchOutreachLog,
  fetchPipelineKanban,
  fetchProposals,
  seedConsultingWorkspace,
  type Lead,
  type MetricsSnapshot,
} from "@/lib/cro-api";

type WorkspaceDiagnostics = {
  lead_count: number;
  open_pipeline_cards: number;
  outreach_count: number;
  proposal_count: number;
  client_count: number;
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

function formatError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  const msg = err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "");
  if (msg.includes("Network error")) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  return msg || "Consulting API unreachable. Backend service is not available.";
}

function LeadStatus({ lead }: { lead: Lead }) {
  if (lead.disqualified_at) {
    return (
      <span className="text-xs bg-bm-danger/10 text-bm-danger px-1.5 py-0.5 rounded">
        Disqualified
      </span>
    );
  }
  if (lead.qualified_at) {
    return (
      <span className="text-xs bg-bm-success/10 text-bm-success px-1.5 py-0.5 rounded">
        Qualified
      </span>
    );
  }
  return null;
}

export default function ConsultingCommandCenter({
  params,
}: {
  params: { envId: string };
}) {
  const {
    businessId,
    error: contextError,
    loading: contextLoading,
    ready,
  } = useConsultingEnv();
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [diagnostics, setDiagnostics] = useState<WorkspaceDiagnostics | null>(null);
  const [diagnosticsReliable, setDiagnosticsReliable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const base = `/lab/env/${params.envId}/consulting`;

  const loadWorkspace = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setDataError(null);
    try {
      const [
        leadsResult,
        outreachResult,
        proposalsResult,
        clientsResult,
        kanbanResult,
        metricsResult,
      ] = await Promise.allSettled([
        fetchLeads(params.envId, businessId),
        fetchOutreachLog(params.envId, businessId),
        fetchProposals(params.envId, businessId),
        fetchClients(params.envId, businessId),
        fetchPipelineKanban(params.envId, businessId),
        fetchLatestMetrics(params.envId, businessId),
      ]);

      if (leadsResult.status !== "fulfilled") {
        throw leadsResult.reason;
      }

      const nextLeads = leadsResult.value;
      const outreachLog =
        outreachResult.status === "fulfilled" ? outreachResult.value : [];
      const proposals =
        proposalsResult.status === "fulfilled" ? proposalsResult.value : [];
      const clients =
        clientsResult.status === "fulfilled" ? clientsResult.value : [];
      const kanban =
        kanbanResult.status === "fulfilled"
          ? kanbanResult.value
          : { columns: [], total_pipeline: 0, weighted_pipeline: 0 };
      const latestMetrics =
        metricsResult.status === "fulfilled" ? metricsResult.value : null;

      const openPipelineCards = kanban.columns.reduce(
        (total, column) => total + column.cards.length,
        0,
      );

      setLeads(nextLeads);
      setMetrics(latestMetrics);
      setDiagnostics({
        lead_count: nextLeads.length,
        open_pipeline_cards: openPipelineCards,
        outreach_count: outreachLog.length,
        proposal_count: proposals.length,
        client_count: clients.length,
      });
      setDiagnosticsReliable(
        outreachResult.status === "fulfilled" &&
          proposalsResult.status === "fulfilled" &&
          clientsResult.status === "fulfilled" &&
          kanbanResult.status === "fulfilled",
      );
    } catch (err) {
      setLeads([]);
      setMetrics(null);
      setDiagnostics(null);
      setDiagnosticsReliable(false);
      setDataError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId, params.envId]);

  useEffect(() => {
    if (!ready) return;
    void loadWorkspace();
  }, [loadWorkspace, ready]);

  const m = metrics;
  const isLoading = contextLoading || (ready && loading);
  const topLeads = useMemo(
    () =>
      [...leads]
        .sort((a, b) => {
          if (b.lead_score !== a.lead_score) return b.lead_score - a.lead_score;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
        .slice(0, 5),
    [leads],
  );
  const canSeed = Boolean(
    diagnosticsReliable &&
    diagnostics &&
      diagnostics.lead_count === 0 &&
      diagnostics.open_pipeline_cards === 0 &&
      diagnostics.outreach_count === 0 &&
      diagnostics.proposal_count === 0 &&
      diagnostics.client_count === 0,
  );
  const bannerMessage = contextError
    ? contextError === "Environment not bound to a business."
      ? "This environment is not bound to a business, so CRM data cannot be loaded."
      : contextError
    : dataError;

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

  const seedWorkspace = useCallback(async () => {
    if (!businessId || !canSeed) return;
    setSeeding(true);
    setDataError(null);
    try {
      await seedConsultingWorkspace({ env_id: params.envId, business_id: businessId });
      await loadWorkspace();
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setSeeding(false);
    }
  }, [businessId, canSeed, loadWorkspace, params.envId]);

  const insightSections = useMemo<InsightSection[]>(() => {
    const sections: InsightSection[] = [];

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

    sections.push({
      title: "Outreach Performance",
      items: [
        {
          id: "outreach-volume",
          severity: m && m.outreach_count_30d > 0 ? "info" : "critical",
          label: `${m?.outreach_count_30d ?? 0} outreach (30d)`,
          detail: m ? `Response rate: ${fmtPct(m.response_rate_30d)}` : "No data yet",
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {bannerMessage ? (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      ) : null}

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

      <div>
        <p className="bm-section-label mb-3">Execution Snapshot</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Open Deals" value={String(m?.open_opportunities ?? 0)} size="compact" />
          <MetricCard label="Active Clients" value={String(m?.active_clients ?? 0)} size="compact" />
          <MetricCard label="Avg Deal Size" value={fmtCurrency(m?.avg_deal_size)} size="compact" />
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
          <MetricCard label="Revenue QTD" value={fmtCurrency(m?.revenue_qtd)} size="compact" />
        </div>
      </div>

      {canSeed ? (
        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">No consulting CRM records found.</p>
              <p className="text-sm text-bm-muted mt-1">
                This environment is empty across leads, outreach, proposals, clients, and pipeline.
              </p>
            </div>
            <Button onClick={() => void seedWorkspace()} disabled={!businessId || seeding}>
              {seeding ? "Seeding..." : "Seed Consulting Workspace"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <p className="bm-section-label mb-3">Lead Intake</p>
        <div className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Top Leads</p>
                  <p className="text-xs text-bm-muted2 mt-1">
                    Highest-scoring leads in this environment
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <Link
                    href={`${base}/outreach`}
                    className="rounded-md border border-bm-border/70 px-2 py-1 text-bm-text hover:bg-bm-surface/50"
                  >
                    All Leads
                  </Link>
                  <Link
                    href={`${base}/pipeline`}
                    className="rounded-md border border-bm-border/70 px-2 py-1 text-bm-text hover:bg-bm-surface/50"
                  >
                    Pipeline
                  </Link>
                  <Link
                    href={`${base}/outreach`}
                    className="rounded-md border border-bm-border/70 px-2 py-1 text-bm-text hover:bg-bm-surface/50"
                  >
                    Add Lead
                  </Link>
                </div>
              </div>

              {topLeads.length === 0 ? (
                <div className="rounded-lg border border-dashed border-bm-border/70 px-4 py-5 text-sm text-bm-muted2">
                  No leads yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {topLeads.map((lead) => (
                    <div
                      key={lead.lead_profile_id}
                      className="rounded-lg border border-bm-border/60 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{lead.company_name}</p>
                          <p className="text-xs text-bm-muted2 mt-1">
                            {lead.lead_source || "Unknown source"} · {lead.stage_label || "No stage"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{lead.lead_score}</span>
                          <LeadStatus lead={lead} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">Workspace Verification</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-bm-border/60 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Leads</p>
                  <p className="mt-1 text-xl font-semibold">{diagnostics?.lead_count ?? 0}</p>
                </div>
                <div className="rounded-lg border border-bm-border/60 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Open Deals</p>
                  <p className="mt-1 text-xl font-semibold">{diagnostics?.open_pipeline_cards ?? 0}</p>
                </div>
                <div className="rounded-lg border border-bm-border/60 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Outreach</p>
                  <p className="mt-1 text-xl font-semibold">{diagnostics?.outreach_count ?? 0}</p>
                </div>
                <div className="rounded-lg border border-bm-border/60 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Proposals</p>
                  <p className="mt-1 text-xl font-semibold">{diagnostics?.proposal_count ?? 0}</p>
                </div>
              </div>
              <div className="rounded-lg border border-bm-border/60 px-3 py-3 text-sm">
                <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Clients</p>
                <p className="mt-1 text-xl font-semibold">{diagnostics?.client_count ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr,320px] gap-6">
        <QuickActions actions={quickActions} title="Quick Actions" />
        <div className="hidden xl:block">
          <div className="sticky top-20">
            <InsightRail sections={insightSections} />
          </div>
        </div>
      </div>
    </div>
  );
}

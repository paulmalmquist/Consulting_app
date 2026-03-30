"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { NextActionPanel } from "@/components/consulting/NextActionPanel";
import { Card, CardContent } from "@/components/ui/Card";
import {
  fetchTodayOverdue,
  fetchLeads,
  fetchLatestMetrics,
  fetchPipelineKanban,
  fetchSchemaHealth,
  fetchProofAssetSummary,
  fetchDemoReadiness,
  fetchStaleRecords,
  type TodayOverdue,
  type Lead,
  type MetricsSnapshot,
  type SchemaHealth,
  type ProofAssetSummary,
  type DemoReadiness,
  type StaleRecords,
  type StaleAccount,
  type OrphanOpportunity,
} from "@/lib/cro-api";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function Metric({ label, value, sublabel, href }: { label: string; value: string | number; sublabel?: string; href?: string }) {
  const inner = (
    <Card>
      <CardContent className="py-4">
        <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-bm-text">{value}</p>
        {sublabel ? <p className="mt-1 text-xs text-bm-muted2">{sublabel}</p> : null}
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href} className="hover:ring-1 hover:ring-bm-accent/40 rounded-xl transition-shadow">{inner}</Link>;
  return inner;
}

const WEEK_RHYTHM = [
  { day: "Mon", theme: "Pipeline + Targets", key: "pipeline" },
  { day: "Tue", theme: "Proof Assets", key: "proof_assets" },
  { day: "Wed", theme: "Outbound", key: "outbound" },
  { day: "Thu", theme: "Demos + Feedback", key: "demos" },
  { day: "Fri", theme: "Review + Reprioritize", key: "review" },
] as const;

const DEMO_STATUS_COLORS: Record<string, string> = {
  ready: "bg-emerald-500",
  in_progress: "bg-amber-500",
  needs_refresh: "bg-amber-500",
  blocked: "bg-red-500",
  not_started: "bg-bm-muted2",
};

export default function ConsultingCommandCenter({ params }: { params: { envId: string } }) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const [actionData, setActionData] = useState<TodayOverdue | null>(null);
  const [topLeads, setTopLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [kanban, setKanban] = useState<{ columns: Array<{ stage_key: string; stage_label: string; cards: unknown[]; weighted_value: number }> } | null>(null);
  const [health, setHealth] = useState<SchemaHealth | null>(null);
  const [proofSummary, setProofSummary] = useState<ProofAssetSummary | null>(null);
  const [demoReadiness, setDemoReadiness] = useState<DemoReadiness[]>([]);
  const [staleRecords, setStaleRecords] = useState<StaleRecords | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const reloadAll = useCallback(async () => {
    if (!businessId) return;
    setDataLoading(true);
    try {
      const results = await Promise.allSettled([
        fetchTodayOverdue(params.envId, businessId),
        fetchLeads(params.envId, businessId),
        fetchLatestMetrics(params.envId, businessId),
        fetchPipelineKanban(params.envId, businessId),
        fetchSchemaHealth(),
        fetchProofAssetSummary(params.envId, businessId),
        fetchDemoReadiness(params.envId, businessId),
        fetchStaleRecords(params.envId, businessId),
      ]);
      if (results[0].status === "fulfilled") setActionData(results[0].value);
      if (results[1].status === "fulfilled") setTopLeads(results[1].value.slice(0, 8));
      if (results[2].status === "fulfilled") setMetrics(results[2].value);
      if (results[3].status === "fulfilled") setKanban(results[3].value);
      if (results[4].status === "fulfilled") setHealth(results[4].value);
      if (results[5].status === "fulfilled") setProofSummary(results[5].value);
      if (results[6].status === "fulfilled") setDemoReadiness(results[6].value);
      if (results[7].status === "fulfilled") setStaleRecords(results[7].value);
    } catch (err) {
      console.error("Failed to load command center data:", err);
    } finally {
      setDataLoading(false);
    }
  }, [params.envId, businessId]);

  useEffect(() => {
    if (!ready || !businessId) return;
    void reloadAll();
  }, [ready, businessId, reloadAll]);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${params.envId}/consulting`,
      surface: "consulting_workspace",
      active_module: "consulting",
      page_entity_type: "environment",
      page_entity_id: params.envId,
      page_entity_name: "Novendor Command Center",
      selected_entities: [],
      visible_data: {
        metrics: metrics ? {
          weighted_pipeline: metrics.weighted_pipeline,
          open_opportunities: metrics.open_opportunities,
          outreach_count_30d: metrics.outreach_count_30d,
          revenue_mtd: metrics.revenue_mtd,
          active_clients: metrics.active_clients,
        } : undefined,
        notes: ["Revenue execution command center"],
      },
    });
    return () => resetAssistantPageContext();
  }, [params.envId, metrics]);

  const todayDayIdx = new Date().getDay(); // 0=Sun ... 6=Sat
  const rhythmIdx = todayDayIdx >= 1 && todayDayIdx <= 5 ? todayDayIdx - 1 : -1;

  if (contextLoading) {
    return <div className="h-64 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  }

  if (contextError) {
    return (
      <div className="rounded-xl border border-bm-danger/35 bg-bm-danger/10 px-5 py-4 text-sm text-bm-text">
        <p className="font-semibold">Environment unavailable</p>
        <p className="mt-1 text-bm-muted2">{contextError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Schema Status Banner */}
      {health && !health.schema_ready ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-red-400">Schema Not Ready</p>
          <p className="mt-1 text-bm-muted2">
            {health.tables_missing.length} table{health.tables_missing.length !== 1 ? "s" : ""} missing.
            {health.migrations_needed.length > 0 ? ` Migrations needed: ${health.migrations_needed.map((m: string) => m.split(" ")[0]).join(", ")}` : ""}
          </p>
        </div>
      ) : null}

      {health && health.schema_ready && !health.has_data ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-400">No Data Seeded</p>
          <p className="mt-1 text-bm-muted2">
            Schema is ready but tables are empty. Seed the environment to load pipeline data, proof assets, and demo readiness records.
          </p>
        </div>
      ) : null}

      {/* Revenue KPIs */}
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric
            label="Pipeline"
            value={metrics ? fmtCurrency(metrics.weighted_pipeline) : "—"}
            sublabel="weighted value"
            href={`/lab/env/${params.envId}/consulting/pipeline`}
          />
          <Metric
            label="Open Opps"
            value={metrics?.open_opportunities ?? 0}
            sublabel={metrics ? `${metrics.won_count_90d} won (90d)` : "—"}
            href={`/lab/env/${params.envId}/consulting/pipeline`}
          />
          <Metric
            label="Outreach"
            value={metrics?.outreach_count_30d ?? 0}
            sublabel={metrics?.response_rate_30d ? `${(metrics.response_rate_30d * 100).toFixed(0)}% response` : "30d total"}
            href={`/lab/env/${params.envId}/consulting/strategic-outreach`}
          />
          <Metric
            label="Revenue MTD"
            value={metrics ? fmtCurrency(metrics.revenue_mtd) : "—"}
            sublabel={metrics ? `${fmtCurrency(metrics.forecast_90d)} forecast` : "—"}
            href={`/lab/env/${params.envId}/consulting/revenue`}
          />
          <Metric
            label="Active Clients"
            value={metrics?.active_clients ?? 0}
            sublabel={metrics ? `${metrics.active_engagements} engagements` : "—"}
            href={`/lab/env/${params.envId}/consulting/clients`}
          />
        </div>
      </section>

      {/* Proof Asset + Demo Readiness Strips */}
      <section className="grid gap-3 md:grid-cols-2">
        {/* Proof Assets */}
        <Link
          href={`/lab/env/${params.envId}/consulting/proof-assets`}
          className="rounded-xl border border-bm-border/50 bg-bm-surface/10 px-4 py-3 hover:bg-bm-surface/20 transition-colors"
        >
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Proof Assets</p>
          {proofSummary ? (
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="text-emerald-400 font-semibold">{proofSummary.ready} ready</span>
              <span className="text-bm-muted2">·</span>
              <span className="text-amber-400">{proofSummary.draft} draft</span>
              <span className="text-bm-muted2">·</span>
              <span className="text-red-400">{proofSummary.needs_update} need update</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-bm-muted2">Loading...</p>
          )}
        </Link>

        {/* Demo Readiness */}
        <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Demo Readiness</p>
          {demoReadiness.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {demoReadiness.map((demo) => (
                <div key={demo.id} className="flex items-center gap-2 text-sm">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${DEMO_STATUS_COLORS[demo.status] ?? "bg-bm-muted2"}`} />
                  <span className="text-bm-text">{demo.demo_name}</span>
                  {demo.blockers.length > 0 ? (
                    <span className="text-[10px] text-bm-muted2">({demo.blockers.length} blocker{demo.blockers.length !== 1 ? "s" : ""})</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-bm-muted2">No demo readiness data</p>
          )}
        </div>
      </section>

      {/* Next Actions */}
      <section className="space-y-3">
        {actionData && actionData.overdue_count > 0 ? (
          <NextActionPanel
            title="Overdue"
            actions={actionData.overdue}
            businessId={businessId!}
            onUpdate={reloadAll}
            variant="overdue"
          />
        ) : null}
        {actionData && actionData.today_count > 0 ? (
          <NextActionPanel
            title="Today"
            actions={actionData.today}
            businessId={businessId!}
            onUpdate={reloadAll}
          />
        ) : null}
        {actionData && actionData.overdue_count === 0 && actionData.today_count === 0 ? (
          <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 px-4 py-3 text-sm text-bm-muted2">
            No actions due today. Create leads or advance pipeline stages to generate actions.
          </div>
        ) : null}
      </section>

      {/* Stale Record Alerts */}
      {staleRecords && (staleRecords.stale_accounts.length > 0 || staleRecords.orphan_opportunities.length > 0) ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-amber-400 font-semibold">Attention Needed</p>
          {staleRecords.stale_accounts.length > 0 ? (
            <div>
              <p className="text-xs text-bm-muted2 mb-1">{staleRecords.stale_accounts.length} stale account{staleRecords.stale_accounts.length !== 1 ? "s" : ""} (no activity 14+ days)</p>
              <div className="flex flex-wrap gap-2">
                {staleRecords.stale_accounts.slice(0, 5).map((acct: StaleAccount) => (
                  <Link
                    key={acct.crm_account_id}
                    href={`/lab/env/${params.envId}/consulting/accounts/${acct.crm_account_id}`}
                    className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-bm-text hover:bg-amber-500/20"
                  >
                    {acct.name} <span className="text-bm-muted2">({acct.days_stale ?? "∞"}d)</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {staleRecords.orphan_opportunities.length > 0 ? (
            <div>
              <p className="text-xs text-bm-muted2 mb-1">{staleRecords.orphan_opportunities.length} deal{staleRecords.orphan_opportunities.length !== 1 ? "s" : ""} missing next action</p>
              <div className="flex flex-wrap gap-2">
                {staleRecords.orphan_opportunities.slice(0, 5).map((opp: OrphanOpportunity) => (
                  <span key={opp.crm_opportunity_id} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-bm-text">
                    {opp.name} <span className="text-bm-muted2">({opp.stage_key ?? "—"})</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Pipeline Stage Summary */}
      {kanban?.columns?.length ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Pipeline Stages</p>
            <Link href={`/lab/env/${params.envId}/consulting/pipeline`} className="text-xs text-bm-accent hover:underline">
              Open Kanban
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {kanban.columns
              .filter((col) => !["closed_won", "closed_lost"].includes(col.stage_key))
              .map((col) => (
                <div key={col.stage_key} className="flex-1 min-w-[100px] rounded-lg border border-bm-border/50 bg-bm-surface/10 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-bm-muted2 truncate">{col.stage_label}</p>
                  <p className="text-lg font-semibold text-bm-text">{col.cards.length}</p>
                  {col.weighted_value > 0 ? (
                    <p className="text-[10px] text-bm-muted2">{fmtCurrency(col.weighted_value)}</p>
                  ) : null}
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {/* Top Leads */}
      {topLeads.length > 0 ? (
        <section>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Top Leads by Score</p>
                <Link href={`/lab/env/${params.envId}/consulting/accounts`} className="text-xs text-bm-accent hover:underline">
                  View all
                </Link>
              </div>
              <div className="space-y-2">
                {topLeads.map((lead) => (
                  <Link
                    key={lead.crm_account_id}
                    href={`/lab/env/${params.envId}/consulting/accounts/${lead.crm_account_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-bm-border/50 px-3 py-2 hover:bg-bm-surface/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bm-text truncate">{lead.company_name}</p>
                      <p className="text-xs text-bm-muted2">
                        {lead.industry || "—"} · {lead.stage_label || lead.stage_key || "research"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 h-1.5 rounded-full bg-bm-surface/40 overflow-hidden">
                        <div className="h-full rounded-full bg-bm-accent" style={{ width: `${lead.lead_score}%` }} />
                      </div>
                      <span className="text-xs font-medium text-bm-text w-6 text-right">{lead.lead_score}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* Quick Links */}
      <section>
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <Link href={`/lab/env/${params.envId}/consulting/pipeline`} className="rounded-xl border border-bm-accent/30 bg-bm-accent/10 px-4 py-3 text-sm font-medium text-bm-accent hover:bg-bm-accent/20 text-center">
            Pipeline
          </Link>
          <Link href={`/lab/env/${params.envId}/consulting/strategic-outreach`} className="rounded-xl border border-bm-accent/30 bg-bm-accent/10 px-4 py-3 text-sm font-medium text-bm-accent hover:bg-bm-accent/20 text-center">
            Outreach
          </Link>
          <Link href={`/lab/env/${params.envId}/consulting/accounts`} className="rounded-xl border border-bm-border/70 bg-bm-bg px-4 py-3 text-sm font-medium text-bm-text hover:bg-bm-surface/30 text-center">
            Accounts
          </Link>
          <Link href={`/lab/env/${params.envId}/consulting/proposals`} className="rounded-xl border border-bm-border/70 bg-bm-bg px-4 py-3 text-sm font-medium text-bm-text hover:bg-bm-surface/30 text-center">
            Proposals
          </Link>
          <Link href={`/lab/env/${params.envId}/consulting/clients`} className="rounded-xl border border-bm-border/70 bg-bm-bg px-4 py-3 text-sm font-medium text-bm-text hover:bg-bm-surface/30 text-center">
            Clients
          </Link>
          <Link href={`/lab/env/${params.envId}/consulting/proof-assets`} className="rounded-xl border border-bm-border/70 bg-bm-bg px-4 py-3 text-sm font-medium text-bm-text hover:bg-bm-surface/30 text-center">
            Proof Assets
          </Link>
        </div>
      </section>

      {/* Weekly Rhythm */}
      <section className="rounded-xl border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2 mb-2">Weekly Rhythm</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {WEEK_RHYTHM.map((item, idx) => (
            <div
              key={item.key}
              className={`flex-1 min-w-[80px] rounded-lg px-3 py-2 text-center transition-colors ${
                idx === rhythmIdx
                  ? "border-2 border-bm-accent bg-bm-accent/10"
                  : "border border-bm-border/40 bg-bm-bg"
              }`}
            >
              <p className={`text-xs font-semibold ${idx === rhythmIdx ? "text-bm-accent" : "text-bm-text"}`}>
                {item.day}
              </p>
              <p className="text-[10px] text-bm-muted2 mt-0.5">{item.theme}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

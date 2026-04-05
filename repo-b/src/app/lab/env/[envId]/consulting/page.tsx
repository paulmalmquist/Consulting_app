"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { NextActionPanel } from "@/components/consulting/NextActionPanel";
import { OutreachFlightDeck } from "@/components/consulting/OutreachFlightDeck";
import AttackList from "@/components/consulting/AttackList";
import GlobalFilterBar from "@/components/consulting/GlobalFilterBar";
import PipelineStrip from "@/components/consulting/PipelineStrip";
import IndustryBreakdown from "@/components/consulting/IndustryBreakdown";
import StuckMoney from "@/components/consulting/StuckMoney";
import OutreachSnapshot from "@/components/consulting/OutreachSnapshot";
import {
  fetchTodayOverdue,
  fetchLatestMetrics,
  fetchPipelineStages,
  fetchSchemaHealth,
  fetchDailyBrief,
  fetchDeals,
  fetchDealSummary,
  ingestLeads,
  resetAndReseed,
  type TodayOverdue,
  type MetricsSnapshot,
  type SchemaHealth,
  type DailyBrief,
  type Deal,
  type DealSummary,
  type PipelineStage,
} from "@/lib/cro-api";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";

export default function ConsultingCommandCenter({ params }: { params: { envId: string } }) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const searchParams = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────
  const [deals, setDeals] = useState<Deal[]>([]);
  const [summary, setSummary] = useState<DealSummary | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [actionData, setActionData] = useState<TodayOverdue | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [health, setHealth] = useState<SchemaHealth | null>(null);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [reseedLoading, setReseedLoading] = useState(false);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);

  // ── Filters from URL search params ─────────────────────────────────────
  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    for (const key of ["industry", "stage_key", "computed_status", "min_value", "max_value", "last_activity_days"]) {
      const v = searchParams.get(key);
      if (v) f[key] = v;
    }
    return f;
  }, [searchParams]);

  // ── Data loading ───────────────────────────────────────────────────────
  const reloadAll = useCallback(async () => {
    if (!businessId) return;
    setDataLoading(true);
    try {
      const results = await Promise.allSettled([
        fetchDeals(params.envId, businessId, filters),
        fetchDealSummary(params.envId, businessId),
        fetchPipelineStages(businessId),
        fetchTodayOverdue(params.envId, businessId),
        fetchLatestMetrics(params.envId, businessId),
        fetchSchemaHealth(),
        fetchDailyBrief(params.envId, businessId),
      ]);
      if (results[0].status === "fulfilled") setDeals(results[0].value);
      if (results[1].status === "fulfilled") setSummary(results[1].value);
      if (results[2].status === "fulfilled") setStages(results[2].value);
      if (results[3].status === "fulfilled") setActionData(results[3].value);
      if (results[4].status === "fulfilled") setMetrics(results[4].value);
      if (results[5].status === "fulfilled") setHealth(results[5].value);
      if (results[6].status === "fulfilled") setBrief(results[6].value);
    } catch (err) {
      console.error("Failed to load command center data:", err);
    } finally {
      setDataLoading(false);
    }
  }, [params.envId, businessId, filters]);

  useEffect(() => {
    if (!ready || !businessId) return;
    void reloadAll();
  }, [ready, businessId, reloadAll]);

  // ── Assistant context ──────────────────────────────────────────────────
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
        deal_count: deals.length,
        needs_attention: deals.filter((d) => d.computed_status === "NeedsAttention").length,
      },
    });
    return () => resetAssistantPageContext();
  }, [params.envId, metrics, deals]);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleReseed = useCallback(async () => {
    if (!businessId) return;
    setReseedLoading(true);
    try {
      await resetAndReseed(params.envId, businessId);
      await reloadAll();
    } catch (err) {
      console.error("Reseed failed:", err);
    } finally {
      setReseedLoading(false);
    }
  }, [params.envId, businessId, reloadAll]);

  const handleIngest = useCallback(async () => {
    if (!businessId) return;
    setIngestLoading(true);
    setIngestResult(null);
    try {
      const result = await ingestLeads({ env_id: params.envId, business_id: businessId });
      setIngestResult(
        `Ingested: ${result.accounts_created} accounts, ${result.contacts_created} contacts, ${result.opportunities_created} opportunities (${result.skipped_dupes} dupes skipped)`,
      );
      await reloadAll();
    } catch (err) {
      setIngestResult(`Ingest failed: ${err}`);
    } finally {
      setIngestLoading(false);
    }
  }, [params.envId, businessId, reloadAll]);

  // ── Derived ────────────────────────────────────────────────────────────
  const industries = useMemo(
    () => [...new Set(deals.map((d) => d.industry).filter(Boolean) as string[])].sort(),
    [deals],
  );
  const stageOptions = useMemo(
    () => stages.filter((s) => !s.is_closed).map((s) => ({ key: s.key, label: s.label })),
    [stages],
  );
  const hasNoActions = !actionData || (actionData.today_count === 0 && actionData.overdue_count === 0);

  // ── Loading / Error states ─────────────────────────────────────────────
  if (contextLoading) {
    return <div className="h-64 rounded border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  }
  if (contextError) {
    return (
      <div className="rounded border border-bm-danger/35 bg-bm-danger/10 px-5 py-4 text-sm text-bm-text">
        <p className="font-semibold">Environment unavailable</p>
        <p className="mt-1 text-bm-muted2">{contextError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      {/* Schema Status Banner */}
      {health && !health.schema_ready ? (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          <p className="font-semibold text-red-400">Schema Not Ready</p>
          <p className="mt-1 text-xs text-bm-muted2">
            {health.tables_missing.length} table{health.tables_missing.length !== 1 ? "s" : ""} missing.
            {health.migrations_needed.length > 0 ? ` Apply: ${health.migrations_needed.map((m: string) => m.split(" ")[0]).join(", ")}` : ""}
          </p>
        </div>
      ) : null}

      {/* ── ADMIN BAR ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-bm-text font-bold">Command Center</span>
          {dataLoading ? <span className="text-[10px] text-bm-muted2">Loading...</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleIngest()}
            disabled={ingestLoading}
            className="rounded border border-bm-accent/40 bg-bm-accent/10 px-2 py-1 text-[10px] font-semibold text-bm-accent disabled:opacity-40"
          >
            {ingestLoading ? "Ingesting..." : "Ingest Leads"}
          </button>
          {health?.schema_ready ? (
            <button
              type="button"
              onClick={() => void handleReseed()}
              disabled={reseedLoading}
              className="text-[10px] text-bm-muted2 hover:text-bm-text underline disabled:opacity-50"
            >
              {reseedLoading ? "Reseeding..." : "Reseed"}
            </button>
          ) : null}
        </div>
      </div>

      {ingestResult ? (
        <div className="rounded border border-bm-border/40 bg-bm-surface/10 px-3 py-2 text-xs text-bm-muted2">
          {ingestResult}
        </div>
      ) : null}

      {/* ── FILTER BAR ────────────────────────────────────────────────── */}
      <GlobalFilterBar industries={industries} stages={stageOptions} />

      {/* ── ATTACK LIST ───────────────────────────────────────────────── */}
      <AttackList
        deals={deals}
        envId={params.envId}
        businessId={businessId!}
        onRefresh={reloadAll}
        stages={stageOptions}
      />

      {/* ── OVERDUE / TODAY ACTIONS ────────────────────────────────────── */}
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
          title="Due Today"
          actions={actionData.today}
          businessId={businessId!}
          onUpdate={reloadAll}
        />
      ) : null}
      {hasNoActions && deals.length === 0 ? (
        <div className="rounded border border-bm-border/40 bg-bm-surface/10 px-4 py-3 text-sm text-bm-muted2">
          No deals or actions. Click &ldquo;Ingest Leads&rdquo; to populate from your Job Search directory.
        </div>
      ) : null}

      {/* ── SUMMARY PANELS ────────────────────────────────────────────── */}
      {summary ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <PipelineStrip items={summary.pipeline_strip} />
            <IndustryBreakdown
              items={summary.industry_breakdown}
              onFilterIndustry={(industry) => {
                const params2 = new URLSearchParams(searchParams.toString());
                params2.set("industry", industry);
                window.history.replaceState(null, "", `?${params2.toString()}`);
                void reloadAll();
              }}
            />
          </div>
          <StuckMoney items={summary.stuck_money} />
          <OutreachSnapshot data={summary.outreach_7d} />
        </>
      ) : null}

      {/* ── KPI STRIP ─────────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-3 gap-1.5">
          <Link
            href={`/lab/env/${params.envId}/consulting/strategic-outreach`}
            className="rounded border border-bm-border/35 bg-bm-surface/8 px-3 py-2 text-center hover:bg-bm-surface/15"
          >
            <p className="text-[9px] uppercase tracking-wider text-bm-muted2">Outreach 30d</p>
            <p className={`text-base font-semibold ${(metrics?.outreach_count_30d ?? 0) === 0 ? "text-red-400" : "text-bm-text"}`}>
              {metrics?.outreach_count_30d ?? 0}
            </p>
          </Link>
          <Link
            href={`/lab/env/${params.envId}/consulting/pipeline`}
            className="rounded border border-bm-border/35 bg-bm-surface/8 px-3 py-2 text-center hover:bg-bm-surface/15"
          >
            <p className="text-[9px] uppercase tracking-wider text-bm-muted2">Open Deals</p>
            <p className="text-base font-semibold text-bm-text">{metrics?.open_opportunities ?? 0}</p>
          </Link>
          <Link
            href={`/lab/env/${params.envId}/consulting/clients`}
            className="rounded border border-bm-border/35 bg-bm-surface/8 px-3 py-2 text-center hover:bg-bm-surface/15"
          >
            <p className="text-[9px] uppercase tracking-wider text-bm-muted2">Clients</p>
            <p className="text-base font-semibold text-bm-text">{metrics?.active_clients ?? 0}</p>
          </Link>
        </div>
      </section>

      {/* ── OUTREACH FLIGHT DECK (existing, kept below) ───────────────── */}
      {brief ? (
        <details>
          <summary className="flex items-center justify-between px-3 py-2 cursor-pointer border-b border-bm-border/40">
            <span className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold">
              Daily Outreach Brief
            </span>
          </summary>
          <OutreachFlightDeck
            brief={brief}
            envId={params.envId}
            onRefresh={reloadAll}
          />
        </details>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { NextActionPanel } from "@/components/consulting/NextActionPanel";
import { OutreachFlightDeck } from "@/components/consulting/OutreachFlightDeck";
import { Card, CardContent } from "@/components/ui/Card";
import {
  fetchTodayOverdue,
  fetchLeads,
  fetchLatestMetrics,
  fetchPipelineKanban,
  fetchSchemaHealth,
  fetchProofAssets,
  fetchOutreachLog,
  fetchDailyBrief,
  resetAndReseed,
  type TodayOverdue,
  type Lead,
  type MetricsSnapshot,
  type SchemaHealth,
  type ProofAsset,
  type OutreachLogEntry,
  type DailyBrief,
} from "@/lib/cro-api";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** Day of week: 0=Sun ... 6=Sat */
function getDayOfWeek(): number {
  return new Date().getDay();
}

function getDayLabel(): string {
  const day = getDayOfWeek();
  const labels: Record<number, { label: string; focus: string; target: string }> = {
    1: { label: "Monday", focus: "Pipeline + Targets", target: "Review all deals, promote 2-3 targets" },
    2: { label: "Tuesday", focus: "Proof Assets", target: "Draft or update 1 proof asset" },
    3: { label: "Wednesday", focus: "Outbound", target: "Send 10 outreach messages" },
    4: { label: "Thursday", focus: "Demos + Feedback", target: "Run scheduled demos, log objections" },
    5: { label: "Friday", focus: "Review + Metrics", target: "Review conversion metrics, plan next week" },
  };
  const info = labels[day];
  if (!info) return "";
  return `${info.label}: ${info.focus} — ${info.target}`;
}

// Compute "real" pipeline: deals with real contacts + outreach sent
function computeRealPipeline(
  kanban: { columns: Array<{ stage_key: string; cards: unknown[]; weighted_value: number }> } | null,
  outreachLog: OutreachLogEntry[],
  leads: Lead[],
): { real: number; potential: number } {
  if (!kanban) return { real: 0, potential: 0 };
  const totalWeighted = kanban.columns.reduce((sum, c) => sum + c.weighted_value, 0);

  // Real = deals in stages past "research" that have outreach activity
  const contactedStages = new Set(["contacted", "engaged", "meeting", "qualified", "proposal", "closed_won"]);
  const accountsWithOutreach = new Set(outreachLog.map((o) => o.crm_account_id));
  const accountsWithContacts = new Set(leads.filter((l) => l.stage_key && contactedStages.has(l.stage_key)).map((l) => l.crm_account_id));

  let realValue = 0;
  for (const col of kanban.columns) {
    if (contactedStages.has(col.stage_key) && col.weighted_value > 0) {
      realValue += col.weighted_value;
    }
  }

  return { real: realValue, potential: totalWeighted - realValue };
}

export default function ConsultingCommandCenter({ params }: { params: { envId: string } }) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const [actionData, setActionData] = useState<TodayOverdue | null>(null);
  const [topLeads, setTopLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [kanban, setKanban] = useState<{ columns: Array<{ stage_key: string; stage_label: string; cards: unknown[]; weighted_value: number }> } | null>(null);
  const [health, setHealth] = useState<SchemaHealth | null>(null);
  const [proofAssets, setProofAssets] = useState<ProofAsset[]>([]);
  const [outreachLog, setOutreachLog] = useState<OutreachLogEntry[]>([]);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [reseedLoading, setReseedLoading] = useState(false);

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
        fetchProofAssets(params.envId, businessId),
        fetchOutreachLog(params.envId, businessId),
        fetchDailyBrief(params.envId, businessId),
      ]);
      if (results[0].status === "fulfilled") setActionData(results[0].value);
      if (results[1].status === "fulfilled") setTopLeads(results[1].value);
      if (results[2].status === "fulfilled") setMetrics(results[2].value);
      if (results[3].status === "fulfilled") setKanban(results[3].value);
      if (results[4].status === "fulfilled") setHealth(results[4].value);
      if (results[5].status === "fulfilled") setProofAssets(results[5].value);
      if (results[6].status === "fulfilled") setOutreachLog(results[6].value);
      if (results[7].status === "fulfilled") setBrief(results[7].value);
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
      },
    });
    return () => resetAssistantPageContext();
  }, [params.envId, metrics]);

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


  // Pipeline metrics
  const pipelineMetrics = useMemo(
    () => computeRealPipeline(kanban, outreachLog, topLeads),
    [kanban, outreachLog, topLeads],
  );

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

  // Compute forced actions — system generates these, not the user
  const pipelineEmpty = !kanban || kanban.columns.every((c) => c.cards.length === 0);
  const accountsInCRM = topLeads.length;
  const assetsReady = proofAssets.filter((a) => a.status === "ready").length;
  const assetsDraft = proofAssets.filter((a) => a.status === "draft").length;
  const assetsTotal = proofAssets.length;
  const hasNoActions = !actionData || (actionData.today_count === 0 && actionData.overdue_count === 0);

  // Generate forced actions from system state
  const forcedActions: Array<{ label: string; href?: string; action?: string; priority: "critical" | "high" | "normal" }> = [];

  if (pipelineEmpty && accountsInCRM === 0) {
    forcedActions.push({ label: "No accounts in CRM — seed or add targets via Strategic Outreach", href: `/lab/env/${params.envId}/consulting/strategic-outreach`, priority: "critical" });
  }
  if (accountsInCRM > 0 && pipelineEmpty) {
    forcedActions.push({ label: `${accountsInCRM} accounts in CRM with no open opportunities — create deals`, href: `/lab/env/${params.envId}/consulting/pipeline`, priority: "critical" });
  }
  if (assetsTotal === 0) {
    forcedActions.push({ label: "Proof assets missing — you have nothing to send if someone replies", href: `/lab/env/${params.envId}/consulting/proof-assets`, priority: "critical" });
  } else if (assetsReady === 0 && assetsDraft > 0) {
    forcedActions.push({ label: `${assetsDraft} proof assets in draft — finalize before outreach`, href: `/lab/env/${params.envId}/consulting/proof-assets`, priority: "high" });
  }
  if (accountsInCRM > 0 && metrics?.outreach_count_30d === 0) {
    forcedActions.push({ label: "Accounts exist but ZERO outreach — send messages this week", href: `/lab/env/${params.envId}/consulting/strategic-outreach`, priority: "critical" });
  }

  const dayRhythm = getDayLabel();

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* Schema Status Banner */}
      {health && !health.schema_ready ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-red-400">Schema Not Ready</p>
          <p className="mt-1 text-bm-muted2">
            {health.tables_missing.length} table{health.tables_missing.length !== 1 ? "s" : ""} missing.
            {health.migrations_needed.length > 0 ? ` Apply: ${health.migrations_needed.map((m: string) => m.split(" ")[0]).join(", ")}` : ""}
          </p>
        </div>
      ) : null}

      {/* ── OUTREACH FLIGHT DECK ─────────────────────────────────────── */}
      {brief && (
        <OutreachFlightDeck
          brief={brief}
          envId={params.envId}
          onRefresh={reloadAll}
        />
      )}

      {/* ── SECTION 1: TODAY — DUE NOW ───────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs uppercase tracking-[0.12em] text-bm-text font-bold">Today</p>
          </div>
          <div className="flex items-center gap-2">
            {dayRhythm && (
              <span className="text-[10px] text-bm-accent font-medium hidden sm:inline">{dayRhythm}</span>
            )}
            {health?.schema_ready && (
              <button
                onClick={handleReseed}
                disabled={reseedLoading}
                className="text-[10px] text-bm-muted2 hover:text-bm-text underline disabled:opacity-50"
              >
                {reseedLoading ? "Reseeding…" : "Reset + Reseed"}
              </button>
            )}
          </div>
        </div>

        {/* System-generated forced actions — CRITICAL items at top */}
        {forcedActions.length > 0 ? (
          <div className="space-y-2 mb-3">
            {forcedActions.map((fa, idx) => (
              fa.href ? (
                <Link
                  key={idx}
                  href={fa.href}
                  className={`flex items-center gap-2.5 rounded border px-3 py-2 text-xs font-medium transition-colors ${
                    fa.priority === "critical"
                      ? "border-red-500/35 bg-red-500/8 text-red-400 hover:bg-red-500/15"
                      : fa.priority === "high"
                      ? "border-amber-500/35 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15"
                      : "border-bm-border/40 bg-bm-surface/10 text-bm-text hover:bg-bm-surface/20"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    fa.priority === "critical" ? "bg-red-400 animate-pulse" : fa.priority === "high" ? "bg-amber-400" : "bg-bm-muted2"
                  }`} />
                  {fa.label}
                  <span className="ml-auto text-bm-muted2/60">→</span>
                </Link>
              ) : (
                <div
                  key={idx}
                  className={`flex items-center gap-2.5 rounded border px-3 py-2 text-xs font-medium ${
                    fa.priority === "critical"
                      ? "border-red-500/35 bg-red-500/8 text-red-400"
                      : fa.priority === "high"
                      ? "border-amber-500/35 bg-amber-500/8 text-amber-400"
                      : "border-bm-border/40 bg-bm-surface/10 text-bm-text"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    fa.priority === "critical" ? "bg-red-400 animate-pulse" : fa.priority === "high" ? "bg-amber-400" : "bg-bm-muted2"
                  }`} />
                  {fa.label}
                </div>
              )
            ))}
          </div>
        ) : null}

        {/* Overdue actions — RED */}
        {actionData && actionData.overdue_count > 0 ? (
          <NextActionPanel
            title="Overdue"
            actions={actionData.overdue}
            businessId={businessId!}
            onUpdate={reloadAll}
            variant="overdue"
          />
        ) : null}

        {/* Today's scheduled actions */}
        {actionData && actionData.today_count > 0 ? (
          <NextActionPanel
            title="Due Today"
            actions={actionData.today}
            businessId={businessId!}
            onUpdate={reloadAll}
          />
        ) : null}

        {hasNoActions && forcedActions.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
            All clear. Check pipeline for deals that need advancing.
          </div>
        ) : null}
      </section>

      {/* ── SECTION 3: PIPELINE SNAPSHOT (compressed) ────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">Pipeline</p>
          <Link href={`/lab/env/${params.envId}/consulting/pipeline`} className="text-xs text-bm-accent hover:underline">
            Kanban →
          </Link>
        </div>

        {/* Real vs Potential pipeline values */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-emerald-400 font-semibold">Real Pipeline</p>
            <p className="text-base font-bold text-emerald-400">{fmtCurrency(pipelineMetrics.real)}</p>
            <p className="text-[9px] text-bm-muted2">contact + outreach</p>
          </div>
          <div className="rounded border border-bm-border/40 bg-bm-surface/10 px-3 py-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-bm-muted2 font-semibold">Potential</p>
            <p className="text-base font-bold text-bm-muted2">{fmtCurrency(pipelineMetrics.potential)}</p>
            <p className="text-[9px] text-bm-muted2">needs outreach</p>
          </div>
        </div>

        {/* Compact stage strip */}
        {kanban?.columns?.length ? (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {kanban.columns
              .filter((col) => !["closed_won", "closed_lost"].includes(col.stage_key))
              .map((col) => (
                <Link
                  key={col.stage_key}
                  href={`/lab/env/${params.envId}/consulting/pipeline`}
                  className="flex-1 min-w-[60px] rounded border border-bm-border/35 bg-bm-surface/8 px-2 py-1.5 text-center hover:bg-bm-surface/15 transition-colors"
                >
                  <p className="text-[9px] uppercase tracking-wider text-bm-muted2 truncate">{col.stage_label}</p>
                  <p className={`text-sm font-semibold ${col.cards.length === 0 ? "text-bm-muted2/30" : "text-bm-text"}`}>
                    {col.cards.length}
                  </p>
                </Link>
              ))}
          </div>
        ) : null}
      </section>

      {/* ── SECTION 5: KPI STRIP ─────────────────────────────────────── */}
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

      {/* Loading indicator */}
      {dataLoading && (
        <div className="text-center text-xs text-bm-muted2 py-2">Loading…</div>
      )}
    </div>
  );
}

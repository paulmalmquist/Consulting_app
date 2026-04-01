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
  fetchProofAssets,
  fetchOutreachLog,
  resetAndReseed,
  TARGET_QUEUE,
  PROOF_ASSET_GAPS,
  type TodayOverdue,
  type Lead,
  type MetricsSnapshot,
  type SchemaHealth,
  type ProofAsset,
  type OutreachLogEntry,
  type TargetQueueItem,
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
  const [dataLoading, setDataLoading] = useState(false);
  const [reseedLoading, setReseedLoading] = useState(false);
  const [promotingCompany, setPromotingCompany] = useState<string | null>(null);
  const [promotedCompanies, setPromotedCompanies] = useState<Set<string>>(new Set());

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
      ]);
      if (results[0].status === "fulfilled") setActionData(results[0].value);
      if (results[1].status === "fulfilled") setTopLeads(results[1].value);
      if (results[2].status === "fulfilled") setMetrics(results[2].value);
      if (results[3].status === "fulfilled") setKanban(results[3].value);
      if (results[4].status === "fulfilled") setHealth(results[4].value);
      if (results[5].status === "fulfilled") setProofAssets(results[5].value);
      if (results[6].status === "fulfilled") setOutreachLog(results[6].value);
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

  const handlePromote = useCallback(async (target: TargetQueueItem) => {
    if (!businessId || promotedCompanies.has(target.company)) return;
    setPromotingCompany(target.company);
    try {
      const res = await fetch(`/bos/api/consulting/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: params.envId,
          business_id: businessId,
          company_name: target.company,
          lead_source: "client_hunting",
          contact_name: target.contact,
          contact_email: target.email || undefined,
          contact_title: target.contactTitle,
          contact_linkedin: target.linkedin || undefined,
        }),
      });
      if (res.ok) {
        setPromotedCompanies((prev) => new Set([...prev, target.company]));
        void reloadAll();
      }
    } catch (err) {
      console.error("Promote failed:", err);
    } finally {
      setPromotingCompany(null);
    }
  }, [params.envId, businessId, promotedCompanies, reloadAll]);

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

  // Deals missing next actions (from target queue)
  const dealsWithoutActions = TARGET_QUEUE.filter((t) => !t.nextAction);

  // Outreach-ready targets: have contact + email + offer
  const outreachReady = TARGET_QUEUE.filter(
    (t) => t.contact && t.email && !t.email.startsWith("[") && t.email !== "" && t.offer && (t.stage === "researched" || t.stage === "outreach_ready"),
  );

  // Blocked targets: no real contact
  const blockedTargets = TARGET_QUEUE.filter(
    (t) => !t.contact || t.contact.includes("Team") || t.contact.includes("Leadership") || !t.email || t.email === "",
  );

  // Generate forced actions from system state
  const forcedActions: Array<{ label: string; href?: string; action?: string; priority: "critical" | "high" | "normal" }> = [];

  if (pipelineEmpty && accountsInCRM === 0) {
    forcedActions.push({ label: "No accounts in CRM — promote targets below to start pipeline", action: "scroll_targets", priority: "critical" });
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
  if (blockedTargets.length > 0) {
    forcedActions.push({ label: `${blockedTargets.length} deals blocked — no real contact found`, action: "scroll_gaps", priority: "high" });
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
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                    fa.priority === "critical"
                      ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      : fa.priority === "high"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                      : "border-bm-border/50 bg-bm-surface/10 text-bm-text hover:bg-bm-surface/20"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    fa.priority === "critical" ? "bg-red-400 animate-pulse" : fa.priority === "high" ? "bg-amber-400" : "bg-bm-muted2"
                  }`} />
                  {fa.label}
                  <span className="ml-auto text-xs opacity-60">→</span>
                </Link>
              ) : (
                <div
                  key={idx}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                    fa.priority === "critical"
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : fa.priority === "high"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border-bm-border/50 bg-bm-surface/10 text-bm-text"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
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

      {/* ── SECTION 2: OUTREACH QUEUE — ready to send ────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">
            Outreach Ready ({outreachReady.length})
          </p>
          <Link href={`/lab/env/${params.envId}/consulting/strategic-outreach`} className="text-xs text-bm-accent hover:underline">
            Full outreach →
          </Link>
        </div>
        {outreachReady.length > 0 ? (
          <div className="space-y-2">
            {outreachReady.map((target) => {
              const alreadyInCRM = topLeads.some((l) => l.company_name.toLowerCase().includes(target.company.toLowerCase().split(" ")[0]));
              const promoted = promotedCompanies.has(target.company) || alreadyInCRM;
              return (
                <div
                  key={target.company}
                  className={`rounded-xl border px-4 py-3 ${
                    promoted ? "border-emerald-500/30 bg-emerald-500/5" : "border-bm-accent/30 bg-bm-accent/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-bm-text">{target.company}</span>
                        <span className="text-[9px] font-bold text-bm-accent border border-bm-accent/30 rounded px-1 py-0.5">{target.offerValue}</span>
                        {promoted && <span className="text-[10px] text-emerald-400 font-medium">✓ CRM</span>}
                      </div>
                      <p className="mt-1 text-xs text-bm-text">
                        {target.contact} · <span className="text-bm-muted2">{target.contactTitle}</span>
                      </p>
                      <p className="mt-1 text-[11px] text-bm-accent/80 font-medium">{target.nextAction}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {!promoted && (
                        <button
                          onClick={() => void handlePromote(target)}
                          disabled={promotingCompany === target.company}
                          className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-3 py-2 text-xs font-semibold text-bm-accent hover:bg-bm-accent/20 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {promotingCompany === target.company ? "Adding…" : "Promote →"}
                        </button>
                      )}
                      {target.linkedin && (
                        <a
                          href={target.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-bm-border/50 bg-bm-surface/20 px-3 py-2 text-xs text-bm-muted2 hover:text-bm-text text-center transition-colors"
                        >
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-bm-border/40 bg-bm-surface/10 px-4 py-3 text-sm text-bm-muted2">
            No outreach-ready targets. Enrich contacts below to unlock.
          </div>
        )}
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
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">Real Pipeline</p>
            <p className="text-lg font-bold text-emerald-400">{fmtCurrency(pipelineMetrics.real)}</p>
            <p className="text-[10px] text-bm-muted2">contact + outreach</p>
          </div>
          <div className="rounded-lg border border-bm-border/40 bg-bm-surface/10 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-bm-muted2 font-semibold">Potential</p>
            <p className="text-lg font-bold text-bm-muted2">{fmtCurrency(pipelineMetrics.potential)}</p>
            <p className="text-[10px] text-bm-muted2">needs outreach</p>
          </div>
        </div>

        {/* Compact stage strip */}
        {kanban?.columns?.length ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {kanban.columns
              .filter((col) => !["closed_won", "closed_lost"].includes(col.stage_key))
              .map((col) => (
                <Link
                  key={col.stage_key}
                  href={`/lab/env/${params.envId}/consulting/pipeline`}
                  className="flex-1 min-w-[70px] rounded-lg border border-bm-border/40 bg-bm-surface/10 px-2 py-1.5 text-center hover:bg-bm-surface/20 transition-colors"
                >
                  <p className="text-[9px] uppercase tracking-wider text-bm-muted2 truncate">{col.stage_label}</p>
                  <p className={`text-base font-semibold ${col.cards.length === 0 ? "text-bm-muted2/40" : "text-bm-text"}`}>
                    {col.cards.length}
                  </p>
                </Link>
              ))}
          </div>
        ) : null}
      </section>

      {/* ── SECTION 4: FOLLOW-UPS / NEEDS ACTION ──────────────────────── */}
      {blockedTargets.length > 0 ? (
        <section id="gaps-report">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-[0.12em] text-red-400 font-semibold">
              Blocked — No Contact ({blockedTargets.length})
            </p>
          </div>
          <div className="space-y-2">
            {blockedTargets.map((target) => (
              <div
                key={target.company}
                className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-bm-text">{target.company}</span>
                      <span className="text-[9px] text-red-400 font-bold uppercase px-1.5 py-0.5 border border-red-500/30 rounded">Blocked</span>
                    </div>
                    <p className="mt-1 text-xs text-bm-muted2">{target.segment} · {target.offerValue}</p>
                    <p className="mt-1 text-[11px] text-red-400/80 font-medium">{target.nextAction}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── SECTION 5: TARGET QUEUE (remaining) ─────────────────────── */}
      <section id="target-queue">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">All Targets ({TARGET_QUEUE.length})</p>
        </div>
        <div className="space-y-2">
          {TARGET_QUEUE.filter(
            (t) => !outreachReady.includes(t) && !blockedTargets.includes(t),
          ).map((target) => {
            const alreadyInCRM = topLeads.some((l) => l.company_name.toLowerCase().includes(target.company.toLowerCase().split(" ")[0]));
            const promoted = promotedCompanies.has(target.company) || alreadyInCRM;
            return (
              <div
                key={target.company}
                className={`rounded-xl border px-4 py-3 transition-colors ${
                  promoted ? "border-emerald-500/30 bg-emerald-500/5" : "border-bm-border/40 bg-bm-surface/10"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-bm-text">{target.company}</span>
                      <span className="text-[9px] font-bold text-bm-muted2 border border-bm-border/40 rounded px-1 py-0.5">{target.segment}</span>
                      {promoted && <span className="text-[10px] text-emerald-400 font-medium">✓ CRM</span>}
                    </div>
                    <p className="mt-1 text-xs text-bm-muted2">{target.signal}</p>
                    <p className="mt-1 text-xs text-bm-text/70">
                      <span className="text-bm-muted2">Contact:</span> {target.contact} · {target.contactTitle}
                    </p>
                    <p className="mt-1 text-[11px] text-bm-accent/80 font-medium">{target.nextAction}</p>
                    <p className="mt-0.5 text-[10px] text-bm-muted2">Due: {target.nextActionDue}</p>
                  </div>
                  {!promoted && (
                    <button
                      onClick={() => void handlePromote(target)}
                      disabled={promotingCompany === target.company}
                      className="flex-shrink-0 rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-3 py-2 text-xs font-semibold text-bm-accent hover:bg-bm-accent/20 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {promotingCompany === target.company ? "Adding…" : "Promote →"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SECTION 6: PROOF ASSET STATUS (compact) ──────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">Proof Assets</p>
          <Link href={`/lab/env/${params.envId}/consulting/proof-assets`} className="text-xs text-bm-accent hover:underline">
            Manage
          </Link>
        </div>
        <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 divide-y divide-bm-border/30">
          {PROOF_ASSET_GAPS.map((required) => {
            const found = proofAssets.find((a) => a.title.toLowerCase().includes(required.title.toLowerCase().split(" ")[0].toLowerCase()));
            const assetStatus = found ? found.status : "missing";
            return (
              <div key={required.title} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="text-xs text-bm-text font-medium truncate flex-1">{required.title}</p>
                <span className={`flex-shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  assetStatus === "ready" ? "bg-emerald-500/20 text-emerald-400" :
                  assetStatus === "draft" ? "bg-amber-500/20 text-amber-400" :
                  assetStatus === "needs_update" ? "bg-orange-500/20 text-orange-400" :
                  "bg-red-500/20 text-red-400"
                }`}>
                  {assetStatus === "missing" ? "Missing" : assetStatus.replace("_", " ")}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SECTION 7: KPI STRIP (compact) ───────────────────────────── */}
      <section>
        <div className="grid grid-cols-3 gap-2">
          <Link
            href={`/lab/env/${params.envId}/consulting/strategic-outreach`}
            className="rounded-lg border border-bm-border/40 bg-bm-surface/10 px-3 py-2 text-center hover:bg-bm-surface/20"
          >
            <p className="text-[9px] uppercase tracking-wider text-bm-muted2">Outreach 30d</p>
            <p className={`text-lg font-semibold ${(metrics?.outreach_count_30d ?? 0) === 0 ? "text-red-400" : "text-bm-text"}`}>
              {metrics?.outreach_count_30d ?? 0}
            </p>
          </Link>
          <Link
            href={`/lab/env/${params.envId}/consulting/pipeline`}
            className="rounded-lg border border-bm-border/40 bg-bm-surface/10 px-3 py-2 text-center hover:bg-bm-surface/20"
          >
            <p className="text-[9px] uppercase tracking-wider text-bm-muted2">Open Deals</p>
            <p className="text-lg font-semibold text-bm-text">{metrics?.open_opportunities ?? 0}</p>
          </Link>
          <Link
            href={`/lab/env/${params.envId}/consulting/clients`}
            className="rounded-lg border border-bm-border/40 bg-bm-surface/10 px-3 py-2 text-center hover:bg-bm-surface/20"
          >
            <p className="text-[9px] uppercase tracking-wider text-bm-muted2">Clients</p>
            <p className="text-lg font-semibold text-bm-text">{metrics?.active_clients ?? 0}</p>
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

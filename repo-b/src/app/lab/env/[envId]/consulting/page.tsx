"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
  resetAndReseed,
  TARGET_QUEUE,
  PROOF_ASSET_GAPS,
  type TodayOverdue,
  type Lead,
  type MetricsSnapshot,
  type SchemaHealth,
  type ProofAsset,
  type TargetQueueItem,
} from "@/lib/cro-api";
import { WeeklyRhythmCard } from "@/components/consulting/WeeklyRhythmCard";
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

// Hard-coded proof asset gaps — these are what you need to close deals
const REQUIRED_ASSETS = PROOF_ASSET_GAPS;

export default function ConsultingCommandCenter({ params }: { params: { envId: string } }) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const [actionData, setActionData] = useState<TodayOverdue | null>(null);
  const [topLeads, setTopLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [kanban, setKanban] = useState<{ columns: Array<{ stage_key: string; stage_label: string; cards: unknown[]; weighted_value: number }> } | null>(null);
  const [health, setHealth] = useState<SchemaHealth | null>(null);
  const [proofAssets, setProofAssets] = useState<ProofAsset[]>([]);
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
      ]);
      if (results[0].status === "fulfilled") setActionData(results[0].value);
      if (results[1].status === "fulfilled") setTopLeads(results[1].value.slice(0, 6));
      if (results[2].status === "fulfilled") setMetrics(results[2].value);
      if (results[3].status === "fulfilled") setKanban(results[3].value);
      if (results[4].status === "fulfilled") setHealth(results[4].value);
      if (results[5].status === "fulfilled") setProofAssets(results[5].value);
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
          contact_name: target.contact.split(",")[0],
          contact_email: target.email.startsWith("[") ? undefined : target.email,
          contact_title: target.contact.split(",")[1]?.trim(),
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
    forcedActions.push({ label: "No accounts in CRM — promote 3 targets from the queue below", action: "scroll_targets", priority: "critical" });
  }
  if (accountsInCRM > 0 && pipelineEmpty) {
    forcedActions.push({ label: `${accountsInCRM} accounts in CRM with no open opportunities — create deals`, href: `/lab/env/${params.envId}/consulting/pipeline`, priority: "critical" });
  }
  if (assetsTotal === 0) {
    forcedActions.push({ label: "Proof assets are missing — if someone replies, you have nothing to send", href: `/lab/env/${params.envId}/consulting/proof-assets`, priority: "critical" });
  } else if (assetsReady === 0 && assetsDraft > 0) {
    forcedActions.push({ label: `${assetsDraft} proof assets in draft — review and mark ready before outreach`, href: `/lab/env/${params.envId}/consulting/proof-assets`, priority: "high" });
  }
  if (accountsInCRM > 0 && metrics?.outreach_count_30d === 0) {
    forcedActions.push({ label: "Accounts exist but no outreach logged — send Touch 1 this week", href: `/lab/env/${params.envId}/consulting/strategic-outreach`, priority: "high" });
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
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

      {/* ── SECTION 1: FORCED TODAY'S ACTIONS ──────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">Today&apos;s Actions</p>
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

        {/* System-generated forced actions */}
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
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${fa.priority === "critical" ? "bg-red-400" : "bg-amber-400"}`} />
                  {fa.label}
                  <span className="ml-auto text-xs opacity-60">→</span>
                </Link>
              ) : (
                <div
                  key={idx}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                    fa.priority === "critical"
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${fa.priority === "critical" ? "bg-red-400" : "bg-amber-400"}`} />
                  {fa.label}
                  <span className="ml-auto text-[10px] opacity-60">↓ see below</span>
                </div>
              )
            ))}
          </div>
        ) : null}

        {/* Actual next actions from DB */}
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
            title="Scheduled Today"
            actions={actionData.today}
            businessId={businessId!}
            onUpdate={reloadAll}
          />
        ) : null}
        {hasNoActions && forcedActions.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
            No actions due. Check pipeline for deals that need advancing.
          </div>
        ) : null}
      </section>

      {/* ── WEEKLY RHYTHM ────────────────────────────────────────────────── */}
      <WeeklyRhythmCard />

      {/* ── SECTION 2: TARGET QUEUE — promote to CRM ───────────────────────── */}
      <section id="target-queue">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">Target Queue</p>
          <span className="text-[10px] text-bm-muted2">{TARGET_QUEUE.length} researched targets · promote to activate</span>
        </div>
        <div className="space-y-2">
          {TARGET_QUEUE.map((target) => {
            const alreadyInCRM = topLeads.some((l) => l.company_name.toLowerCase().includes(target.company.toLowerCase().split(" ")[0]));
            const promoted = promotedCompanies.has(target.company) || alreadyInCRM;
            return (
              <div
                key={target.company}
                className={`rounded-xl border px-4 py-3 transition-colors ${
                  promoted
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-bm-border/50 bg-bm-surface/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-bm-text">{target.company}</span>
                      <span className="text-[10px] font-bold text-bm-accent border border-bm-accent/30 rounded px-1.5 py-0.5">
                        {target.score}/25
                      </span>
                      {promoted && (
                        <span className="text-[10px] text-emerald-400 font-medium">✓ In CRM</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-bm-muted2 leading-relaxed">{target.signal}</p>
                    <p className="mt-1 text-xs text-bm-text/70">
                      <span className="text-bm-muted2">Offer:</span> {target.offer}
                    </p>
                    <p className="mt-0.5 text-xs text-bm-muted2">
                      {target.contact} · <span className="font-mono">{target.email}</span>
                    </p>
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

      {/* ── SECTION 3: PROOF ASSET GAPS ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">Proof Assets — Close Engine</p>
          <Link href={`/lab/env/${params.envId}/consulting/proof-assets`} className="text-xs text-bm-accent hover:underline">
            Manage
          </Link>
        </div>
        <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 divide-y divide-bm-border/30">
          {REQUIRED_ASSETS.map((required) => {
            const found = proofAssets.find((a) => a.title.toLowerCase().includes(required.title.toLowerCase().split(" ")[0].toLowerCase()));
            const assetStatus = found ? found.status : "missing";
            return (
              <div key={required.title} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-bm-text font-medium">{required.title}</p>
                  <p className="text-xs text-bm-muted2 mt-0.5">{required.description}</p>
                </div>
                <span className={`flex-shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded ${
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

      {/* ── SECTION 4: PIPELINE STATUS ──────────────────────────────────────── */}
      {kanban?.columns?.length ? (
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">Pipeline</p>
            <Link href={`/lab/env/${params.envId}/consulting/pipeline`} className="text-xs text-bm-accent hover:underline">
              Open Kanban →
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {kanban.columns
              .filter((col) => !["closed_won", "closed_lost"].includes(col.stage_key))
              .map((col) => (
                <Link
                  key={col.stage_key}
                  href={`/lab/env/${params.envId}/consulting/pipeline`}
                  className="flex-1 min-w-[90px] rounded-lg border border-bm-border/50 bg-bm-surface/10 px-3 py-2 text-center hover:bg-bm-surface/20 transition-colors"
                >
                  <p className="text-[10px] uppercase tracking-wider text-bm-muted2 truncate">{col.stage_label}</p>
                  <p className={`text-lg font-semibold ${col.cards.length === 0 ? "text-bm-muted2" : "text-bm-text"}`}>
                    {col.cards.length}
                  </p>
                  {col.weighted_value > 0 ? (
                    <p className="text-[10px] text-bm-muted2">{fmtCurrency(col.weighted_value)}</p>
                  ) : null}
                </Link>
              ))}
          </div>
        </section>
      ) : null}

      {/* ── SECTION 5: CRM ACCOUNTS IN SYSTEM ──────────────────────────────── */}
      {topLeads.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">In CRM ({topLeads.length})</p>
            <Link href={`/lab/env/${params.envId}/consulting/accounts`} className="text-xs text-bm-accent hover:underline">
              View all
            </Link>
          </div>
          <Card>
            <CardContent className="py-3">
              <div className="space-y-1.5">
                {topLeads.map((lead) => (
                  <Link
                    key={lead.crm_account_id}
                    href={`/lab/env/${params.envId}/consulting/accounts/${lead.crm_account_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-bm-border/40 px-3 py-2 hover:bg-bm-surface/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bm-text truncate">{lead.company_name}</p>
                      <p className="text-xs text-bm-muted2">
                        {lead.industry || "—"} · {lead.stage_label || lead.stage_key || "research"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-12 h-1.5 rounded-full bg-bm-surface/40 overflow-hidden">
                        <div className="h-full rounded-full bg-bm-accent" style={{ width: `${lead.lead_score}%` }} />
                      </div>
                      <span className="text-xs text-bm-muted2 w-5 text-right">{lead.lead_score}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* ── SECTION 6: KPI STRIP ────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric
            label="Pipeline"
            value={metrics ? fmtCurrency(metrics.weighted_pipeline) : "—"}
            sublabel="weighted"
            href={`/lab/env/${params.envId}/consulting/pipeline`}
          />
          <Metric
            label="Open Opps"
            value={metrics?.open_opportunities ?? 0}
            sublabel={metrics ? `${metrics.won_count_90d} won 90d` : "—"}
            href={`/lab/env/${params.envId}/consulting/pipeline`}
          />
          <Metric
            label="Outreach 30d"
            value={metrics?.outreach_count_30d ?? 0}
            sublabel={metrics?.response_rate_30d ? `${(metrics.response_rate_30d * 100).toFixed(0)}% reply` : "no replies yet"}
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
            href={`/lab/env/${params.envId}/consulting/clients`}
          />
        </div>
      </section>

      {/* Loading indicator */}
      {dataLoading && (
        <div className="text-center text-xs text-bm-muted2 py-2">Loading…</div>
      )}
    </div>
  );
}

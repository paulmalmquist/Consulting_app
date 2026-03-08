"use client";

import React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { cn } from "@/lib/cn";
import type { DealRadarDetailBundle, DealRadarNode } from "./types";
import {
  buildDealRecommendations,
  buildReadinessChecklist,
  formatMoney,
  formatMultiple,
  formatPercent,
  formatRelativeDate,
  RADAR_SECTOR_LABELS,
  RADAR_STAGE_LABELS,
} from "./utils";

function EmptyIntelligenceState() {
  return (
    <div className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Deal Intelligence</p>
      <p className="mt-3 text-lg font-semibold text-bm-text">Select a radar node to inspect deal readiness.</p>
      <p className="mt-2 text-sm text-bm-muted">
        The right panel will surface underwriting metrics, alerts, diligence gaps, and Winston recommendations.
      </p>
    </div>
  );
}

function sectionTitle(icon: ReactNode, label: string) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
    </div>
  );
}

export function DealIntelligencePanel({
  envId,
  node,
  details,
  loading = false,
  onAskWinston,
  className,
}: {
  envId: string;
  node?: DealRadarNode | null;
  details?: DealRadarDetailBundle | null;
  loading?: boolean;
  onAskWinston: (node: DealRadarNode) => void;
  className?: string;
}) {
  if (!node) return <EmptyIntelligenceState />;

  const checklist = buildReadinessChecklist(node, details);
  const recommendations = buildDealRecommendations(node, details);
  const nextBest = recommendations[0];

  return (
    <aside className={cn("space-y-4", className)}>
      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Selected Deal</p>
            <p className="mt-2 text-xl font-semibold text-bm-text">{node.dealName}</p>
            <p className="mt-1 text-sm text-bm-muted">{node.locationLabel}</p>
          </div>
          <span className="rounded-full border border-bm-border/50 bg-bm-bg/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
            {RADAR_STAGE_LABELS[node.stage]}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Strategy</p>
            <p className="mt-1 text-sm text-bm-text">{node.strategy || "—"}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Sector</p>
            <p className="mt-1 text-sm text-bm-text">{RADAR_SECTOR_LABELS[node.sector]}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Fund</p>
            <p className="mt-1 text-sm text-bm-text">{node.fundName || "Unassigned"}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Deal Size</p>
            <p className="mt-1 text-sm text-bm-text">{formatMoney(node.headlinePrice)}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Equity Required</p>
            <p className="mt-1 text-sm text-bm-text">{formatMoney(node.equityRequired)}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Target IRR</p>
            <p className="mt-1 text-sm text-bm-text">{formatPercent(node.targetIrr)}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Target MOIC</p>
            <p className="mt-1 text-sm text-bm-text">{formatMultiple(node.targetMoic)}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Sponsor</p>
            <p className="mt-1 text-sm text-bm-text">{node.sponsorName || "—"}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Broker</p>
            <p className="mt-1 text-sm text-bm-text">{node.brokerName || node.brokerOrg || "—"}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Last Updated</p>
            <p className="mt-1 text-sm text-bm-text">{formatRelativeDate(node.lastUpdatedAt)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(node.alerts.length ? node.alerts : ["priority"]).map((alert) => (
            <span
              key={alert}
              className="inline-flex items-center gap-1 rounded-full border border-bm-border/50 bg-bm-bg/55 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted"
            >
              <CircleAlert className="h-3 w-3" />
              {alert.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        {sectionTitle(<AlertTriangle className="h-4 w-4 text-bm-warning" />, "Pipeline Alerts")}
        <div className="mt-3 space-y-2.5">
          {node.blockers.length === 0 ? (
            <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 px-3 py-3 text-sm text-bm-muted">
              No active blockers are registered on this record.
            </div>
          ) : (
            node.blockers.map((blocker) => (
              <div key={blocker} className="rounded-xl border border-bm-warning/35 bg-bm-warning/10 px-3 py-3 text-sm text-bm-text">
                {blocker}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        {sectionTitle(<CheckCircle2 className="h-4 w-4 text-bm-accent" />, "Stage Readiness")}
        <div className="mt-3 space-y-2.5">
          {checklist.map((item) => (
            <div key={item.id} className="rounded-xl border border-bm-border/35 bg-bm-bg/45 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-bm-text">{item.label}</p>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
                    item.complete ? "bg-bm-success/18 text-bm-success" : "bg-bm-warning/15 text-bm-warning",
                  )}
                >
                  {item.complete ? "ready" : "missing"}
                </span>
              </div>
              <p className="mt-1 text-xs text-bm-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        {sectionTitle(<Sparkles className="h-4 w-4 text-bm-accent" />, "Winston Recommendations")}
        <div className="mt-3 space-y-2.5">
          {recommendations.map((item) => (
            <div key={item.id} className="rounded-xl border border-bm-border/35 bg-bm-bg/45 px-3 py-3">
              <p className="text-sm font-medium text-bm-text">{item.title}</p>
              <p className="mt-1 text-xs text-bm-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        {sectionTitle(<FileText className="h-4 w-4 text-bm-muted2" />, "Recent Activity")}
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-bm-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading supporting deal detail…
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {(details?.activities || []).slice(0, 4).map((activity) => (
              <div key={activity.activity_id || `${activity.activity_type}-${activity.occurred_at}`} className="rounded-xl border border-bm-border/35 bg-bm-bg/45 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                    {activity.activity_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-bm-muted">{formatRelativeDate(activity.occurred_at)}</span>
                </div>
                <p className="mt-1 text-sm text-bm-text">{activity.body || "Activity logged."}</p>
              </div>
            ))}
            {(!details?.activities || details.activities.length === 0) && (
              <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 px-3 py-3 text-sm text-bm-muted">
                No recent deal activity is attached to this record.
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        {sectionTitle(<ArrowRight className="h-4 w-4 text-bm-accent" />, "Next Best Action")}
        <p className="mt-3 text-sm text-bm-text">{nextBest.title}</p>
        <p className="mt-1 text-xs text-bm-muted">{nextBest.detail}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/lab/env/${envId}/re/pipeline/${node.dealId}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            View Deal
          </Link>
          <Link
            href={`/lab/env/${envId}/re/models?fromDeal=${node.dealId}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Open Model
          </Link>
          <Button variant="primary" size="sm" onClick={() => onAskWinston(node)}>
            Ask Winston
          </Button>
        </div>
      </section>
    </aside>
  );
}

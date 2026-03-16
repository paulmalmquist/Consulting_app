"use client";
import React from "react";

import Link from "next/link";
import type {
  PdsV2CommandCenter,
  PdsV2DeliveryRiskItem,
  PdsV2TimecardHealthItem,
  PdsV2SatisfactionItem,
  PdsV2CloseoutItem,
} from "@/lib/bos-api";

type InterventionItem = {
  id: string;
  category: "delivery" | "timecard" | "satisfaction" | "closeout";
  priority: number;
  title: string;
  detail: string;
  href?: string;
};

const CATEGORY_BADGE: Record<InterventionItem["category"], { label: string; className: string }> = {
  delivery: { label: "Delivery", className: "bg-pds-signalRed/15 text-red-200" },
  timecard: { label: "Timecard", className: "bg-pds-signalOrange/15 text-orange-200" },
  satisfaction: { label: "Client", className: "bg-pds-signalYellow/15 text-amber-200" },
  closeout: { label: "Closeout", className: "bg-pds-signalOrange/15 text-orange-200" },
};

function computeInterventions(cc: PdsV2CommandCenter): InterventionItem[] {
  const items: InterventionItem[] = [];

  cc.delivery_risk
    .filter((d: PdsV2DeliveryRiskItem) => d.severity === "red" || d.severity === "orange")
    .forEach((d: PdsV2DeliveryRiskItem) => {
      items.push({
        id: `delivery-${d.project_id}`,
        category: "delivery",
        priority: d.severity === "red" ? 5 : 4,
        title: d.project_name,
        detail: d.issue_summary || d.recommended_action || "Requires intervention",
        href: undefined,
      });
    });

  cc.timecard_health
    .filter((t: PdsV2TimecardHealthItem) => t.delinquent_count > 0)
    .forEach((t: PdsV2TimecardHealthItem) => {
      items.push({
        id: `timecard-${t.resource_id || t.resource_name}`,
        category: "timecard",
        priority: t.delinquent_count >= 3 ? 4 : 3,
        title: `Timecard delinquency — ${t.resource_name}`,
        detail: `${t.delinquent_count} delinquent submissions, ${t.overdue_hours} overdue hours`,
      });
    });

  cc.satisfaction
    .filter((s: PdsV2SatisfactionItem) => s.risk_state === "red" || s.risk_state === "orange" || Number(s.average_score) < 3.5)
    .forEach((s: PdsV2SatisfactionItem) => {
      items.push({
        id: `satisfaction-${s.account_id}`,
        category: "satisfaction",
        priority: s.risk_state === "red" ? 4 : 3,
        title: `Client risk — ${s.account_name}`,
        detail: `Score ${Number(s.average_score).toFixed(1)}, trend ${Number(s.trend_delta) >= 0 ? "+" : ""}${Number(s.trend_delta).toFixed(1)}`,
      });
    });

  cc.closeout
    .filter((c: PdsV2CloseoutItem) => c.blocker_count > 0 || c.closeout_aging_days > 30)
    .forEach((c: PdsV2CloseoutItem) => {
      items.push({
        id: `closeout-${c.project_id}`,
        category: "closeout",
        priority: c.blocker_count >= 2 ? 4 : 3,
        title: `Delayed closeout — ${c.project_name}`,
        detail: `${c.blocker_count} blockers, ${c.closeout_aging_days} days aging`,
        href: c.href,
      });
    });

  return items.sort((a, b) => b.priority - a.priority).slice(0, 8);
}

export function PdsInterventionQueue({ commandCenter }: { commandCenter: PdsV2CommandCenter }) {
  const items = computeInterventions(commandCenter);
  if (!items.length) return null;

  return (
    <section className="rounded-3xl border border-pds-signalRed/20 bg-pds-signalRed/5 p-4" data-testid="pds-intervention-queue">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pds-signalRed/70">Intervention Queue</p>
          <h3 className="text-lg font-semibold">Highest Priority Actions</h3>
        </div>
        <p className="text-xs text-bm-muted2">{items.length} items requiring attention</p>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => {
          const badge = CATEGORY_BADGE[item.category];
          const inner = (
            <div className="flex items-start gap-3 rounded-xl border border-bm-border/40 bg-bm-surface/20 px-4 py-3 transition hover:bg-bm-surface/30">
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${badge.className}`}>
                {badge.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs text-bm-muted2">{item.detail}</p>
              </div>
            </div>
          );
          return item.href ? (
            <Link key={item.id} href={item.href}>{inner}</Link>
          ) : (
            <div key={item.id}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}

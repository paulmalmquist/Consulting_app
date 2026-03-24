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
import { toNumber, formatPercent, formatCurrency } from "@/components/pds-enterprise/pdsEnterprise";

type InterventionCategory = "revenue" | "delivery" | "timecard" | "satisfaction" | "closeout";

type InterventionItem = {
  id: string;
  category: InterventionCategory;
  priority: number;
  title: string;
  detail: string;
  impact?: string;
  href?: string;
};

const CATEGORY_GROUPS: Array<{ key: InterventionCategory; label: string; icon: string }> = [
  { key: "revenue", label: "Revenue Risk", icon: "\u26A0" },
  { key: "delivery", label: "Delivery Risk", icon: "\u26D4" },
  { key: "timecard", label: "Staffing / Utilization", icon: "\u23F0" },
  { key: "satisfaction", label: "Client Risk", icon: "\u2139" },
  { key: "closeout", label: "Closeout", icon: "\u2717" },
];

const CATEGORY_BG: Record<InterventionCategory, string> = {
  revenue: "bg-pds-signalRed/[0.08] border-pds-signalRed/20",
  delivery: "bg-pds-signalRed/[0.06] border-pds-signalRed/15",
  timecard: "bg-pds-signalOrange/[0.06] border-pds-signalOrange/15",
  satisfaction: "bg-pds-signalYellow/[0.06] border-pds-signalYellow/15",
  closeout: "bg-pds-signalOrange/[0.05] border-pds-signalOrange/15",
};

const CATEGORY_DOT: Record<InterventionCategory, string> = {
  revenue: "bg-pds-signalRed",
  delivery: "bg-pds-signalRed",
  timecard: "bg-pds-signalOrange",
  satisfaction: "bg-pds-signalYellow",
  closeout: "bg-pds-signalOrange",
};

function variancePct(actual: string | number | undefined, plan: string | number | undefined): number {
  const a = toNumber(actual);
  const p = toNumber(plan);
  if (p === 0) return 0;
  return (a - p) / Math.abs(p);
}

function computeInterventions(cc: PdsV2CommandCenter): InterventionItem[] {
  const items: InterventionItem[] = [];

  // Revenue risk: markets missing plan by >5%
  for (const r of cc.performance_table.rows) {
    const vPct = variancePct(r.fee_actual, r.fee_plan);
    if (vPct < -0.05) {
      const gap = toNumber(r.fee_actual) - toNumber(r.fee_plan);
      items.push({
        id: `revenue-${r.entity_id}`,
        category: "revenue",
        priority: vPct < -0.10 ? 5 : 4,
        title: r.entity_label,
        detail: `${formatPercent(vPct, 1)} vs plan`,
        impact: formatCurrency(gap),
        href: r.href ?? undefined,
      });
    }
  }

  // Delivery risk
  cc.delivery_risk
    .filter((d: PdsV2DeliveryRiskItem) => d.severity === "red" || d.severity === "orange")
    .forEach((d: PdsV2DeliveryRiskItem) => {
      items.push({
        id: `delivery-${d.project_id}`,
        category: "delivery",
        priority: d.severity === "red" ? 5 : 4,
        title: d.project_name,
        detail: d.issue_summary || d.recommended_action || "Requires intervention",
        impact: d.market_name || undefined,
        href: undefined,
      });
    });

  // Timecard delinquency
  cc.timecard_health
    .filter((t: PdsV2TimecardHealthItem) => t.delinquent_count > 0)
    .forEach((t: PdsV2TimecardHealthItem) => {
      items.push({
        id: `timecard-${t.resource_id || t.resource_name}`,
        category: "timecard",
        priority: t.delinquent_count >= 3 ? 4 : 3,
        title: t.resource_name,
        detail: `${t.delinquent_count} delinquent timecard${t.delinquent_count > 1 ? "s" : ""}`,
        impact: "Revenue recognition delay",
      });
    });

  // Client satisfaction
  cc.satisfaction
    .filter((s: PdsV2SatisfactionItem) => s.risk_state === "red" || s.risk_state === "orange" || Number(s.average_score) < 3.5)
    .forEach((s: PdsV2SatisfactionItem) => {
      items.push({
        id: `satisfaction-${s.account_id}`,
        category: "satisfaction",
        priority: s.risk_state === "red" ? 4 : 3,
        title: s.account_name,
        detail: `Client score ${Number(s.average_score).toFixed(1)}`,
      });
    });

  // Closeout blockers
  cc.closeout
    .filter((c: PdsV2CloseoutItem) => c.blocker_count > 0 || c.closeout_aging_days > 30)
    .forEach((c: PdsV2CloseoutItem) => {
      items.push({
        id: `closeout-${c.project_id}`,
        category: "closeout",
        priority: c.blocker_count >= 2 ? 4 : 3,
        title: c.project_name,
        detail: `${c.blocker_count} blocker${c.blocker_count !== 1 ? "s" : ""}, ${c.closeout_aging_days}d aging`,
        href: c.href,
      });
    });

  return items.sort((a, b) => b.priority - a.priority).slice(0, 12);
}

function InterventionItemRow({ item }: { item: InterventionItem }) {
  const content = (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2 transition ${CATEGORY_BG[item.category]} ${item.href ? "hover:brightness-110 cursor-pointer" : ""}`}>
      <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${CATEGORY_DOT[item.category]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-bm-text">{item.title}</span>
          <span className="text-xs text-bm-muted2">{item.detail}</span>
        </div>
        {item.impact ? (
          <p className="mt-0.5 text-[11px] font-medium text-pds-signalRed/80">{item.impact}</p>
        ) : null}
      </div>
    </div>
  );

  if (item.href) {
    return <Link href={item.href}>{content}</Link>;
  }
  return content;
}

export function PdsInterventionQueue({ commandCenter }: { commandCenter: PdsV2CommandCenter }) {
  const items = computeInterventions(commandCenter);
  if (!items.length) return null;

  const totalCount = items.length;

  return (
    <section
      className="rounded-xl border border-pds-signalRed/20 bg-pds-card/50 px-5 py-4"
      data-testid="pds-intervention-queue"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pds-signalRed/15 text-pds-signalRed text-xs font-bold">
          {totalCount}
        </span>
        <h3 className="text-sm font-semibold text-bm-text">
          Critical issues requiring attention
        </h3>
      </div>

      <div className="space-y-4">
        {CATEGORY_GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.category === group.key);
          if (!groupItems.length) return null;
          return (
            <div key={group.key}>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 mb-1.5">
                {group.icon} {group.label}
              </h4>
              <div className="space-y-1.5">
                {groupItems.map((item) => (
                  <InterventionItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

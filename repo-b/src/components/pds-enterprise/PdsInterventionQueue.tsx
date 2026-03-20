"use client";
import React from "react";

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

const CATEGORY_LABEL: Record<InterventionItem["category"], string> = {
  delivery: "Delivery",
  timecard: "Timecard",
  satisfaction: "Client",
  closeout: "Closeout",
};

const CATEGORY_DOT: Record<InterventionItem["category"], string> = {
  delivery: "bg-pds-signalRed",
  timecard: "bg-pds-signalOrange",
  satisfaction: "bg-pds-signalYellow",
  closeout: "bg-pds-signalOrange",
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
        title: `${t.resource_name}`,
        detail: `${t.delinquent_count} delinquent timecard${t.delinquent_count > 1 ? "s" : ""}`,
      });
    });

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

  return items.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

export function PdsInterventionQueue({ commandCenter }: { commandCenter: PdsV2CommandCenter }) {
  const items = computeInterventions(commandCenter);
  if (!items.length) return null;

  // Group timecards into a single line if multiple
  const timecardItems = items.filter((i) => i.category === "timecard");
  const otherItems = items.filter((i) => i.category !== "timecard");

  return (
    <section
      className="rounded-xl border border-pds-signalOrange/20 bg-pds-card/40 px-4 py-3"
      data-testid="pds-intervention-queue"
    >
      <div className="flex items-center gap-2">
        <span className="text-pds-signalOrange text-sm">&#9888;</span>
        <h3 className="text-sm font-semibold text-bm-text">
          {items.length} issue{items.length !== 1 ? "s" : ""} need attention
        </h3>
      </div>
      <ul className="mt-2 space-y-1.5">
        {otherItems.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORY_DOT[item.category]}`} />
            <span className="text-bm-text">
              <span className="font-medium">{item.title}</span>
              <span className="text-bm-muted2"> — {item.detail}</span>
            </span>
          </li>
        ))}
        {timecardItems.length > 0 && (
          <li className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORY_DOT.timecard}`} />
            <span className="text-bm-text">
              {timecardItems.length === 1 ? (
                <>
                  <span className="font-medium">{timecardItems[0].title}</span>
                  <span className="text-bm-muted2"> — {timecardItems[0].detail}</span>
                </>
              ) : (
                <>
                  <span className="font-medium">{timecardItems.reduce((s, t) => {
                    const count = parseInt(t.detail) || 1;
                    return s + count;
                  }, 0)} delinquent timecards</span>
                  <span className="text-bm-muted2"> across {timecardItems.length} resources</span>
                </>
              )}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}

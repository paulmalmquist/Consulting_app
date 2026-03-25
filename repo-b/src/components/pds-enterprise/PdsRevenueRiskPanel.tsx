"use client";

import React, { useMemo } from "react";
import type { PdsV2CommandCenter } from "@/lib/bos-api";
import { toNumber, formatCurrency, formatPercent } from "@/components/pds-enterprise/pdsEnterprise";

type RiskItem = {
  id: string;
  name: string;
  issue: string;
  impact: string;
  severity: "critical" | "warning" | "info";
  category: "below_plan" | "timecard" | "delivery";
};

const SEVERITY_BORDER: Record<RiskItem["severity"], string> = {
  critical: "border-l-pds-signalRed/50",
  warning: "border-l-pds-signalOrange/40",
  info: "border-l-bm-border/60",
};

const SEVERITY_BG: Record<RiskItem["severity"], string> = {
  critical: "bg-red-500/[0.05]",
  warning: "bg-amber-500/[0.04]",
  info: "bg-pds-card/30",
};

const SEVERITY_DOT: Record<RiskItem["severity"], string> = {
  critical: "bg-pds-signalRed",
  warning: "bg-pds-signalOrange",
  info: "bg-bm-muted2",
};

function buildRiskItems(cc: PdsV2CommandCenter): RiskItem[] {
  const items: RiskItem[] = [];

  // 1. Below-plan entities (>5% miss)
  const rows = cc.performance_table?.rows ?? [];
  for (const r of rows) {
    const actual = toNumber(r.fee_actual);
    const plan = toNumber(r.fee_plan);
    if (plan <= 0) continue;
    const variancePct = (actual - plan) / plan;
    if (variancePct >= -0.05) continue;

    const shortfall = Math.abs(actual - plan);
    items.push({
      id: `bp-${r.entity_id}`,
      name: r.entity_label,
      issue: `${formatPercent(variancePct, 1)} vs plan (${formatCurrency(shortfall)} shortfall)`,
      impact: `Fee revenue gap of ${formatCurrency(shortfall)}`,
      severity: variancePct < -0.10 ? "critical" : "warning",
      category: "below_plan",
    });
  }

  // 2. Timecard revenue risk
  const timecards = cc.timecard_health ?? [];
  for (const tc of timecards) {
    if (tc.delinquent_count <= 0) continue;
    items.push({
      id: `tc-${tc.resource_id || tc.resource_name}`,
      name: tc.resource_name,
      issue: `${tc.delinquent_count} delinquent timecard${tc.delinquent_count > 1 ? "s" : ""}`,
      impact: "Revenue recognition delay",
      severity: tc.delinquent_count >= 3 ? "critical" : "warning",
      category: "timecard",
    });
  }

  // 3. Delivery-linked revenue risk (red/orange projects)
  const risks = cc.delivery_risk ?? [];
  for (const dr of risks) {
    if (dr.severity !== "red" && dr.severity !== "orange") continue;
    items.push({
      id: `dr-${dr.project_id}`,
      name: dr.project_name,
      issue: dr.issue_summary,
      impact: `${dr.account_name ? dr.account_name + " — " : ""}Late delivery delays billing`,
      severity: dr.severity === "red" ? "critical" : "warning",
      category: "delivery",
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 12);
}

const CATEGORY_LABELS: Record<RiskItem["category"], string> = {
  below_plan: "Below-Plan Entities",
  timecard: "Timecard Revenue Risk",
  delivery: "Delivery-Linked Risk",
};

function RiskCard({ item }: { item: RiskItem }) {
  return (
    <article className={`rounded-xl border border-bm-border/50 border-l-2 ${SEVERITY_BORDER[item.severity]} ${SEVERITY_BG[item.severity]} p-3`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[item.severity]}`} />
        <h4 className="text-sm font-semibold text-bm-text">{item.name}</h4>
      </div>
      <p className="mt-1 text-xs text-bm-muted2">{item.issue}</p>
      <div className="mt-2 flex items-start gap-1 text-[11px]">
        <span className="shrink-0 font-medium text-pds-signalOrange">Impact:</span>
        <span className="text-bm-muted2">{item.impact}</span>
      </div>
    </article>
  );
}

export function PdsRevenueRiskPanel({ commandCenter }: { commandCenter: PdsV2CommandCenter }) {
  const riskItems = useMemo(() => buildRiskItems(commandCenter), [commandCenter]);

  const belowPlan = riskItems.filter((i) => i.category === "below_plan");
  const timecardRisks = riskItems.filter((i) => i.category === "timecard");
  const deliveryRisks = riskItems.filter((i) => i.category === "delivery");

  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-revenue-risk-panel">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bm-muted2">Revenue Risk</p>
          <h3 className="text-base font-semibold text-bm-text">Items Affecting Revenue Recognition</h3>
        </div>
        <p className="text-xs text-bm-muted2">
          {riskItems.length} risk{riskItems.length !== 1 ? "s" : ""} identified
        </p>
      </div>

      {riskItems.length === 0 ? (
        <p className="rounded-xl border border-bm-border/60 bg-pds-card/30 p-4 text-sm text-bm-muted2">
          No revenue risks requiring attention.
        </p>
      ) : (
        <div className="space-y-4">
          {([
            ["below_plan", belowPlan],
            ["timecard", timecardRisks],
            ["delivery", deliveryRisks],
          ] as [RiskItem["category"], RiskItem[]][]).map(([cat, items]) =>
            items.length > 0 ? (
              <div key={cat}>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 mb-2">
                  {CATEGORY_LABELS[cat]}
                </h4>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <RiskCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}

"use client";
import React from "react";

import type { PdsV2ResourceHealthItem, PdsV2TimecardHealthItem } from "@/lib/bos-api";
import { formatPercent, reasonLabel, toNumber } from "@/components/pds-enterprise/pdsEnterprise";

type ActionItem = {
  id: string;
  name: string;
  issue: string;
  impact: string;
  action: string;
  severity: "critical" | "warning" | "info";
};

function buildActions(
  resources: PdsV2ResourceHealthItem[],
  timecards: PdsV2TimecardHealthItem[],
): ActionItem[] {
  const items: ActionItem[] = [];

  // Build lookup for timecard delinquency by resource name
  const timecardMap = new Map<string, PdsV2TimecardHealthItem>();
  for (const tc of timecards) {
    if (tc.delinquent_count > 0) {
      timecardMap.set(tc.resource_name, tc);
    }
  }

  for (const r of resources) {
    const util = toNumber(r.utilization_pct);
    const hasDelinquent = r.delinquent_timecards > 0;
    const isLowUtil = util < 0.5 && util > 0;
    const isOverloaded = r.overload_flag;
    const tc = timecardMap.get(r.resource_name);

    if (!hasDelinquent && !isLowUtil && !isOverloaded && !tc) continue;

    const issues: string[] = [];
    if (isLowUtil) issues.push(`Low utilization (${formatPercent(r.utilization_pct, 0)})`);
    if (isOverloaded) issues.push("Overloaded");
    if (hasDelinquent) issues.push(`${r.delinquent_timecards} delinquent timecard${r.delinquent_timecards > 1 ? "s" : ""}`);
    if (tc && !hasDelinquent) issues.push(`${tc.delinquent_count} delinquent submission${tc.delinquent_count > 1 ? "s" : ""}`);

    const impacts: string[] = [];
    if (isLowUtil) impacts.push("CI miss risk");
    if (isOverloaded) impacts.push("Burnout / delivery risk");
    if (hasDelinquent || tc) impacts.push("Revenue recognition delay");

    const actions: string[] = [];
    if (isLowUtil) actions.push("Review allocation");
    if (isOverloaded) actions.push("Rebalance workload");
    if (hasDelinquent || tc) actions.push("Follow up on timecards");

    const severity: ActionItem["severity"] =
      (hasDelinquent && isLowUtil) || isOverloaded ? "critical" : hasDelinquent || isLowUtil ? "warning" : "info";

    items.push({
      id: r.resource_id,
      name: r.resource_name,
      issue: issues.join(" + "),
      impact: impacts.join("; "),
      action: actions.join("; "),
      severity,
    });

    // Remove from timecard map so we don't double-count
    timecardMap.delete(r.resource_name);
  }

  // Add remaining timecard-only issues
  for (const [, tc] of timecardMap) {
    items.push({
      id: tc.resource_id || tc.resource_name,
      name: tc.resource_name,
      issue: `${tc.delinquent_count} delinquent timecard${tc.delinquent_count > 1 ? "s" : ""}`,
      impact: "Revenue recognition delay",
      action: "Follow up on timecards",
      severity: tc.delinquent_count >= 3 ? "critical" : "warning",
    });
  }

  // Sort: critical first, then warning, then info
  const order = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 6);
}

const SEVERITY_DOT: Record<ActionItem["severity"], string> = {
  critical: "bg-pds-signalRed",
  warning: "bg-pds-signalOrange",
  info: "bg-bm-muted2",
};

const SEVERITY_BORDER: Record<ActionItem["severity"], string> = {
  critical: "border-l-pds-signalRed/50",
  warning: "border-l-pds-signalOrange/40",
  info: "border-l-bm-border/60",
};

export function PdsResourceHealthPanel({
  resources,
  timecards,
}: {
  resources: PdsV2ResourceHealthItem[];
  timecards: PdsV2TimecardHealthItem[];
}) {
  const actionItems = buildActions(resources, timecards);

  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-resource-health-panel">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pds-gold/70">Action Required</p>
          <h3 className="text-base font-semibold text-bm-text">Staffing & Submission Issues</h3>
        </div>
        <p className="text-xs text-bm-muted2">{actionItems.length} item{actionItems.length !== 1 ? "s" : ""} requiring follow-up</p>
      </div>

      {actionItems.length === 0 ? (
        <p className="rounded-xl border border-bm-border/60 bg-pds-card/30 p-4 text-sm text-bm-muted2">
          No staffing or timecard issues requiring action.
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {actionItems.map((item) => (
            <article
              key={item.id}
              className={`rounded-xl border border-bm-border/50 border-l-2 ${SEVERITY_BORDER[item.severity]} bg-pds-card/30 p-3`}
            >
              <div className="flex items-center gap-2">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[item.severity]}`} />
                <h4 className="text-sm font-semibold text-bm-text">{item.name}</h4>
              </div>
              <p className="mt-1 text-xs text-bm-muted2">{item.issue}</p>
              <div className="mt-2 flex items-start gap-1 text-[11px]">
                <span className="shrink-0 font-medium text-pds-signalOrange">Impact:</span>
                <span className="text-bm-muted2">{item.impact}</span>
              </div>
              <div className="mt-1 flex items-start gap-1 text-[11px]">
                <span className="shrink-0 font-medium text-pds-signalGreen">Action:</span>
                <span className="text-bm-muted2">{item.action}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

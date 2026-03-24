"use client";
import React from "react";

import type { PdsV2ResourceHealthItem, PdsV2TimecardHealthItem } from "@/lib/bos-api";
import { formatPercent, toNumber } from "@/components/pds-enterprise/pdsEnterprise";

type ActionItem = {
  id: string;
  name: string;
  issue: string;
  impact: string;
  action: string;
  severity: "critical" | "warning" | "info";
  subCategory: "utilization" | "timecard" | "mixed";
};

function buildActions(
  resources: PdsV2ResourceHealthItem[],
  timecards: PdsV2TimecardHealthItem[],
): ActionItem[] {
  const items: ActionItem[] = [];

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

    const hasUtilIssue = isLowUtil || isOverloaded;
    const hasTimecardIssue = hasDelinquent || !!tc;
    const subCategory: ActionItem["subCategory"] = hasUtilIssue && hasTimecardIssue ? "mixed" : hasUtilIssue ? "utilization" : "timecard";

    items.push({
      id: r.resource_id,
      name: r.resource_name,
      issue: issues.join(" + "),
      impact: impacts.join("; "),
      action: actions.join("; "),
      severity,
      subCategory,
    });

    timecardMap.delete(r.resource_name);
  }

  // Remaining timecard-only issues
  for (const [, tc] of timecardMap) {
    items.push({
      id: tc.resource_id || tc.resource_name,
      name: tc.resource_name,
      issue: `${tc.delinquent_count} delinquent timecard${tc.delinquent_count > 1 ? "s" : ""}`,
      impact: "Revenue recognition delay",
      action: "Follow up on timecards",
      severity: tc.delinquent_count >= 3 ? "critical" : "warning",
      subCategory: "timecard",
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 8);
}

const SEVERITY_DOT: Record<ActionItem["severity"], string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-slate-500",
};

const SEVERITY_STRIPE: Record<ActionItem["severity"], string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-slate-600",
};

const SEVERITY_BG: Record<ActionItem["severity"], string> = {
  critical: "bg-red-500/[0.06]",
  warning: "bg-amber-500/[0.04]",
  info: "",
};

const SEVERITY_LABEL: Record<ActionItem["severity"], { text: string; color: string }> = {
  critical: { text: "Critical", color: "text-red-400" },
  warning: { text: "Warning", color: "text-amber-400" },
  info: { text: "Info", color: "text-slate-500" },
};

function ActionCard({ item }: { item: ActionItem }) {
  return (
    <article className={`relative overflow-hidden rounded-lg border border-slate-700/30 ${SEVERITY_BG[item.severity]} p-3`}>
      <div className={`absolute left-0 top-0 h-full w-0.5 ${SEVERITY_STRIPE[item.severity]}`} />
      <div className="pl-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[item.severity]}`} />
            <h4 className="text-sm font-semibold text-bm-text">{item.name}</h4>
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_LABEL[item.severity].color}`}>
            {SEVERITY_LABEL[item.severity].text}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-400">{item.issue}</p>
        <div className="mt-2 flex items-center gap-3 text-[11px]">
          <span className="text-red-400/80">{item.impact}</span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400/80">{item.action}</span>
        </div>
      </div>
    </article>
  );
}

export function PdsResourceHealthPanel({
  resources,
  timecards,
}: {
  resources: PdsV2ResourceHealthItem[];
  timecards: PdsV2TimecardHealthItem[];
}) {
  const actionItems = buildActions(resources, timecards);

  const criticalCount = actionItems.filter((i) => i.severity === "critical").length;
  const warningCount = actionItems.filter((i) => i.severity === "warning").length;

  return (
    <section className="rounded-lg border border-slate-700/30 bg-slate-800/[0.15] p-4" data-testid="pds-resource-health-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Action Required</p>
          <h3 className="text-base font-semibold text-bm-text">People to Call Today</h3>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {criticalCount > 0 && (
            <span className="rounded-md bg-red-500/15 px-2 py-0.5 font-semibold text-red-400">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-400">
              {warningCount} warning
            </span>
          )}
          <span className="text-slate-500">{actionItems.length} total</span>
        </div>
      </div>

      {actionItems.length === 0 ? (
        <p className="rounded-lg border border-slate-700/30 p-4 text-sm text-slate-500">
          No staffing or timecard issues requiring action.
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {actionItems.map((item) => (
            <ActionCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

"use client";
import React from "react";

import type { PdsV2CommandCenter } from "@/lib/bos-api";
import { toNumber, formatPercent } from "@/components/pds-enterprise/pdsEnterprise";

type Signal = {
  icon: string;
  tone: "danger" | "warn" | "positive" | "neutral";
  message: string;
};

const TONE_STYLES: Record<Signal["tone"], string> = {
  danger: "border-pds-signalRed/30 bg-pds-signalRed/8 text-red-200",
  warn: "border-pds-signalOrange/30 bg-pds-signalOrange/8 text-amber-200",
  positive: "border-pds-signalGreen/20 bg-pds-signalGreen/8 text-emerald-200",
  neutral: "border-bm-border/50 bg-bm-surface/20 text-bm-muted2",
};

function computeSignals(cc: PdsV2CommandCenter): Signal[] {
  const signals: Signal[] = [];
  const rows = cc.performance_table.rows;

  // Markets below revenue plan
  const belowPlan = rows.filter(
    (r) => toNumber(r.fee_actual) < toNumber(r.fee_plan) && toNumber(r.fee_plan) > 0
  );
  if (belowPlan.length > 0) {
    signals.push({
      icon: "\u26A0",
      tone: belowPlan.length >= 3 ? "danger" : "warn",
      message: `${belowPlan.length} market${belowPlan.length > 1 ? "s" : ""} below revenue plan`,
    });
  } else {
    signals.push({ icon: "\u2713", tone: "positive", message: "All markets at or above revenue plan" });
  }

  // Staffing pressure
  const pressured = cc.resource_health.filter((r) => r.overload_flag || r.staffing_gap_flag);
  if (pressured.length > 0) {
    const regions = [...new Set(pressured.map((r) => r.market_name).filter(Boolean))];
    signals.push({
      icon: "\u26A0",
      tone: pressured.length >= 5 ? "danger" : "warn",
      message: `Staffing pressure${regions.length ? ` in ${regions.slice(0, 2).join(", ")}` : ""} (${pressured.length} resources)`,
    });
  } else {
    signals.push({ icon: "\u2713", tone: "positive", message: "No staffing pressure detected" });
  }

  // Backlog coverage
  const totalBacklog = rows.reduce((sum, r) => sum + toNumber(r.backlog), 0);
  const totalForecast = rows.reduce((sum, r) => sum + toNumber(r.forecast), 0);
  const coverage = totalForecast > 0 ? totalBacklog / totalForecast : 0;
  if (coverage >= 0.7) {
    signals.push({ icon: "\u2713", tone: "positive", message: `Backlog coverage at ${formatPercent(coverage, 0)}` });
  } else {
    signals.push({ icon: "\u26A0", tone: coverage < 0.5 ? "danger" : "warn", message: `Backlog coverage at ${formatPercent(coverage, 0)} — below target` });
  }

  // Red projects
  const totalRed = rows.reduce((sum, r) => sum + (r.red_projects || 0), 0);
  if (totalRed > 0) {
    signals.push({ icon: "\u26A0", tone: totalRed >= 5 ? "danger" : "warn", message: `${totalRed} red project${totalRed > 1 ? "s" : ""} across portfolio` });
  } else {
    signals.push({ icon: "\u2713", tone: "positive", message: "No red projects" });
  }

  // Delinquent timecards
  const delinquent = cc.timecard_health.filter((t) => t.delinquent_count > 0);
  if (delinquent.length > 0) {
    const total = delinquent.reduce((s, t) => s + t.delinquent_count, 0);
    signals.push({ icon: "\u26A0", tone: "warn", message: `${total} delinquent timecard${total > 1 ? "s" : ""} (${delinquent.length} resource${delinquent.length > 1 ? "s" : ""})` });
  }

  return signals;
}

export function PdsSignalsStrip({ commandCenter }: { commandCenter: PdsV2CommandCenter }) {
  const signals = computeSignals(commandCenter);

  return (
    <section className="flex flex-wrap gap-2" data-testid="pds-signals-strip">
      {signals.map((signal, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium ${TONE_STYLES[signal.tone]}`}
        >
          <span className="text-sm">{signal.icon}</span>
          <span>{signal.message}</span>
        </div>
      ))}
    </section>
  );
}

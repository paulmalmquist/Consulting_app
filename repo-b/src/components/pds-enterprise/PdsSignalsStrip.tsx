"use client";
import React from "react";

import type { PdsV2CommandCenter } from "@/lib/bos-api";
import { toNumber, formatPercent } from "@/components/pds-enterprise/pdsEnterprise";

type Signal = {
  tone: "danger" | "warn" | "positive" | "neutral";
  message: string;
};

const TONE_STYLES: Record<Signal["tone"], string> = {
  danger: "border-pds-signalRed/20 text-pds-signalRed",
  warn: "border-pds-signalOrange/20 text-pds-signalOrange",
  positive: "border-pds-signalGreen/15 text-pds-signalGreen",
  neutral: "border-bm-border/40 text-bm-muted2",
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
      tone: belowPlan.length >= 3 ? "danger" : "warn",
      message: `${belowPlan.length} market${belowPlan.length > 1 ? "s" : ""} below plan`,
    });
  }

  // Staffing pressure
  const pressured = cc.resource_health.filter((r) => r.overload_flag || r.staffing_gap_flag);
  if (pressured.length > 0) {
    signals.push({
      tone: pressured.length >= 5 ? "danger" : "warn",
      message: `${pressured.length} resource${pressured.length > 1 ? "s" : ""} staffing pressure`,
    });
  }

  // Backlog coverage
  const totalBacklog = rows.reduce((sum, r) => sum + toNumber(r.backlog), 0);
  const totalForecast = rows.reduce((sum, r) => sum + toNumber(r.forecast), 0);
  const coverage = totalForecast > 0 ? totalBacklog / totalForecast : 0;
  signals.push({
    tone: coverage >= 0.7 ? "positive" : coverage < 0.5 ? "danger" : "warn",
    message: `Backlog ${formatPercent(coverage, 0)}`,
  });

  // Red projects
  const totalRed = rows.reduce((sum, r) => sum + (r.red_projects || 0), 0);
  if (totalRed > 0) {
    signals.push({
      tone: totalRed >= 5 ? "danger" : "warn",
      message: `${totalRed} red project${totalRed > 1 ? "s" : ""}`,
    });
  }

  // Delinquent timecards
  const delinquent = cc.timecard_health.filter((t) => t.delinquent_count > 0);
  if (delinquent.length > 0) {
    const total = delinquent.reduce((s, t) => s + t.delinquent_count, 0);
    signals.push({
      tone: "warn",
      message: `${total} delinquent TC${total > 1 ? "s" : ""}`,
    });
  }

  return signals;
}

export function PdsSignalsStrip({ commandCenter }: { commandCenter: PdsV2CommandCenter }) {
  const signals = computeSignals(commandCenter);

  return (
    <section className="flex flex-wrap gap-1.5" data-testid="pds-signals-strip">
      {signals.map((signal, i) => (
        <span
          key={i}
          className={`rounded-md border bg-transparent px-2 py-1 text-[11px] font-medium tabular-nums ${TONE_STYLES[signal.tone]}`}
        >
          {signal.message}
        </span>
      ))}
    </section>
  );
}

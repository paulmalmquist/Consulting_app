"use client";

import React from "react";
import type { PdsV2CommandCenter } from "@/lib/bos-api";
import { toNumber, formatPercent, formatCurrency } from "@/components/pds-enterprise/pdsEnterprise";

export type SignalKey =
  | "below_plan"
  | "staffing_pressure"
  | "backlog"
  | "red_projects"
  | "delinquent_tc";

interface Signal {
  key: SignalKey;
  tone: "danger" | "warn" | "positive" | "neutral";
  message: string;
  detail: string;
  count: number;
}

const TONE_IDLE: Record<Signal["tone"], string> = {
  danger: "border-red-500/30 bg-red-500/[0.06] text-red-400 hover:bg-red-500/[0.12]",
  warn: "border-amber-500/25 bg-amber-500/[0.05] text-amber-400 hover:bg-amber-500/[0.10]",
  positive: "border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-400 hover:bg-emerald-500/[0.08]",
  neutral: "border-slate-600/30 bg-slate-500/[0.04] text-slate-400 hover:bg-slate-500/[0.08]",
};

const TONE_ACTIVE: Record<Signal["tone"], string> = {
  danger: "border-red-500/50 bg-red-500/[0.15] text-red-300 ring-1 ring-red-500/20",
  warn: "border-amber-500/50 bg-amber-500/[0.15] text-amber-300 ring-1 ring-amber-500/20",
  positive: "border-emerald-500/40 bg-emerald-500/[0.12] text-emerald-300 ring-1 ring-emerald-500/15",
  neutral: "border-slate-500/40 bg-slate-500/[0.12] text-slate-300 ring-1 ring-slate-500/15",
};

const TONE_ICON: Record<Signal["tone"], string> = {
  danger: "bg-red-500/20",
  warn: "bg-amber-500/20",
  positive: "bg-emerald-500/20",
  neutral: "bg-slate-500/20",
};

export function computeSignals(cc: PdsV2CommandCenter): Signal[] {
  const signals: Signal[] = [];
  const rows = cc.performance_table?.rows ?? [];

  const belowPlan = rows.filter(
    (r) => toNumber(r.fee_actual) < toNumber(r.fee_plan) && toNumber(r.fee_plan) > 0,
  );
  if (belowPlan.length > 0) {
    const totalShortfall = belowPlan.reduce(
      (sum, r) => sum + (toNumber(r.fee_actual) - toNumber(r.fee_plan)),
      0,
    );
    signals.push({
      key: "below_plan",
      tone: belowPlan.length >= 3 ? "danger" : "warn",
      message: `${belowPlan.length} Market${belowPlan.length > 1 ? "s" : ""} Below Plan`,
      detail: formatCurrency(totalShortfall),
      count: belowPlan.length,
    });
  }

  const pressured = (cc.resource_health ?? []).filter(
    (r) => r.overload_flag || r.staffing_gap_flag,
  );
  if (pressured.length > 0) {
    signals.push({
      key: "staffing_pressure",
      tone: pressured.length >= 5 ? "danger" : "warn",
      message: `${pressured.length} Staffing Risk${pressured.length > 1 ? "s" : ""}`,
      detail: "Delivery exposure",
      count: pressured.length,
    });
  }

  const totalBacklog = rows.reduce((sum, r) => sum + toNumber(r.backlog), 0);
  const totalForecast = rows.reduce((sum, r) => sum + toNumber(r.forecast), 0);
  const coverage = totalForecast > 0 ? totalBacklog / totalForecast : 0;
  signals.push({
    key: "backlog",
    tone: coverage >= 0.7 ? "positive" : coverage < 0.5 ? "danger" : "warn",
    message: `Backlog ${formatPercent(coverage, 0)}`,
    detail: formatCurrency(totalBacklog),
    count: Math.round(coverage * 100),
  });

  const totalRed = rows.reduce((sum, r) => sum + (r.red_projects || 0), 0);
  if (totalRed > 0) {
    signals.push({
      key: "red_projects",
      tone: totalRed >= 5 ? "danger" : "warn",
      message: `${totalRed} Red Project${totalRed > 1 ? "s" : ""}`,
      detail: "At-risk delivery",
      count: totalRed,
    });
  }

  const delinquent = (cc.timecard_health ?? []).filter((t) => t.delinquent_count > 0);
  if (delinquent.length > 0) {
    const total = delinquent.reduce((s, t) => s + t.delinquent_count, 0);
    signals.push({
      key: "delinquent_tc",
      tone: "warn",
      message: `${total} Delinquent TC${total > 1 ? "s" : ""}`,
      detail: "Rev rec at risk",
      count: total,
    });
  }

  return signals;
}

export function PdsActiveSignalBar({
  commandCenter,
  activeSignal,
  onSignalToggle,
  onClearFilters,
  hasAnyFilter,
}: {
  commandCenter: PdsV2CommandCenter;
  activeSignal: SignalKey | null;
  onSignalToggle: (key: SignalKey) => void;
  onClearFilters: () => void;
  hasAnyFilter: boolean;
}) {
  const signals = computeSignals(commandCenter);

  return (
    <section className="flex flex-wrap items-stretch gap-2" data-testid="pds-active-signal-bar">
      {signals.map((signal) => {
        const isActive = activeSignal === signal.key;
        return (
          <button
            key={signal.key}
            type="button"
            onClick={() => onSignalToggle(signal.key)}
            className={`group flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-left transition-all ${
              isActive ? TONE_ACTIVE[signal.tone] : TONE_IDLE[signal.tone]
            }`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${TONE_ICON[signal.tone]}`}>
              {signal.count}
            </span>
            <span className="flex flex-col">
              <span className="text-xs font-semibold leading-tight">{signal.message}</span>
              <span className="text-[10px] leading-tight opacity-60">{signal.detail}</span>
            </span>
          </button>
        );
      })}
      {hasAnyFilter && (
        <button
          type="button"
          onClick={onClearFilters}
          className="flex items-center gap-1.5 rounded-lg border border-slate-600/30 px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-slate-500/10 hover:text-slate-300"
        >
          <span className="text-[10px]">&times;</span>
          Clear
        </button>
      )}
    </section>
  );
}

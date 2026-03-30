"use client";

import React from "react";

import type { PdsV2OperatingBrief } from "@/lib/bos-api";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-pds-signalRed/30 bg-pds-signalRed/10 text-pds-signalRed",
  warning: "border-pds-signalOrange/30 bg-pds-signalOrange/10 text-pds-signalOrange",
  watch: "border-pds-signalYellow/30 bg-pds-signalYellow/10 text-pds-signalYellow",
  neutral: "border-bm-border/60 bg-bm-surface/20 text-bm-muted2",
};

export function PdsOperatingBrief({ brief }: { brief: PdsV2OperatingBrief }) {
  return (
    <section
      className="rounded-[24px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-accent)/0.12),transparent_42%)] bg-bm-surface/[0.94] p-5"
      data-testid="pds-operating-brief"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-pds-accentText">Current Operating Posture</p>
          <h3 className="mt-1 text-2xl font-semibold text-bm-text">{brief.headline}</h3>
          <p className="mt-2 text-sm leading-6 text-bm-muted2">{brief.summary}</p>
        </div>
        <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/20 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Trend</p>
          <p className="mt-1 text-sm font-semibold capitalize text-bm-text">{brief.trend_direction}</p>
          <p className="mt-1 text-xs text-bm-muted2">{brief.focus_label || "Portfolio-wide focus"}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-5">
        {brief.lines.map((line) => (
          <article key={line.label} className={`rounded-2xl border px-4 py-3 ${SEVERITY_STYLES[line.severity] || SEVERITY_STYLES.neutral}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">{line.label}</p>
            <p className="mt-2 text-sm leading-5 text-bm-text">{line.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

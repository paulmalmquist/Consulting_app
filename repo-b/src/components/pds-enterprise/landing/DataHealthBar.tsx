"use client";

import type { PdsDataHealthSummary } from "@/types/pds";

export function DataHealthBar({
  summary,
  onOpenDrawer,
}: {
  summary: PdsDataHealthSummary | null;
  onOpenDrawer: () => void;
}) {
  if (!summary) return null;
  const pct = Math.round((summary.valid_pct ?? 1) * 100);
  const hasIssues =
    summary.exception_count > 0 || summary.failed_pipeline_count > 0;
  return (
    <button
      type="button"
      onClick={onOpenDrawer}
      className={`flex w-full flex-wrap items-center gap-4 rounded-xl border px-3 py-2 text-left text-sm transition ${
        hasIssues
          ? "border-pds-signalRed/40 bg-pds-signalRed/10 text-pds-signalRed"
          : "border-bm-border/60 bg-bm-surface/20 text-bm-muted2"
      }`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
        Data Health
      </span>
      <span className="font-semibold text-bm-text">{pct}% valid</span>
      <span>
        {summary.exception_count} {summary.exception_count === 1 ? "exception" : "exceptions"}
      </span>
      <span>
        {summary.failed_pipeline_count} failed{" "}
        {summary.failed_pipeline_count === 1 ? "pipeline" : "pipelines"}
      </span>
      <span className="ml-auto text-xs underline-offset-2 hover:underline">
        view breakdown →
      </span>
    </button>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { OperatorActionQueueItem } from "@/lib/bos-api";
import { fmtMoney } from "@/lib/format-utils";

const PRIORITY_TONE: Record<string, string> = {
  critical: "border-red-400/40 bg-red-500/10 text-red-200",
  high: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  medium: "border-slate-400/30 bg-slate-500/10 text-slate-200",
  low: "border-bm-border/60 bg-bm-surface/30 text-bm-muted2",
};

function priorityPill(priority: string) {
  return PRIORITY_TONE[priority.toLowerCase()] ?? PRIORITY_TONE.medium;
}

function formatDays(days: number | null | undefined, prefix = "+") {
  if (days == null || days === 0) return null;
  return `${prefix}${days}d`;
}

export function ActionQueueSection({
  items,
  collapsedCount,
}: {
  items: OperatorActionQueueItem[];
  collapsedCount: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = items;
  const hasCollapsed = collapsedCount > 0;

  return (
    <section
      data-testid="action-queue"
      className="rounded-3xl border border-bm-border/70 bg-bm-surface/25 p-5"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            Action queue
          </p>
          <h2 className="mt-1 text-lg font-semibold text-bm-text">
            What needs intervention this week
          </h2>
        </div>
        <p className="text-xs text-bm-muted2">
          {items.length} visible · ranked by impact × urgency
        </p>
      </div>

      <ol className="mt-4 space-y-2">
        {visible.map((item, idx) => {
          const impact = item.impact;
          const ttf = impact.time_to_failure_days ?? null;
          const ignored = impact.if_ignored?.in_30_days ?? null;
          const ignoredParts: string[] = [];
          if (ignored) {
            if (ignored.estimated_cost_usd) {
              ignoredParts.push(`+${fmtMoney(ignored.estimated_cost_usd)}`);
            }
            if (ignored.estimated_delay_days) {
              ignoredParts.push(`+${ignored.estimated_delay_days} days`);
            }
            if (ignored.secondary_effects?.length) {
              ignoredParts.push(ignored.secondary_effects[0]);
            }
          }
          const isUrgent = ttf != null && ttf <= 14;
          const impactUsd = impact.estimated_cost_usd
            ? fmtMoney(impact.estimated_cost_usd)
            : impact.estimated_revenue_at_risk_usd
              ? fmtMoney(impact.estimated_revenue_at_risk_usd)
              : null;
          const delayLabel = formatDays(impact.estimated_delay_days);

          const card = (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-bm-border/60 bg-black/30 text-xs text-bm-muted2">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-medium text-bm-text">{item.title}</p>
                    {item.summary ? (
                      <p className="mt-1 text-sm text-bm-muted2">{item.summary}</p>
                    ) : null}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${priorityPill(item.priority)}`}
                >
                  {item.priority}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {impactUsd ? (
                  <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-red-100">
                    {impactUsd}
                  </span>
                ) : null}
                {delayLabel ? (
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                    {delayLabel}
                  </span>
                ) : null}
                {isUrgent ? (
                  <span className="rounded-full border border-red-500/50 bg-red-500/20 px-2 py-0.5 font-medium text-red-100">
                    {ttf}d to failure
                  </span>
                ) : null}
                <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 uppercase tracking-[0.14em] text-bm-muted2">
                  {impact.confidence} conf
                </span>
                {item.blocking ? (
                  <span className="rounded-full border border-bm-border/50 bg-black/30 px-2 py-0.5 uppercase tracking-[0.14em] text-bm-muted2">
                    Blocking
                  </span>
                ) : null}
                {item.owner ? (
                  <span className="text-bm-muted2">· {item.owner}</span>
                ) : null}
              </div>

              {ignoredParts.length ? (
                <p data-testid="if-ignored" className="text-xs text-red-200/80">
                  If ignored: {ignoredParts.join(" · ")}
                </p>
              ) : null}

              {item.action_label && item.href ? (
                <div className="flex items-center gap-1 text-xs text-bm-muted2">
                  <span>{item.action_label}</span>
                  <ArrowUpRight size={12} />
                </div>
              ) : null}
            </div>
          );

          const classes =
            "block rounded-2xl border border-bm-border/60 bg-black/25 px-4 py-3 transition hover:bg-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-bm-accent";

          return (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} className={classes}>
                  {card}
                </Link>
              ) : (
                <div className={classes}>{card}</div>
              )}
            </li>
          );
        })}
      </ol>

      {hasCollapsed ? (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="mt-3 w-full rounded-2xl border border-dashed border-bm-border/50 bg-transparent px-4 py-2 text-xs text-bm-muted2 hover:bg-bm-surface/25"
        >
          +{collapsedCount} lower-priority issues
        </button>
      ) : null}
    </section>
  );
}

export default ActionQueueSection;

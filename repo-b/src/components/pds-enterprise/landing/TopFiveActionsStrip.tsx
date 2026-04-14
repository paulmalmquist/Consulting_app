import type { PdsExecutiveQueueItem } from "@/types/pds";
import { toCompactCurrency } from "./utils";

export function TopFiveActionsStrip({ items }: { items: PdsExecutiveQueueItem[] }) {
  if (!items?.length) return null;
  return (
    <section className="rounded-2xl border border-pds-signalRed/30 bg-pds-signalRed/5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-pds-signalRed">
        Top 5 actions — pressure ordered by priority_score
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((item, idx) => (
          <li
            key={item.queue_item_id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-bm-border/50 bg-bm-surface/20 px-3 py-2 text-sm"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-pds-signalRed/20 text-[11px] font-semibold text-pds-signalRed">
              {idx + 1}
            </span>
            <span className="font-semibold text-bm-text">{item.title}</span>
            <span className="text-bm-muted2">
              variance {toCompactCurrency(item.variance || 0)}
            </span>
            <span className="text-bm-muted2">
              owner {item.assigned_owner || item.recommended_owner || "unassigned"}
            </span>
            <span className="ml-auto text-[11px] text-bm-muted2">
              score {(item.priority_score ?? 0).toFixed(0)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

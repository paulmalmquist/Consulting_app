"use client";

import type { PdsExecutiveQueueItem } from "@/lib/bos-api";

type Props = {
  items: PdsExecutiveQueueItem[];
  loading: boolean;
  onSelect: (item: PdsExecutiveQueueItem) => void;
  onAction: (item: PdsExecutiveQueueItem, action: "approve" | "delegate" | "escalate" | "defer" | "reject") => Promise<void>;
};

function priorityTone(priority: string): string {
  if (priority === "critical") return "bg-red-500/20 text-red-200";
  if (priority === "high") return "bg-amber-400/20 text-amber-200";
  if (priority === "medium") return "bg-blue-400/20 text-blue-200";
  return "bg-bm-surface/40 text-bm-muted2";
}

export default function DecisionQueue({ items, loading, onSelect, onAction }: Props) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-executive-queue">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Decision Queue</p>
          <h2 className="text-lg font-semibold">Actionable Executive Decisions</h2>
        </div>
        <p className="text-sm text-bm-muted2">Approve, delegate, escalate, defer, or reject.</p>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-bm-muted2">Loading executive queue...</p>
        ) : items.length ? (
          items.map((item) => (
            <div key={item.queue_item_id} className="rounded-xl border border-bm-border/60 bg-bm-surface/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="text-left font-medium hover:underline"
                  >
                    {item.title}
                  </button>
                  <p className="mt-1 text-sm text-bm-muted2">{item.summary || "No summary"}</p>
                  <p className="mt-1 text-xs text-bm-muted2">{item.decision_code} · {item.status}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${priorityTone(item.priority)}`}>
                  {item.priority}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void onAction(item, "approve")} className="rounded-lg border border-bm-border px-2.5 py-1.5 text-xs hover:bg-bm-surface/40">Approve</button>
                <button type="button" onClick={() => void onAction(item, "delegate")} className="rounded-lg border border-bm-border px-2.5 py-1.5 text-xs hover:bg-bm-surface/40">Delegate</button>
                <button type="button" onClick={() => void onAction(item, "escalate")} className="rounded-lg border border-bm-border px-2.5 py-1.5 text-xs hover:bg-bm-surface/40">Escalate</button>
                <button type="button" onClick={() => void onAction(item, "defer")} className="rounded-lg border border-bm-border px-2.5 py-1.5 text-xs hover:bg-bm-surface/40">Defer</button>
                <button type="button" onClick={() => void onAction(item, "reject")} className="rounded-lg border border-bm-border px-2.5 py-1.5 text-xs hover:bg-bm-surface/40">Reject</button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-bm-muted2">No executive queue items yet.</p>
        )}
      </div>
    </section>
  );
}

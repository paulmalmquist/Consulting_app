"use client";

import { useMemo, useState } from "react";
import type { PdsExecutiveQueueItem } from "@/lib/bos-api";

type Props = {
  item: PdsExecutiveQueueItem | null;
  onClose: () => void;
  onAction: (
    item: PdsExecutiveQueueItem,
    action: "approve" | "delegate" | "escalate" | "defer" | "reject",
    rationale: string,
  ) => Promise<void>;
};

export default function DecisionDetailDrawer({ item, onClose, onAction }: Props) {
  const [rationale, setRationale] = useState("");
  const isOpen = Boolean(item);

  const contextText = useMemo(() => {
    if (!item) return "";
    try {
      return JSON.stringify(item.context_json || {}, null, 2);
    } catch {
      return "{}";
    }
  }, [item]);

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" data-testid="pds-executive-detail-drawer">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-bm-border/70 bg-bm-bg p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Decision Detail</p>
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="text-sm text-bm-muted2">{item.decision_code} · {item.priority}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40">
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 p-3 text-sm">
            <p className="font-medium">Summary</p>
            <p className="mt-1 text-bm-muted2">{item.summary || "No summary"}</p>
          </div>
          <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 p-3 text-sm">
            <p className="font-medium">Recommended Action</p>
            <p className="mt-1 text-bm-muted2">{item.recommended_action || "No recommendation"}</p>
          </div>
          <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 p-3 text-sm">
            <p className="font-medium">Context</p>
            <pre className="mt-2 overflow-x-auto text-xs text-bm-muted2">{contextText}</pre>
          </div>
          <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 p-3">
            <label className="text-sm font-medium" htmlFor="decision-rationale">Action rationale</label>
            <textarea
              id="decision-rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              className="mt-2 w-full rounded-lg border border-bm-border bg-bm-surface/20 p-2 text-sm"
              rows={4}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void onAction(item, "approve", rationale)} className="rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40">Approve</button>
              <button type="button" onClick={() => void onAction(item, "delegate", rationale)} className="rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40">Delegate</button>
              <button type="button" onClick={() => void onAction(item, "escalate", rationale)} className="rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40">Escalate</button>
              <button type="button" onClick={() => void onAction(item, "defer", rationale)} className="rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40">Defer</button>
              <button type="button" onClick={() => void onAction(item, "reject", rationale)} className="rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40">Reject</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

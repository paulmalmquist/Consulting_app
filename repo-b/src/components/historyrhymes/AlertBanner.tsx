"use client";

import React from "react";
import type { Alert } from "@/lib/historyrhymes/client";

interface Props {
  alerts: Alert[];
}

const TYPE_STYLE: Record<Alert["type"], string> = {
  honeypot:     "bg-red-500/10 border-red-500/40 text-red-300",
  crowding:     "bg-amber-500/10 border-amber-500/40 text-amber-300",
  divergence:   "bg-violet-500/10 border-violet-500/40 text-violet-300",
  data_quality: "bg-neutral-500/20 border-neutral-500/40 text-neutral-300",
};

const ACTION_LABEL: Record<Alert["action"], string> = {
  reduce:  "↓ Reduce",
  hedge:   "⚖ Hedge",
  pause:   "⏸ Pause",
  reverse: "↻ Reverse",
};

export function AlertBanner({ alerts }: Props) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <section aria-label="Active alerts" className="mb-4 space-y-2" data-testid="hr-alert-banner">
      {alerts.map((a, i) => (
        <div
          key={i}
          className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 ${TYPE_STYLE[a.type]}`}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5">
              {a.type.replace("_", " ")}
            </div>
            <div className="text-sm">{a.message}</div>
          </div>
          <div className="text-xs font-semibold shrink-0">{ACTION_LABEL[a.action]}</div>
        </div>
      ))}
    </section>
  );
}

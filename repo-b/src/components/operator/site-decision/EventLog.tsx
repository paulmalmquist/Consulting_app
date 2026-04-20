"use client";

import type { OperatorSiteDecisionEvent } from "@/lib/bos-api";

export function EventLog({ events }: { events: OperatorSiteDecisionEvent[] }) {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-bm-muted2">
        No changes recorded — underwriting inputs have been stable.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-bm-muted2">
          What changed
        </h3>
        <span className="text-[11px] text-bm-muted2">
          {events.filter((e) => e.changes_recommendation).length} flip decision
        </span>
      </div>
      <ul className="divide-y divide-white/10">
        {events.map((e, idx) => (
          <li key={e.event_id || idx} className="flex items-start gap-3 px-5 py-3">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                e.changes_recommendation ? "bg-red-400" : "bg-white/30"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-bm-muted2">
                <span>{e.ts || "—"}</span>
                <span>·</span>
                <span>{e.source}</span>
                {e.magnitude ? (
                  <>
                    <span>·</span>
                    <span className="text-bm-text">{e.magnitude}</span>
                  </>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-bm-text">{e.change}</p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                e.changes_recommendation
                  ? "border-red-400/40 bg-red-500/10 text-red-200"
                  : "border-white/15 bg-white/5 text-bm-muted2"
              }`}
            >
              {e.changes_recommendation ? "Changes rec." : "No change"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

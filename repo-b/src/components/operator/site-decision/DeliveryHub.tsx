"use client";

import type { OperatorSiteDecisionWorkstream } from "@/lib/bos-api";
import { STATUS_TONE } from "./tones";

export function DeliveryHub({
  workstreams,
}: {
  workstreams: OperatorSiteDecisionWorkstream[];
}) {
  if (!workstreams.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-bm-muted2">
        No workstreams defined yet.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {workstreams.map((w) => (
        <div key={w.name} className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
                Workstream
              </div>
              <div className="mt-1 text-sm font-semibold text-bm-text">{w.name}</div>
            </div>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                STATUS_TONE[w.status] || STATUS_TONE.on_track
              }`}
            >
              {w.status.replace("_", " ")}
            </span>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-bm-muted2">
            <div>
              <span className="text-bm-text">{w.owner}</span>
              <span> · owner</span>
            </div>
            <div>
              <span className="uppercase tracking-wide text-bm-muted2">Next:</span>{" "}
              <span className="text-bm-text">{w.next_milestone}</span>
              {w.next_milestone_due ? <span> · due {w.next_milestone_due}</span> : null}
            </div>
            {w.last_completed_step ? (
              <div>
                <span className="uppercase tracking-wide text-bm-muted2">Last:</span>{" "}
                <span>{w.last_completed_step}</span>
              </div>
            ) : null}
            {w.blockers.length ? (
              <ul className="list-disc pl-4 text-red-200">
                {w.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

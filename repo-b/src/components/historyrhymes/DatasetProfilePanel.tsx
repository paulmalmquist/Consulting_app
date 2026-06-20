"use client";

import type { DatasetProfile } from "@/lib/historyrhymes/mlDemo";
import { Panel, StatTile, fmt } from "./mlUi";

export function DatasetProfilePanel({ profile }: { profile: DatasetProfile }) {
  const rb = profile.class_balance.risk_event_30d;
  return (
    <Panel title="Dataset profile">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <StatTile label="Rows" value={profile.n_rows} />
        <StatTile label="Features" value={profile.n_features} />
        <StatTile label="Risk positives" value={`${rb.positive}`} sub={`rate ${fmt(rb.positive_rate)}`} />
        <StatTile label="Source" value="synthetic" sub={`seed ${profile.seed}`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Theme balance</div>
          <ul className="text-xs text-neutral-300 space-y-0.5">
            {Object.entries(profile.class_balance.theme).map(([k, v]) => (
              <li key={k} className="flex justify-between"><span>{k}</span><span className="text-neutral-500">{v}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Episode anchors</div>
          <ul className="text-xs text-neutral-300 space-y-0.5">
            {profile.episodes.map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>{e.name}</span>
                <span className={e.is_crisis ? "text-red-300" : "text-emerald-300"}>
                  {e.is_crisis ? "crisis" : "non-event"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

"use client";

import React from "react";
import type { Position } from "@/lib/historyrhymes/client";

interface Props {
  position: Position;
  tier?: "act" | "watch" | "research";
}

const DIRECTION_COLOR: Record<Position["direction"], string> = {
  long:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  short:   "text-red-400 bg-red-500/10 border-red-500/30",
  neutral: "text-neutral-400 bg-neutral-500/10 border-neutral-500/30",
};

const TIER_LABEL: Record<NonNullable<Props["tier"]>, { label: string; className: string }> = {
  act:      { label: "ACT",      className: "bg-amber-500 text-neutral-950" },
  watch:    { label: "WATCH",    className: "bg-sky-500 text-neutral-950" },
  research: { label: "RESEARCH", className: "bg-neutral-600 text-neutral-100" },
};

export function DecisionCard({ position, tier = "act" }: Props) {
  const tierInfo = TIER_LABEL[tier];
  const dirClass = DIRECTION_COLOR[position.direction];

  return (
    <article
      className="bg-neutral-900 border border-neutral-700 rounded-lg p-4"
      data-testid="hr-decision-card"
      data-tier={tier}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${tierInfo.className}`}>
            {tierInfo.label}
          </span>
          <span className="text-lg font-semibold text-neutral-100">{position.asset}</span>
        </div>
        <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded border ${dirClass}`}>
          {position.direction}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div>
          <dt className="text-neutral-500 uppercase tracking-wider">Size</dt>
          <dd className="text-neutral-100 font-semibold">{(position.size * 100).toFixed(0)}%</dd>
        </div>
        <div>
          <dt className="text-neutral-500 uppercase tracking-wider">Horizon</dt>
          <dd className="text-neutral-100 font-semibold">{position.time_horizon_days}d</dd>
        </div>
        <div>
          <dt className="text-neutral-500 uppercase tracking-wider">Entry</dt>
          <dd className="text-neutral-100 font-semibold capitalize">{position.entry_type}</dd>
        </div>
      </dl>

      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
          Invalidation
        </div>
        <div className="text-sm text-neutral-200">{position.invalidation}</div>
      </div>

      {position.top_analog && position.top_analog !== "none" && (
        <div className="text-xs text-neutral-400">
          Top analog: <span className="text-neutral-200">{position.top_analog}</span>{" "}
          (rhyme {position.rhyme_score.toFixed(2)})
        </div>
      )}

      {position.key_drivers.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {position.key_drivers.map((d, i) => (
            <li
              key={i}
              className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700"
            >
              {d}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 pt-3 border-t border-neutral-800 text-xs text-neutral-500">
        Next check: {position.next_check}
      </div>
    </article>
  );
}

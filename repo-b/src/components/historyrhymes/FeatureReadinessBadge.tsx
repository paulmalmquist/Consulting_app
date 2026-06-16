"use client";

import type { Readiness } from "@/lib/historyrhymes/featureStore";
import { Tag, fmt } from "./mlUi";

/** Model-readiness score + degrade reasons. Red when blocked (leakage/score 0). */
export function FeatureReadinessBadge({ readiness }: { readiness: Readiness | Record<string, never> }) {
  const r = readiness as Readiness;
  if (!r || typeof r.score !== "number") {
    return <Tag tone="neutral">readiness —</Tag>;
  }
  const blocked = r.score === 0;
  const tone = blocked ? "red" : r.score >= 0.8 ? "emerald" : "amber";
  return (
    <span className="inline-flex flex-col gap-1" data-testid="hr-feature-readiness">
      <Tag tone={tone}>Model readiness: {fmt(r.score, 2)}{blocked ? " · blocked" : ""}</Tag>
      {r.degrade_reasons && r.degrade_reasons.length > 0 ? (
        <span className="text-[10px] text-amber-300/90">
          {blocked ? "blocked: " : "downgrade: "}{r.degrade_reasons.join(", ")}
        </span>
      ) : null}
    </span>
  );
}

"use client";

import type { QualityBoard } from "@/lib/historyrhymes/featureStore";
import { Panel, Tag, fmt } from "./mlUi";

/** Per-feature quality flags: freshness / missingness / drift / leakage / readiness. */
export function FeatureQualityBoard({
  board,
  onSelect,
}: {
  board: QualityBoard | null;
  onSelect?: (featureId: string) => void;
}) {
  if (!board || !board.features?.length) {
    return null;
  }
  return (
    <Panel title="Feature Quality Board">
      <p className="text-[11px] text-neutral-500 mb-3">
        A stale, missing, drifting, or leaky feature is not neutral — it changes model trust.
      </p>
      <div className="overflow-x-auto" data-testid="hr-feature-quality-board">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-500 text-left">
              <th className="font-medium px-2 py-1.5 border-b border-neutral-800">Feature</th>
              <th className="font-medium px-2 py-1.5 border-b border-neutral-800">Family</th>
              <th className="font-medium px-2 py-1.5 border-b border-neutral-800">Freshness</th>
              <th className="font-medium px-2 py-1.5 border-b border-neutral-800">Missingness</th>
              <th className="font-medium px-2 py-1.5 border-b border-neutral-800">Drift</th>
              <th className="font-medium px-2 py-1.5 border-b border-neutral-800">Leakage</th>
              <th className="font-medium px-2 py-1.5 border-b border-neutral-800">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {board.features.map((r) => (
              <tr
                key={r.feature_id}
                onClick={() => onSelect?.(r.feature_id)}
                data-testid="hr-feature-quality-row"
                className={`border-b border-neutral-900 ${onSelect ? "cursor-pointer hover:bg-neutral-800/50" : ""}`}
              >
                <td className="px-2 py-1.5 text-neutral-100 font-mono">{r.feature_id}</td>
                <td className="px-2 py-1.5 text-neutral-400">{r.family.replace(/_/g, " ")}</td>
                <td className="px-2 py-1.5">{r.freshness_status}</td>
                <td className={`px-2 py-1.5 ${r.missingness_rate > 0 ? "text-amber-300" : "text-neutral-400"}`}>
                  {fmt(r.missingness_rate, 2)}
                </td>
                <td className="px-2 py-1.5">{r.drift_status}</td>
                <td className="px-2 py-1.5">
                  {r.leakage_blocked ? (
                    <Tag tone="red">blocked</Tag>
                  ) : r.leakage_risk === "medium" ? (
                    <Tag tone="amber">medium</Tag>
                  ) : (
                    <span className="text-neutral-500">low</span>
                  )}
                </td>
                <td className={`px-2 py-1.5 ${r.readiness_score === 0 ? "text-red-300" : "text-emerald-300"}`}>
                  {fmt(r.readiness_score, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

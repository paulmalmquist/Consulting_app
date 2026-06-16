"use client";

import type { FeatureDetail } from "@/lib/historyrhymes/featureStore";
import { fmt } from "./mlUi";

/** Before (raw input) → after (engineered output) tail slice. */
export function FeatureTransformationExample({ detail }: { detail: FeatureDetail }) {
  const ex = detail.transformation_example;
  if (!ex || !ex.before?.length || !ex.after?.length) {
    return <div className="text-[11px] text-neutral-500">No before/after example for this feature.</div>;
  }
  const rows = ex.before.map((b, i) => ({
    as_of: b.as_of,
    before: b.value,
    after: ex.after?.[i]?.value ?? null,
  }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-neutral-500 text-left">
            <th className="font-medium px-2 py-1 border-b border-neutral-800">As of</th>
            <th className="font-medium px-2 py-1 border-b border-neutral-800">Raw input</th>
            <th className="font-medium px-2 py-1 border-b border-neutral-800">Engineered</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.as_of} className="border-b border-neutral-900">
              <td className="px-2 py-1 text-neutral-400">{r.as_of}</td>
              <td className="px-2 py-1 text-neutral-300">{fmt(r.before)}</td>
              <td className="px-2 py-1 text-sky-300">{fmt(r.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

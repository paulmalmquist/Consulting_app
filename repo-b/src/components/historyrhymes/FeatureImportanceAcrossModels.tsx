"use client";

import type { ImportanceEntry } from "@/lib/historyrhymes/featureStore";
import { fmt } from "./mlUi";

function magnitude(e: ImportanceEntry): { kind: string; value: number } {
  if (typeof e.importance === "number") return { kind: "importance", value: e.importance };
  if (typeof e.coefficient_abs === "number") return { kind: "|coef|", value: e.coefficient_abs };
  if (typeof e.coefficient === "number") return { kind: "coefficient", value: e.coefficient };
  return { kind: "—", value: 0 };
}

/** Per-model importance/coefficient — proves features behave differently per model. */
export function FeatureImportanceAcrossModels({ entries }: { entries: ImportanceEntry[] }) {
  if (!entries || entries.length === 0) {
    return <div className="text-[11px] text-neutral-500">Not used by the supervised models in this demo.</div>;
  }
  const maxMag = Math.max(...entries.map((e) => Math.abs(magnitude(e).value)), 1e-9);
  return (
    <div className="space-y-1.5" data-testid="hr-feature-importance">
      {entries.map((e) => {
        const m = magnitude(e);
        const pct = Math.min(100, (Math.abs(m.value) / maxMag) * 100);
        const neg = m.value < 0;
        return (
          <div key={e.model} className="flex items-center gap-2 text-xs">
            <span className="w-40 shrink-0 text-neutral-300">{e.model.replace(/_/g, " ")}</span>
            <span className="flex-1 h-2 bg-neutral-800 rounded">
              <span
                className={`block h-2 rounded ${neg ? "bg-red-400/70" : "bg-emerald-400/70"}`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-24 shrink-0 text-right text-neutral-400">
              {fmt(m.value)} <span className="text-neutral-600">{m.kind}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

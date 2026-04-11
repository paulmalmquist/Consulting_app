import type { RowStatus } from "./types";
import { statusClasses } from "./utils";

export function OperatingPostureBadgeStrip({ posture }: { posture: RowStatus }) {
  const states: RowStatus[] = ["stable", "watching", "pressured", "critical"];
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/15 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Current Operating Posture</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {states.map((state) => (
          <span
            key={state}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
              posture === state ? statusClasses(state) : "border-bm-border/60 text-bm-muted2"
            }`}
          >
            {state}
          </span>
        ))}
      </div>
    </section>
  );
}

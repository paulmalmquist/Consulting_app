import * as React from "react";
import { cn } from "@/lib/cn";

type KpiTone = "positive" | "negative" | "neutral";

const toneClass: Record<KpiTone, string> = {
  positive: "text-bm-success",
  negative: "text-bm-danger",
  neutral: "text-bm-muted",
};

export type KpiDef = {
  label: string;
  value: React.ReactNode;
  delta?: {
    value: React.ReactNode;
    tone?: KpiTone;
  };
  className?: string;
};

export function KpiStrip({
  kpis,
  className,
}: {
  kpis: KpiDef[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-bm-border/30 pb-3",
        className
      )}
    >
      {kpis.map((kpi) => (
        <div key={kpi.label} className={cn("min-w-0", kpi.className)}>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            {kpi.label}
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <p className="font-display text-lg font-semibold text-bm-text tabular-nums">
              {kpi.value}
            </p>
            {kpi.delta ? (
              <span
                className={cn(
                  "font-mono text-xs",
                  toneClass[kpi.delta.tone ?? "neutral"]
                )}
              >
                {kpi.delta.value}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

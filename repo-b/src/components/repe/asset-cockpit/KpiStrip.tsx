import * as React from "react";
import { cn } from "@/lib/cn";

type KpiTone = "positive" | "negative" | "neutral";
type KpiVariant = "default" | "band";

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
  variant = "default",
}: {
  kpis: KpiDef[];
  className?: string;
  variant?: KpiVariant;
}) {
  if (variant === "band") {
    const desktopCols = Math.min(Math.max(kpis.length, 2), 6) as 2 | 3 | 4 | 5 | 6;
    const desktopColsClass = {
      2: "xl:grid-cols-2",
      3: "xl:grid-cols-3",
      4: "xl:grid-cols-4",
      5: "xl:grid-cols-5",
      6: "xl:grid-cols-6",
    }[desktopCols];

    return (
      <div
        className={cn(
          "grid grid-cols-2 border-b border-bm-border/40 pb-1 md:grid-cols-2",
          desktopColsClass,
          className
        )}
      >
        {kpis.map((kpi, index) => (
          <div
            key={kpi.label}
            className={cn(
              "min-w-0 space-y-2 px-0 py-4 md:py-5 xl:pr-6",
              index < kpis.length - 1 && "border-b border-bm-border/15 xl:border-b-0",
              index % 2 === 0 ? "pr-4 md:pr-6" : "pl-4 md:pl-6",
              index >= 2 && "pt-5 xl:pt-4",
              index > 0 && "xl:border-l xl:border-bm-border/20 xl:pl-6",
              kpi.className
            )}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
              {kpi.label}
            </p>
            <div className="flex items-baseline gap-2">
              <p className="font-display text-[26px] font-semibold leading-none text-bm-text tabular-nums">
                {kpi.value}
              </p>
              {kpi.delta ? (
                <span
                  className={cn(
                    "font-mono text-[11px]",
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

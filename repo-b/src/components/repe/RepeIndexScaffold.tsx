import * as React from "react";
import { cn } from "@/lib/cn";

export const reIndexActionClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-bm-border/70 bg-bm-surface/20 px-4 text-sm font-medium text-bm-text transition-colors duration-100 hover:border-bm-border/90 hover:bg-bm-surface/35";

export const reIndexControlLabelClass =
  "text-[11px] uppercase tracking-[0.12em] text-bm-muted2";

export const reIndexInputClass =
  "mt-1 block h-10 rounded-md border border-bm-border/70 bg-bm-surface/18 px-3 text-sm text-bm-text outline-none transition-colors duration-100 placeholder:text-bm-muted2 hover:bg-bm-surface/26 focus:border-bm-border-strong/70";

export const reIndexTableShellClass =
  "overflow-x-auto rounded-xl border border-bm-border/70 bg-bm-surface/[0.03] shadow-sm";

export const reIndexTableClass = "w-full text-sm";

export const reIndexTableHeadRowClass =
  "border-b border-bm-border/50 bg-bm-surface/14 text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2";

export const reIndexTableBodyClass = "divide-y divide-bm-border/30";

export const reIndexTableRowClass =
  "h-14 transition-colors duration-100 hover:bg-bm-surface/15";

export const reIndexPrimaryCellClass =
  "text-[15px] font-semibold text-bm-text transition-colors duration-100 hover:text-bm-accent";

export const reIndexSecondaryCellClass = "text-[12px] text-bm-muted2";

export const reIndexNumericCellClass =
  "text-right text-[14px] font-medium tabular-nums text-bm-text";

export function RepeIndexScaffold({
  title,
  subtitle,
  action,
  metrics,
  controls,
  children,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  metrics?: React.ReactNode;
  controls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-9", className)}>
      <div className={cn(metrics ? "space-y-7" : "space-y-0")}>
        <div className="flex flex-col gap-4 rounded-xl border border-bm-border/20 bg-bm-surface/[0.04] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-bm-text">{title}</h1>
            {subtitle ? (
              <div className="mt-1.5 text-sm font-medium text-bm-muted2">{subtitle}</div>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {metrics}
      </div>

      {controls ? <div className="space-y-5">{controls}{children}</div> : children}
    </section>
  );
}

import * as React from "react";
import { cn } from "@/lib/cn";

export const reIndexActionClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-bm-border/70 bg-bm-surface/20 px-4 text-sm font-medium text-bm-text transition-colors duration-100 hover:border-bm-border/90 hover:bg-bm-surface/35";

export const reIndexControlLabelClass =
  "nv-eyebrow text-bm-muted2";

export const reIndexInputClass =
  "mt-1 block h-10 rounded-md border border-bm-border/70 bg-bm-surface/18 px-3 text-sm text-bm-text outline-none transition-colors duration-100 placeholder:text-bm-muted2 hover:bg-bm-surface/26 focus:border-bm-border-strong/70";

export const reIndexTableShellClass =
  "overflow-x-auto rounded-xl border border-bm-border/70 bg-bm-surface/[0.03] shadow-sm";

export const reIndexTableClass = "w-full nv-table-cell";

export const reIndexTableHeadRowClass =
  "border-b border-bm-border/50 bg-bm-surface/14 text-left nv-table-header text-bm-muted2";

export const reIndexTableBodyClass = "divide-y divide-bm-border/30";

export const reIndexTableRowClass =
  "h-12 transition-colors duration-100 hover:bg-bm-surface/15";

export const reIndexPrimaryCellClass =
  "nv-table-cell font-medium tracking-[-0.01em] text-bm-text transition-colors duration-100 hover:text-bm-accent";

export const reIndexSecondaryCellClass = "nv-small text-bm-muted2";

export const reIndexNumericCellClass =
  "nv-metric text-right font-medium text-bm-text";

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
    <section className={cn("space-y-3", className)}>
      <div className={cn(metrics ? "space-y-3" : "space-y-0")}>
        <div className="re-scaffold-header flex flex-col gap-2 rounded-lg border border-bm-border/10 bg-bm-surface/[0.02] px-4 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="nv-h1 text-bm-text">{title}</h1>
            {subtitle ? (
              <div className="nv-small mt-0.5 text-bm-muted2">{subtitle}</div>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {metrics}
      </div>

      {controls ? <div className="space-y-4">{controls}{children}</div> : children}
    </section>
  );
}

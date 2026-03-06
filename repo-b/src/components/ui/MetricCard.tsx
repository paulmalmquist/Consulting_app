import * as React from "react";
import { cn } from "@/lib/cn";

type DeltaDirection = "up" | "down" | "flat";
type StatusVariant = "success" | "warning" | "danger" | "neutral";

const statusClasses: Record<StatusVariant, string> = {
  success: "bg-bm-success/15 text-bm-success border-bm-success/30",
  warning: "bg-bm-warning/15 text-bm-warning border-bm-warning/30",
  danger: "bg-bm-danger/15 text-bm-danger border-bm-danger/30",
  neutral: "bg-bm-surface2/60 text-bm-muted border-bm-border/50",
};

const deltaArrow: Record<DeltaDirection, string> = {
  up: "\u2191",
  down: "\u2193",
  flat: "\u2192",
};

const deltaColor: Record<DeltaDirection, string> = {
  up: "text-bm-success",
  down: "text-bm-danger",
  flat: "text-bm-muted2",
};

export type MetricCardProps = {
  label: string;
  value: string;
  delta?: { value: string; direction: DeltaDirection };
  status?: StatusVariant;
  trend?: React.ReactNode;
  size?: "large" | "compact";
  className?: string;
};

export function MetricCard({
  label,
  value,
  delta,
  status,
  trend,
  size = "compact",
  className,
}: MetricCardProps) {
  const isLarge = size === "large";

  return (
    <div
      className={cn(
        "min-w-0",
        className
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <p
          className={cn(
            "font-display font-semibold tracking-tight text-bm-text tabular-nums",
            isLarge ? "text-xl leading-none" : "text-lg"
          )}
        >
          {value}
        </p>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-xs",
              deltaColor[delta.direction]
            )}
          >
            <span>{deltaArrow[delta.direction]}</span>
            <span>{delta.value}</span>
          </span>
        )}
      </div>
      {status && (
        <span
          className={cn(
            "mt-2 inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
            statusClasses[status]
          )}
        >
          {status}
        </span>
      )}
      {trend && <div className="mt-2">{trend}</div>}
    </div>
  );
}

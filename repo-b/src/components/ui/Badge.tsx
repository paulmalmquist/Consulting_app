import * as React from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger";

const variants: Record<BadgeVariant, string> = {
  default: "bg-bm-surface2/60 text-bm-text border border-bm-border/70",
  accent: "bg-bm-accent/15 text-bm-text border border-bm-accent/35",
  success: "bg-bm-success/15 text-bm-text border border-bm-success/35",
  warning: "bg-bm-warning/15 text-bm-text border border-bm-warning/35",
  danger: "bg-bm-danger/15 text-bm-text border border-bm-danger/35",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

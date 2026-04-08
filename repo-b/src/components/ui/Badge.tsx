import * as React from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger" | "purple" | "outline";

const variants: Record<BadgeVariant, string> = {
  default: "bg-bm-surface-alt text-bm-text-secondary border border-bm-border",
  accent:  "bg-bm-accent-bg text-bm-accent border border-bm-accent-border",
  success: "bg-bm-success-bg text-bm-success border border-bm-success-border",
  warning: "bg-bm-warning-bg text-bm-warning border border-bm-warning-border",
  danger:  "bg-bm-danger-bg text-bm-danger border border-bm-danger-border",
  purple:  "bg-bm-purple-bg text-bm-purple border border-transparent",
  outline: "bg-transparent text-bm-muted border border-bm-border",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[9.5px] font-bold tracking-wider uppercase leading-none whitespace-nowrap",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

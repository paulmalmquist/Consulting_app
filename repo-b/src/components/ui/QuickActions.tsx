import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type QuickAction = {
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
};

export type QuickActionsProps = {
  actions: QuickAction[];
  maxVisible?: number;
  title?: string;
  className?: string;
};

export function QuickActions({
  actions,
  maxVisible = 6,
  title = "Quick Actions",
  className,
}: QuickActionsProps) {
  const visible = actions.slice(0, maxVisible);

  return (
    <div className={cn("space-y-3", className)}>
      <p className="bm-section-label">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visible.map((action) => {
          const inner = (
            <>
              {action.icon && <span className="shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
            </>
          );

          const classes = cn(
            "inline-flex items-center justify-center gap-2 rounded-lg border border-bm-border/70 bg-bm-surface/20 px-3 py-2.5 text-sm font-medium text-bm-text",
            "transition-[transform,box-shadow,border-color] duration-[120ms]",
            "hover:-translate-y-[1px] hover:border-bm-accent/40 hover:shadow-bm-card"
          );

          if (action.href) {
            return (
              <Link key={action.label} href={action.href} className={classes}>
                {inner}
              </Link>
            );
          }

          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={classes}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}

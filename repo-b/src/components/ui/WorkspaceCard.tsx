import * as React from "react";
import { cn } from "@/lib/cn";

type HealthIndicator = "healthy" | "degraded" | "provisioning" | "archived";

const healthDot: Record<HealthIndicator, string> = {
  healthy: "bg-bm-success",
  degraded: "bg-bm-warning",
  provisioning: "bg-bm-accent",
  archived: "bg-bm-muted2",
};

const healthLabel: Record<HealthIndicator, string> = {
  healthy: "Active",
  degraded: "Degraded",
  provisioning: "Provisioning",
  archived: "Archived",
};

export type WorkspaceCardAction = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  "data-testid"?: string;
};

export type WorkspaceCardProps = {
  title: string;
  industryBadge?: React.ReactNode;
  healthIndicator?: HealthIndicator;
  lastActivity?: string;
  primaryCta?: { label: string; onClick: () => void; "data-testid"?: string };
  secondaryActions?: WorkspaceCardAction[];
  children?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
};

export function WorkspaceCard({
  title,
  industryBadge,
  healthIndicator = "healthy",
  lastActivity,
  primaryCta,
  secondaryActions,
  children,
  className,
  ...rest
}: WorkspaceCardProps) {
  return (
    <article
      className={cn(
        "group rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[2px] hover:shadow-bm-card",
        className
      )}
      data-testid={rest["data-testid"]}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-lg font-display font-semibold tracking-tight text-bm-text truncate">
            {title}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {industryBadge}
            <span className="inline-flex items-center gap-1.5 text-xs text-bm-muted2">
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", healthDot[healthIndicator])} />
              {healthLabel[healthIndicator]}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {primaryCta && (
            <button
              type="button"
              onClick={primaryCta.onClick}
              data-testid={primaryCta["data-testid"]}
              className="rounded-md bg-bm-accent px-3 py-1.5 text-sm font-medium text-bm-accentContrast transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[1px]"
            >
              {primaryCta.label}
            </button>
          )}
          {secondaryActions && secondaryActions.length > 0 && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms]">
              {secondaryActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  data-testid={action["data-testid"]}
                  title={action.label}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[1px]",
                    action.variant === "destructive"
                      ? "border-bm-danger/40 text-bm-danger hover:bg-bm-danger/10"
                      : "border-bm-border/70 text-bm-muted hover:text-bm-text hover:bg-bm-surface/40"
                  )}
                >
                  {action.icon || action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Meta: last activity */}
      {lastActivity && (
        <p className="mt-3 font-mono text-[11px] text-bm-muted2">
          Last activity: {lastActivity}
        </p>
      )}

      {/* Slot for extra content (stats grid, etc.) */}
      {children}
    </article>
  );
}

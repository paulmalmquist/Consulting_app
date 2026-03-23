"use client";

import { cn } from "@/lib/cn";
import type { GatewayStatus } from "./useGatewayHealth";

type ControlTowerMetricsProps = {
  activeCount: number;
  totalCount: number;
  industryCount: number;
  recentCount: number;
  gatewayStatus: GatewayStatus;
  loading?: boolean;
};

type MetricTone = "neutral" | "success" | "danger";

const toneClasses: Record<MetricTone, string> = {
  neutral: "border-bm-border/10 bg-bm-surface/82 text-bm-text",
  success:
    "border-bm-success/22 bg-[linear-gradient(180deg,hsl(var(--bm-surface)/0.96),hsl(var(--bm-success)/0.08))] text-bm-text shadow-[0_0_0_1px_hsl(var(--bm-success)/0.08),0_18px_34px_-28px_rgba(12,28,20,0.9)]",
  danger:
    "border-bm-danger/20 bg-[linear-gradient(180deg,hsl(var(--bm-surface)/0.96),hsl(var(--bm-danger)/0.08))] text-bm-text shadow-[0_0_0_1px_hsl(var(--bm-danger)/0.08),0_18px_34px_-28px_rgba(32,10,10,0.95)]",
};

const badgeClasses: Record<MetricTone, string> = {
  neutral: "border-bm-border/14 bg-bm-surface/70 text-bm-muted",
  success: "border-bm-success/24 bg-bm-success/12 text-bm-success shadow-[0_0_16px_hsl(var(--bm-success)/0.15)]",
  danger: "border-bm-danger/24 bg-bm-danger/12 text-bm-danger",
};

export function ControlTowerMetrics({
  activeCount,
  totalCount,
  industryCount,
  recentCount,
  gatewayStatus,
  loading = false,
}: ControlTowerMetricsProps) {
  const gatewayTone: MetricTone =
    gatewayStatus === "operational"
      ? "success"
      : gatewayStatus === "degraded"
      ? "danger"
      : "neutral";

  const gatewayValue =
    gatewayStatus === "checking"
      ? "Checking"
      : gatewayStatus === "operational"
      ? "Online"
      : "Offline";

  return (
    <section aria-label="Key metrics" className="grid gap-6 md:grid-cols-2 xl:grid-cols-[minmax(0,1.18fr)_minmax(0,1.18fr)_repeat(3,minmax(0,0.82fr))]">
      {loading ? (
        <>
          <MetricSkeleton priority="primary" />
          <MetricSkeleton priority="primary" />
          <MetricSkeleton priority="secondary" />
          <MetricSkeleton priority="secondary" />
          <MetricSkeleton priority="secondary" />
        </>
      ) : (
        <>
          <ControlTowerMetricCard
            label="Active Environments"
            value={String(activeCount)}
            detail={recentCount > 0 ? `+${recentCount} provisioned in the last 7 days` : "No new environments in the last 7 days"}
            emphasisLabel={activeCount > 0 ? "Active" : "Idle"}
            priority="primary"
            tone={activeCount > 0 ? "success" : "neutral"}
          />
          <ControlTowerMetricCard
            label="AI Gateway Status"
            value={gatewayValue}
            detail={
              gatewayStatus === "operational"
                ? "Gateway routing is available for active operator workflows."
                : gatewayStatus === "degraded"
                ? "Gateway routing is currently degraded and needs attention."
                : "Running live health checks against the gateway."
            }
            emphasisLabel={
              gatewayStatus === "operational"
                ? "Online"
                : gatewayStatus === "degraded"
                ? "Offline"
                : "Checking"
            }
            priority="primary"
            tone={gatewayTone}
            valueLoading={gatewayStatus === "checking"}
          />
          <ControlTowerMetricCard
            label="Total Environments"
            value={String(totalCount)}
            detail="Full provisioned footprint across the workspace."
            priority="secondary"
            tone="neutral"
          />
          <ControlTowerMetricCard
            label="Industries"
            value={String(industryCount)}
            detail="Distinct operating templates currently represented."
            priority="secondary"
            tone="neutral"
          />
          <ControlTowerMetricCard
            label="Recent (7d)"
            value={String(recentCount)}
            detail="New environments created over the last 7 days."
            priority="secondary"
            tone="neutral"
          />
        </>
      )}
    </section>
  );
}

function ControlTowerMetricCard({
  label,
  value,
  detail,
  emphasisLabel,
  priority,
  tone,
  valueLoading = false,
}: {
  label: string;
  value: string;
  detail: string;
  emphasisLabel?: string;
  priority: "primary" | "secondary";
  tone: MetricTone;
  valueLoading?: boolean;
}) {
  const isPrimary = priority === "primary";

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border px-4 py-4 transition-[border-color,box-shadow,transform] duration-panel",
        isPrimary ? "min-h-[148px] px-6 py-5" : "min-h-[120px] opacity-75",
        toneClasses[tone]
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <p
          className={cn(
            "font-mono uppercase tracking-[0.14em] text-bm-muted2",
            isPrimary ? "text-[11px]" : "text-[10px]"
          )}
        >
          {label}
        </p>
        {emphasisLabel ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
              badgeClasses[tone]
            )}
          >
            {emphasisLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        {valueLoading ? (
          <div className="animate-pulse">
            <div className={cn("h-10 rounded-md bg-bm-surface2/85", isPrimary ? "w-36" : "w-24")} />
          </div>
        ) : (
          <p
            className={cn(
              "font-display font-semibold tracking-tight tabular-nums",
              isPrimary ? "text-[2.5rem] leading-none" : "text-[1.7rem] leading-none",
              tone === "success" && "text-bm-success",
              tone === "danger" && "text-bm-danger",
              tone === "neutral" && "text-bm-text"
            )}
          >
            {value}
          </p>
        )}
      </div>

      <p className={cn("mt-3 max-w-[30ch] leading-relaxed text-bm-muted", isPrimary ? "text-sm" : "text-[13px]")}>
        {detail}
      </p>
    </div>
  );
}

function MetricSkeleton({ priority }: { priority: "primary" | "secondary" }) {
  const isPrimary = priority === "primary";

  return (
    <div
      className={cn(
        "animate-pulse rounded-xl border border-bm-border/10 bg-bm-surface/82",
        isPrimary ? "min-h-[148px] px-6 py-5" : "min-h-[120px] px-4 py-4"
      )}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="h-3 w-28 rounded bg-bm-surface2/90" />
        <div className="h-6 w-16 rounded-full bg-bm-surface2/90" />
      </div>
      <div className={cn("mt-5 rounded bg-bm-surface2/90", isPrimary ? "h-11 w-28" : "h-9 w-20")} />
      <div className="mt-4 h-3 w-36 rounded bg-bm-surface2/75" />
      <div className="mt-2 h-3 w-24 rounded bg-bm-surface2/60" />
    </div>
  );
}

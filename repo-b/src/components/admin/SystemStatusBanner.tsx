"use client";

import { cn } from "@/lib/cn";
import type { GatewayStatus } from "./useGatewayHealth";

const dotClass: Record<GatewayStatus, string> = {
  operational: "bg-bm-success",
  degraded: "bg-bm-warning",
  checking: "bg-bm-muted2 animate-pulse",
};

const messageText: Record<GatewayStatus, string> = {
  operational: "All services operational",
  degraded: "Operator services degraded",
  checking: "Checking services…",
};

export function SystemStatusBanner({
  status,
  lastChecked,
  className,
}: {
  status: GatewayStatus;
  lastChecked: Date | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        "border-bm-border/10 bg-[linear-gradient(180deg,hsl(var(--bm-surface)/0.88),hsl(var(--bm-bg-2)/0.82))]",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={cn("absolute inset-0 rounded-full", dotClass[status])} />
          {status === "operational" ? (
            <span className="absolute inset-0 animate-winston-glow rounded-full bg-bm-success/40 blur-[4px]" />
          ) : null}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
            System Status
          </p>
          <p className="truncate text-sm font-semibold text-bm-text">{messageText[status]}</p>
        </div>
      </div>
      {lastChecked && (
        <div className="shrink-0 text-left sm:text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Last Check</p>
          <p className="text-sm text-bm-muted">
            {lastChecked.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
      )}
    </div>
  );
}

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
  degraded: "Services degraded",
  checking: "Checking services…",
};

export function SystemStatusBanner({
  status,
  lastChecked,
}: {
  status: GatewayStatus;
  lastChecked: Date | null;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-bm-border/20 bg-bm-surface/40 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass[status])} />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          System Status
        </span>
        <span className="text-xs font-medium text-bm-text">{messageText[status]}</span>
      </div>
      {lastChecked && (
        <span className="text-[11px] text-bm-muted2">
          Last check:{" "}
          {lastChecked.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}

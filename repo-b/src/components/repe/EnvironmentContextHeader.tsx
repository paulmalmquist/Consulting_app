import React from "react";

interface EnvironmentContextHeaderProps {
  envLabel: string;
  asOfDate: string;
  status: "active" | "draft" | "locked";
}

export function EnvironmentContextHeader({ envLabel, asOfDate, status }: EnvironmentContextHeaderProps) {
  return (
    <div data-testid="repe-env-context" className="rounded-lg border border-bm-border/70 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Environment</p>
      <h2 className="text-base font-semibold" data-testid="repe-env-label">{envLabel}</h2>
      <p className="text-xs text-bm-muted2" data-testid="repe-as-of-date">As of {asOfDate}</p>
      <p className="text-xs text-bm-muted2" data-testid="repe-env-status">Status: {status}</p>
    </div>
  );
}

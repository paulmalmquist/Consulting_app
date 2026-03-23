"use client";

import React from "react";

type Status = "compliant" | "monitor" | "at_risk" | "non_compliant" | "not_applicable" | string | null | undefined;

function tone(status: Status): string {
  switch (status) {
    case "non_compliant":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    case "at_risk":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case "compliant":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    default:
      return "border-bm-border/70 bg-bm-surface/30 text-bm-muted2";
  }
}

function label(status: Status): string {
  if (!status) return "Unknown";
  return String(status).replace(/_/g, " ");
}

export function RegulatoryRiskBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${tone(status)}`}>
      {label(status)}
    </span>
  );
}

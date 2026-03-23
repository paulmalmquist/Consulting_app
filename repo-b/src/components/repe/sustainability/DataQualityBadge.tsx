"use client";

import React from "react";

type Status = "complete" | "review" | "blocked" | string | null | undefined;

function tone(status: Status): string {
  switch (status) {
    case "complete":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "blocked":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    default:
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
}

function label(status: Status): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "blocked":
      return "Blocked";
    default:
      return "Review";
  }
}

export function DataQualityBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone(status)}`}
      data-testid="sus-data-quality-badge"
    >
      Data Quality: {label(status)}
    </span>
  );
}

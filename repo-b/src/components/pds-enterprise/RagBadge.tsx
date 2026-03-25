"use client";

import { ragColor } from "@/lib/pds-thresholds";

type Props = {
  status: "green" | "amber" | "red" | "unknown";
  label?: string;
  trend?: "improving" | "stable" | "declining";
};

const TREND_ARROWS: Record<string, string> = {
  improving: "\u2191",
  stable: "\u2192",
  declining: "\u2193",
};

export function RagBadge({ status, label, trend }: Props) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${ragColor(status)}`} />
      {label && <span className="text-zinc-300">{label}</span>}
      {trend && <span className="text-zinc-500">{TREND_ARROWS[trend]}</span>}
    </span>
  );
}

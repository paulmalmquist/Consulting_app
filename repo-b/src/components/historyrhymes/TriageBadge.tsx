"use client";

import React from "react";
import type { TriageState } from "@/lib/historyrhymes/client";

const TRIAGE_CLASS: Record<TriageState, string> = {
  "Act Now": "bg-red-500/20 text-red-300 border border-red-500/40",
  Watch: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
  "Research Only": "bg-neutral-700 text-neutral-300 border border-neutral-600",
};

export function TriageBadge({ triage }: { triage: TriageState }) {
  const cls = TRIAGE_CLASS[triage] ?? TRIAGE_CLASS["Research Only"];
  return (
    <span
      className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded ${cls}`}
      data-testid="hr-triage-badge"
      data-triage={triage}
    >
      {triage}
    </span>
  );
}

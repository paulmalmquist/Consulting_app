"use client";
import React from "react";

type RiskLevel = "critical" | "high" | "moderate" | "low" | "green";

const RISK_CONFIG: Record<RiskLevel, { bg: string; text: string; dot: string; label: string }> = {
  critical: { bg: "bg-red-500/15 border-red-500/30", text: "text-red-400", dot: "bg-red-500", label: "Critical" },
  high: { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-400", dot: "bg-amber-500", label: "High" },
  moderate: { bg: "bg-yellow-500/15 border-yellow-500/30", text: "text-yellow-400", dot: "bg-yellow-500", label: "Moderate" },
  low: { bg: "bg-emerald-500/12 border-emerald-500/25", text: "text-emerald-400", dot: "bg-emerald-500", label: "Low" },
  green: { bg: "bg-emerald-500/12 border-emerald-500/25", text: "text-emerald-400", dot: "bg-emerald-500", label: "On Track" },
};

export function deriveRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "moderate";
  return "low";
}

export function PdsRiskBadge({ level, label }: { level: RiskLevel; label?: string }) {
  const config = RISK_CONFIG[level] || RISK_CONFIG.low;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${config.bg} ${config.text}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {label || config.label}
    </span>
  );
}

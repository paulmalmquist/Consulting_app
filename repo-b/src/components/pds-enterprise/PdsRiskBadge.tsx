"use client";
import React from "react";

type RiskLevel = "critical" | "high" | "moderate" | "low" | "green";

const RISK_CONFIG: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-pds-signalRed/20 border-pds-signalRed/40", text: "text-pds-signalRed", label: "Critical" },
  high: { bg: "bg-pds-signalOrange/20 border-pds-signalOrange/40", text: "text-pds-signalOrange", label: "High" },
  moderate: { bg: "bg-pds-signalYellow/20 border-pds-signalYellow/40", text: "text-pds-signalYellow", label: "Moderate" },
  low: { bg: "bg-pds-signalGreen/15 border-pds-signalGreen/30", text: "text-pds-signalGreen", label: "Low" },
  green: { bg: "bg-pds-signalGreen/15 border-pds-signalGreen/30", text: "text-pds-signalGreen", label: "On Track" },
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
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${level === "critical" ? "bg-pds-signalRed" : level === "high" ? "bg-pds-signalOrange" : level === "moderate" ? "bg-pds-signalYellow" : "bg-pds-signalGreen"}`} />
      {label || config.label}
    </span>
  );
}

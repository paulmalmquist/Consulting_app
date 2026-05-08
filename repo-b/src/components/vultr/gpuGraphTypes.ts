/**
 * Shared types for the GPU Capacity Command Graph components.
 * Re-exported from the Zod contracts where they overlap;
 * defined here when specific to the graph rendering layer.
 */
export type { GpuCommandGraphOut } from "@/lib/vultr-contracts";

export type GpuMetric = "utilization" | "revenue" | "margin" | "exhaustion";
export type GpuPeriod = "7D" | "30D" | "MTD" | "QTD" | "90D";
export type GpuSegment = "all" | "enterprise" | "smb" | "startup";

export type CapacityRisk = "low" | "medium" | "high" | "critical";

export const RISK_COLOR: Record<CapacityRisk, string> = {
  low: "text-emerald-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-rose-400",
};

export const RISK_BORDER: Record<CapacityRisk, string> = {
  low: "border-emerald-500/40",
  medium: "border-yellow-500/40",
  high: "border-orange-500/40",
  critical: "border-rose-500/40",
};

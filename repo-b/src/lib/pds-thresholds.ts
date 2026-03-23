/** PDS utilization threshold constants and role targets. */

export const UTILIZATION_THRESHOLDS = {
  severely_under: 50,
  under: 70,
  target_high: 90,
  high: 110,
} as const;

export const ROLE_TARGETS: Record<string, [number, number]> = {
  junior: [80, 90],
  mid: [75, 85],
  senior_manager: [65, 75],
  director: [50, 65],
  executive: [40, 50],
};

export const INDUSTRY_BENCHMARK = 68.9;
export const FIRM_TARGET = 75;

/** RAG color thresholds for variance analysis. */
export const VARIANCE_THRESHOLDS = {
  green: 5,   // within 5% of target
  amber: 15,  // 5-15% below target
  // red: >15% below target
} as const;

/** NPS score thresholds. */
export const NPS_THRESHOLDS = {
  excellent: 50,
  good: 30,
  neutral: 0,
  // poor: < 0
} as const;

export const NPS_BENCHMARK = 28; // CRE industry average

/** Technology adoption DAU/MAU benchmarks. */
export const DAU_MAU_BENCHMARKS = {
  low: 13,
  average: 25,
  excellent: 40,
} as const;

/** Map a utilization percentage to a Tailwind color class. */
export function utilizationColor(pct: number): string {
  if (pct < UTILIZATION_THRESHOLDS.severely_under) return "text-gray-400";
  if (pct < UTILIZATION_THRESHOLDS.under) return "text-yellow-500";
  if (pct < UTILIZATION_THRESHOLDS.target_high) return "text-green-500";
  if (pct < UTILIZATION_THRESHOLDS.high) return "text-orange-500";
  return "text-red-500";
}

export function utilizationBg(pct: number): string {
  if (pct < UTILIZATION_THRESHOLDS.severely_under) return "bg-gray-200";
  if (pct < UTILIZATION_THRESHOLDS.under) return "bg-yellow-100";
  if (pct < UTILIZATION_THRESHOLDS.target_high) return "bg-green-100";
  if (pct < UTILIZATION_THRESHOLDS.high) return "bg-orange-100";
  return "bg-red-100";
}

/** RAG status for a variance percentage. */
export function ragFromVariance(variancePct: number): "green" | "amber" | "red" {
  const abs = Math.abs(variancePct);
  if (abs <= VARIANCE_THRESHOLDS.green) return "green";
  if (abs <= VARIANCE_THRESHOLDS.amber) return "amber";
  return "red";
}

export function ragColor(rag: "green" | "amber" | "red" | "unknown"): string {
  if (rag === "green") return "bg-green-500";
  if (rag === "amber") return "bg-yellow-500";
  if (rag === "red") return "bg-red-500";
  return "bg-gray-400";
}

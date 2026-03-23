"use client";

export function ClawbackRiskBadge({ riskLevel }: { riskLevel: "none" | "low" | "medium" | "high" | null | undefined }) {
  const tone = {
    none: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    high: "border-red-500/40 bg-red-500/10 text-red-300",
  }[riskLevel || "none"];

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${tone}`}>
      Clawback {riskLevel || "none"}
    </span>
  );
}

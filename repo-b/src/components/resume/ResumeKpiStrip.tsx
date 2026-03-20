"use client";

import type { ResumeCareerSummary } from "@/lib/bos-api";

export default function ResumeKpiStrip({ summary }: { summary: ResumeCareerSummary }) {
  const kpis = [
    { label: "Years Experience", value: `${Math.floor(summary.total_years)}+` },
    { label: "Companies", value: String(summary.total_companies) },
    { label: "Skills", value: `${summary.total_skills}+` },
    { label: "Projects", value: String(summary.total_projects) },
    { label: "Education", value: summary.education },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-xl border border-bm-border/70 bg-bm-surface/20 px-4 py-3"
        >
          <p className="text-[11px] uppercase tracking-wider text-bm-muted2">{kpi.label}</p>
          <p className="mt-1 text-lg font-semibold">{kpi.value}</p>
        </div>
      ))}
    </div>
  );
}

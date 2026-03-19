"use client";

import type { ReV2AssetQuarterState } from "@/lib/bos-api";
import SectionHeader from "../shared/SectionHeader";
import { BRIEFING_CONTAINER } from "../shared/briefing-colors";
import { getMockRiskIndicators, type RiskSeverity } from "../mock-data";

interface Props {
  financialState: ReV2AssetQuarterState | null;
}

const SEVERITY_STYLES: Record<RiskSeverity, string> = {
  high:   "bg-bm-danger/[0.10] text-bm-danger",
  medium: "bg-bm-warning/[0.10] text-bm-warning",
  low:    "bg-bm-border/[0.10] text-bm-muted",
};

const SEVERITY_DOT: Record<RiskSeverity, string> = {
  high:   "bg-bm-danger",
  medium: "bg-bm-warning",
  low:    "bg-bm-borderStrong",
};

export default function RiskIndicatorsPanel({ financialState }: Props) {
  const risks = getMockRiskIndicators(financialState);

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader
        eyebrow="RISK MONITORING"
        title="Asset Risk Indicators"
        description={`${risks.filter((r) => r.severity === "high").length} high, ${risks.filter((r) => r.severity === "medium").length} medium flags`}
      />

      <div className="mt-5 space-y-3">
        {risks.map((r) => (
          <div
            key={r.label}
            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/8 dark:bg-white/[0.02]"
          >
            <span
              className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_STYLES[r.severity]}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[r.severity]}`} />
              {r.severity.charAt(0).toUpperCase() + r.severity.slice(1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-bm-text">{r.label}</p>
              <p className="mt-0.5 text-sm text-bm-muted2">{r.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

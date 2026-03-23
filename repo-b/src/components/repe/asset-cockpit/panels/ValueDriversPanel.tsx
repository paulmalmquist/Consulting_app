"use client";

import type { ReV2AssetQuarterState, ReV2AssetPeriod } from "@/lib/bos-api";
import SectionHeader from "../shared/SectionHeader";
import HorizontalBar from "../shared/HorizontalBar";
import { BRIEFING_COLORS, BRIEFING_CONTAINER } from "../shared/briefing-colors";
import { getMockValueDrivers } from "../mock-data";

interface Props {
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
}

export default function ValueDriversPanel({ financialState, periods }: Props) {
  const vd = getMockValueDrivers(financialState, periods);

  const drivers = [
    { label: "NOI Growth", value: vd.noi_growth, color: BRIEFING_COLORS.performance },
    { label: "Cap Rate Compression", value: vd.cap_rate_change, color: BRIEFING_COLORS.capital },
    { label: "CapEx Investment", value: vd.capex_impact, color: BRIEFING_COLORS.structure },
  ];

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader
        eyebrow="VALUE DRIVERS"
        title="Value Change Decomposition"
        description={`Total value impact: ${vd.total >= 0 ? "+" : ""}${vd.total}%`}
      />

      <div className="mt-5 space-y-4">
        {drivers.map((d) => (
          <HorizontalBar
            key={d.label}
            label={d.label}
            value={`${d.value >= 0 ? "+" : ""}${d.value}%`}
            pct={Math.abs(d.value) * 10} /* scale for visual */
            color={d.color}
          />
        ))}

        {/* Total bar */}
        <div className="mt-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-bm-text">Total Value Impact</span>
            <span
              className={`font-semibold tabular-nums ${
                vd.total >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {vd.total >= 0 ? "+" : ""}
              {vd.total}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

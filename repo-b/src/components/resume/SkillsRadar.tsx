"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE } from "@/components/charts/chart-theme";
import type { ResumeSkillMatrix } from "@/lib/bos-api";

const CATEGORY_LABELS: Record<string, string> = {
  data_platform: "Data Platform",
  ai_ml: "AI / ML",
  languages: "Languages",
  cloud: "Cloud",
  visualization: "Visualization",
  domain: "Domain",
  leadership: "Leadership",
};

export default function SkillsRadar({ matrix }: { matrix: ResumeSkillMatrix[] }) {
  const data = matrix.map((m) => ({
    category: CATEGORY_LABELS[m.category] || m.category,
    proficiency: m.avg_proficiency,
    skills: m.skill_count,
    fullMark: 10,
  }));

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-bm-muted2">
        Skills Radar
      </h2>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis dataKey="category" tick={{ ...AXIS_TICK_STYLE, fontSize: 10 }} />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              tick={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number, _name: string, entry: { payload?: Record<string, unknown> }) => {
                const p = entry?.payload;
                return [`${value}/10 avg (${p?.skills ?? 0} skills)`, String(p?.category ?? "")];
              }}
            />
            <Radar
              dataKey="proficiency"
              stroke={CHART_COLORS.revenue}
              fill={CHART_COLORS.revenue}
              fillOpacity={0.25}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

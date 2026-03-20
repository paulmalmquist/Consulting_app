"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CHART_COLORS, TOOLTIP_STYLE } from "@/components/charts/chart-theme";
import type { ResumeRole } from "@/lib/bos-api";

const COLORS = [
  CHART_COLORS.revenue,
  CHART_COLORS.noi,
  CHART_COLORS.opex,
  CHART_COLORS.warning,
  CHART_COLORS.scenario[4],
];

function yearDiff(start: string, end: string | null): number {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  return Math.max(0.3, (e.getTime() - s.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export default function ExperienceBreakdown({ roles }: { roles: ResumeRole[] }) {
  const companyMap = new Map<string, number>();
  for (const r of roles) {
    const years = yearDiff(r.start_date, r.end_date);
    companyMap.set(r.company, (companyMap.get(r.company) || 0) + years);
  }

  const data = Array.from(companyMap.entries())
    .map(([company, years]) => ({
      name: company,
      value: Math.round(years * 10) / 10,
    }))
    .sort((a, b) => b.value - a.value);

  const totalYears = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-bm-muted2">
        Experience by Company
      </h2>
      <div className="h-[280px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={55}
              outerRadius={85}
              dataKey="value"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number, name: string) => [
                `${value} years`,
                name,
              ]}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-xs text-bm-muted">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ marginBottom: 40 }}>
          <div className="text-center">
            <p className="text-2xl font-bold">{Math.round(totalYears)}</p>
            <p className="text-[10px] uppercase tracking-wider text-bm-muted2">Years</p>
          </div>
        </div>
      </div>
    </div>
  );
}

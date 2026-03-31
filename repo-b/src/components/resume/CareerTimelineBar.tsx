"use client";

import { useMemo } from "react";
import {
  Area,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import type { ResumeTimeline } from "@/lib/bos-api";
import { AXIS_TICK_STYLE } from "@/components/charts/chart-theme";

function parseUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function monthRange(startIso: string, endIso: string): Date[] {
  const start = parseUTC(startIso);
  const end = parseUTC(endIso);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const months: Date[] = [];
  while (cursor <= limit) {
    months.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function tickLabel(value: number) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    timeZone: "UTC",
  });
}

type PhasePoint = {
  ts: number;
  label: string;
  [key: string]: string | number;
};

type CustomTooltipProps = {
  active?: boolean;
  label?: number;
  payload?: Array<{ name: string; value: number; color: string }>;
};

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const activePhase = payload.find((p) => p.value > 0);
  if (!activePhase) return null;
  const date = new Date(label).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <div
      style={{
        backgroundColor: "hsl(217, 29%, 9%)",
        border: "1px solid hsl(215, 10%, 58%)",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 12,
        color: "hsl(210, 24%, 94%)",
      }}
    >
      <p style={{ color: activePhase.color, fontWeight: 600 }}>{activePhase.name}</p>
      <p style={{ color: "hsl(215,12%,72%)", marginTop: 2 }}>{date}</p>
    </div>
  );
}

export default function CareerTimelineBar({ timeline }: { timeline: ResumeTimeline }) {
  const phases = useMemo(
    () => [...timeline.phases].sort((a, b) => a.display_order - b.display_order),
    [timeline.phases],
  );

  const today = new Date().toISOString().slice(0, 10);
  const end = timeline.end_date > today ? timeline.end_date : today;

  const data = useMemo<PhasePoint[]>(() => {
    const months = monthRange(timeline.start_date, end);
    return months.map((month) => {
      const ts = month.getTime();
      const point: PhasePoint = {
        ts,
        label: month.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      };
      phases.forEach((phase) => {
        const phaseStart = parseUTC(phase.start_date).getTime();
        const phaseEnd = parseUTC(phase.end_date ?? end).getTime();
        point[phase.phase_id] = ts >= phaseStart && ts <= phaseEnd ? 1 : 0;
      });
      return point;
    });
  }, [phases, timeline.start_date, end]);

  // Compute x-axis tick positions (once per year, Jan 1)
  const yearTicks = useMemo(() => {
    const months = monthRange(timeline.start_date, end);
    const seen = new Set<number>();
    const ticks: number[] = [];
    months.forEach((m) => {
      if (m.getUTCMonth() === 0) {
        const y = m.getUTCFullYear();
        if (!seen.has(y)) {
          seen.add(y);
          ticks.push(m.getTime());
        }
      }
    });
    return ticks;
  }, [timeline.start_date, end]);

  if (phases.length === 0) return null;

  return (
    <div className="mt-5">
      {/* Company legend */}
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {phases.map((phase) => (
          <div key={phase.phase_id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: phase.band_color }}
            />
            <span className="text-xs text-bm-muted">{phase.company}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          {phases.map((phase) => (
            <Area
              key={phase.phase_id}
              type="step"
              dataKey={phase.phase_id}
              name={phase.company}
              stackId="career"
              stroke={phase.band_color}
              strokeWidth={0}
              fill={phase.band_color}
              fillOpacity={0.72}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />
          ))}
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={yearTicks}
            tickFormatter={tickLabel}
            tick={AXIS_TICK_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            scale="time"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(107,114,128,0.3)", strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

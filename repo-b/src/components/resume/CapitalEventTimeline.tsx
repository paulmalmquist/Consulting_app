"use client";

import { useMemo } from "react";
import {
  Area,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "@/lib/format-utils";
import type { ModelingEvent, EquityPositionPoint } from "./modelingEvents";

const EVENT_COLORS: Record<string, string> = {
  acquisition: "#60a5fa",
  distribution: "#34d399",
  refi: "#fbbf24",
  sale: "#c084fc",
};

const EVENT_LABELS: Record<string, string> = {
  acquisition: "Acquisition",
  distribution: "Distribution",
  refi: "Refinance",
  sale: "Sale",
};

export default function CapitalEventTimeline({
  events,
  equityPositionSeries,
  height = 240,
}: {
  events: ModelingEvent[];
  equityPositionSeries: EquityPositionPoint[];
  height?: number;
}) {
  const data = useMemo(
    () =>
      equityPositionSeries.map((point) => ({
        year: `Year ${point.year}`,
        yearNum: point.year,
        cumulative: point.cumulative,
      })),
    [equityPositionSeries],
  );

  const milestoneEvents = useMemo(
    () => events.filter((e) => e.type !== "distribution"),
    [events],
  );

  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Capital event timeline</h3>
          <p className="mt-1 text-xs text-bm-muted2">Equity position over the hold period with key events marked.</p>
        </div>
        <div className="flex items-center gap-3">
          {(["acquisition", "refi", "sale"] as const).map((type) => (
            <span key={type} className="flex items-center gap-1.5 text-[10px] text-bm-muted2">
              <span className="h-2 w-2 rounded-full" style={{ background: EVENT_COLORS[type] }} />
              {EVENT_LABELS[type]}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="year"
              stroke="rgba(255,255,255,0.45)"
              tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
            />
            <YAxis
              stroke="rgba(255,255,255,0.45)"
              tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
              tickFormatter={(v) => fmtMoney(v).replace("$", "")}
            />
            <Tooltip
              contentStyle={{ background: "#08101A", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }}
              formatter={(value: number) => [fmtMoney(value), "Equity Position"]}
              labelStyle={{ color: "rgba(255,255,255,0.7)" }}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#equityGrad)"
            />
            {milestoneEvents.map((event) => (
              <ReferenceLine
                key={event.event_id}
                x={`Year ${event.year}`}
                stroke={EVENT_COLORS[event.type]}
                strokeDasharray={event.type === "refi" ? "4 4" : undefined}
                strokeWidth={1.5}
                label={{
                  value: event.label,
                  position: "top",
                  fill: EVENT_COLORS[event.type],
                  fontSize: 10,
                }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

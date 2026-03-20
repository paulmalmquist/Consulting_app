"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE } from "@/components/charts/chart-theme";
import type { ResumeRole } from "@/lib/bos-api";

function yearDiff(start: string, end: string | null): number {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  return Math.max(0.5, (e.getTime() - s.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

const COLORS = CHART_COLORS.scenario;

export default function CareerTimeline({ roles }: { roles: ResumeRole[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const data = roles.map((r) => ({
    label: `${r.title.split(",")[0]}`,
    company: r.company,
    years: Math.round(yearDiff(r.start_date, r.end_date) * 10) / 10,
    start: fmtDate(r.start_date),
    end: r.end_date ? fmtDate(r.end_date) : "Present",
    role: r,
  }));

  const selected = selectedIdx !== null ? data[selectedIdx]?.role : null;

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-bm-muted2">
        Career Timeline
      </h2>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
          >
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${v}y`}
              tick={AXIS_TICK_STYLE}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="company"
              width={160}
              tick={AXIS_TICK_STYLE}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number, _name: string, entry: { payload?: Record<string, unknown> }) => {
                const p = entry?.payload;
                return [`${value} years (${p?.start ?? ""} — ${p?.end ?? ""})`, String(p?.label ?? "")];
              }}
            />
            <Bar dataKey="years" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(_d, idx) => setSelectedIdx(idx === selectedIdx ? null : idx)}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={COLORS[i % COLORS.length]}
                  opacity={selectedIdx === null || selectedIdx === i ? 1 : 0.35}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {selected && (
        <div className="mt-4 rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-semibold">{selected.title}</p>
              <p className="text-sm text-bm-muted2">
                {selected.company}{selected.division ? ` — ${selected.division}` : ""} &middot; {selected.location}
              </p>
            </div>
            <p className="text-xs text-bm-muted2">
              {fmtDate(selected.start_date)} — {selected.end_date ? fmtDate(selected.end_date) : "Present"}
            </p>
          </div>
          {selected.summary && <p className="mt-2 text-sm text-bm-muted">{selected.summary}</p>}
          {selected.highlights.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-bm-muted">
              {selected.highlights.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                  {h}
                </li>
              ))}
            </ul>
          )}
          {selected.technologies.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selected.technologies.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-bm-border/70 px-2 py-0.5 text-[10px] text-bm-muted2"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

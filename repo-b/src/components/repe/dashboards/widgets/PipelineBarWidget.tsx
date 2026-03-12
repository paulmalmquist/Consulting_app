"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { WidgetConfig } from "@/lib/dashboards/types";

interface PipelineStageRow {
  status: string;
  deal_count: number;
  total_value: number;
}

interface Props {
  envId: string;
  businessId: string;
  config: WidgetConfig;
}

const STAGE_ORDER = ["sourced", "screening", "loi", "dd", "ic", "closing", "closed", "dead"];
const STAGE_COLORS: Record<string, string> = {
  sourced: "#94a3b8",
  screening: "#60a5fa",
  loi: "#818cf8",
  dd: "#a78bfa",
  ic: "#f59e0b",
  closing: "#10b981",
  closed: "#2EB67D",
  dead: "#ef4444",
};

function formatValue(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function PipelineBarWidget({ envId, businessId, config }: Props) {
  const [rows, setRows] = useState<PipelineStageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ env_id: envId, business_id: businessId });
    if (config.pipeline_filter?.fund_id) params.set("fund_id", config.pipeline_filter.fund_id);
    fetch(`/api/re/v2/dashboards/pipeline-stages?${params}`)
      .then((r) => r.json())
      .then((data) => {
        // Sort by stage order
        const sorted = [...(data.stages ?? [])].sort(
          (a: PipelineStageRow, b: PipelineStageRow) =>
            STAGE_ORDER.indexOf(a.status) - STAGE_ORDER.indexOf(b.status),
        );
        setRows(sorted);
      })
      .catch(() => setError("Failed to load pipeline data"))
      .finally(() => setLoading(false));
  }, [envId, businessId, config.pipeline_filter?.fund_id]);

  if (loading) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading…</div>;
  if (error) return <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>;
  if (!rows.length) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">No pipeline data</div>;

  const valueField = config.pipeline_value_field === "deal_count" ? "deal_count" : "total_value";
  const tickFormatter = valueField === "deal_count" ? (v: number) => String(v) : formatValue;

  return (
    <div className="flex flex-col h-full gap-2 p-1">
      {config.title && <div className="text-sm font-semibold text-slate-200 px-1">{config.title}</div>}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="status"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={tickFormatter}
            width={60}
          />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
            labelStyle={{ color: "#e2e8f0" }}
            formatter={(value: number) =>
              valueField === "deal_count" ? [value, "Deals"] : [formatValue(value), "Total Value"]
            }
          />
          <Bar dataKey={valueField} radius={[3, 3, 0, 0]}>
            {rows.map((row) => (
              <Cell key={row.status} fill={STAGE_COLORS[row.status] ?? "#60a5fa"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

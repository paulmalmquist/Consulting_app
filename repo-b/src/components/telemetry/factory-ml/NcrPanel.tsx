"use client";

// NCR intelligence: defect-code clusters with monthly trends and exemplars —
// the honest version of the rs_jsx FactoryNcrIntelligence draft (the seed
// clusters by defect code; no synthetic UMAP coordinates are invented).

import { useState } from "react";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { C, Panel, SplitGrid, Tag } from "../primitives";
import type { NcrExport } from "@/lib/lab/factoryMlData";

export default function NcrPanel({ data }: { data: NcrExport }) {
  const clusters = [...data.clusters].sort((a, b) => b.n - a.n);
  const [selected, setSelected] = useState(clusters[0]?.defect_code ?? "");
  const active = clusters.find((c) => c.defect_code === selected) ?? clusters[0];

  return (
    <SplitGrid variant="five-seven">
      <Panel title="Defect pareto" pad={12}>
        <ResponsiveContainer width="100%" height={Math.max(200, clusters.length * 30)}>
          <BarChart data={clusters} layout="vertical" margin={{ left: 24, right: 12 }}>
            <XAxis type="number" tick={{ fontFamily: C.mono, fontSize: 9, fill: C.faint }} stroke={C.border} />
            <YAxis type="category" dataKey="defect_code" width={140}
              tick={{ fontFamily: C.mono, fontSize: 10, fill: C.dim }} stroke={C.border} />
            <Bar dataKey="n" radius={[0, 3, 3, 0]} isAnimationActive={false}
              onClick={(entry) => setSelected((entry as { defect_code?: string }).defect_code ?? "")}
              fill={C.cyan} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {active && (
        <Panel title={active.defect_code} pad={14}
          right={
            <div style={{ display: "flex", gap: 6 }}>
              <Tag color={active.open_n ? C.red : C.green}>{active.open_n} open</Tag>
              <Tag color={C.faint}>{active.n} total</Tag>
            </div>
          }>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginBottom: 8 }}>
            avg age {active.avg_age_days.toFixed(0)} days
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={active.trend} margin={{ top: 4, right: 8 }}>
              <XAxis dataKey="month" tick={{ fontFamily: C.mono, fontSize: 9, fill: C.faint }}
                stroke={C.border} />
              <YAxis hide />
              <Line dataKey="n" stroke={C.amber} dot={false} strokeWidth={1.6} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 10 }}>
            {active.exemplars.map((e) => (
              <div key={e.ncr_id} style={{ display: "flex", gap: 10, alignItems: "baseline",
                padding: "7px 0", borderBottom: `1px solid ${C.border}`,
                fontFamily: C.mono, fontSize: 10.5 }}>
                <span style={{ color: C.text }}>{e.ncr_id}</span>
                <span style={{ color: C.faint }}>{e.opened_date}</span>
                <Tag color={e.status === "open" ? C.red : e.status === "in_review" ? C.amber : C.green}>
                  {e.status}
                </Tag>
                <span style={{ color: C.dim }}>{e.disposition}</span>
                <span style={{ color: C.faint, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap" }}>{e.part_id}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </SplitGrid>
  );
}

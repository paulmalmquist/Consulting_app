"use client";

// NCR intelligence: defect-code clusters with monthly trends and exemplars —
// the honest version of the rs_jsx FactoryNcrIntelligence draft (the seed
// clusters by defect code; no synthetic UMAP coordinates are invented).

import { useState } from "react";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { C, Panel, SplitGrid, Tag } from "../primitives";
import type { DrillObject } from "./factoryDrill";
import type { NcrExport } from "@/lib/lab/factoryMlData";

export default function NcrPanel({ data, onDrill }: {
  data: NcrExport;
  onDrill: (d: DrillObject) => void;
}) {
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
        <Panel pad={14}
          title={
            <button type="button"
              onClick={() => onDrill({ kind: "ncr_category", cluster: active })}
              aria-label={`Inspect defect category ${active.defect_code}`}
              style={{ all: "unset", cursor: "pointer", color: C.cyan, textDecoration: "underline", textUnderlineOffset: 2 }}>
              {active.defect_code}
            </button>
          }
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
              <button key={e.ncr_id} type="button"
                onClick={() => onDrill({ kind: "ncr", ncrId: e.ncr_id, partId: e.part_id, disposition: e.disposition, status: e.status, openedDate: e.opened_date, defectCode: active.defect_code })}
                aria-label={`Inspect NCR ${e.ncr_id}`}
                style={{ all: "unset", cursor: "pointer", display: "flex", gap: 10, alignItems: "baseline",
                  padding: "7px 4px", borderBottom: `1px solid ${C.border}`,
                  fontFamily: C.mono, fontSize: 10.5, width: "100%", boxSizing: "border-box" }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = "rgba(63,177,232,0.06)"; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}>
                <span style={{ color: C.text }}>{e.ncr_id}</span>
                <span style={{ color: C.faint }}>{e.opened_date}</span>
                <Tag color={e.status === "open" ? C.red : e.status === "in_review" ? C.amber : C.green}>
                  {e.status}
                </Tag>
                <span style={{ color: C.dim }}>{e.disposition}</span>
                <span style={{ color: C.faint, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap" }}>{e.part_id}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}
    </SplitGrid>
  );
}

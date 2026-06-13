"use client";

// Per-vehicle readiness: SVG arc gauges driven by the gold readiness rollup.
// The anchor (VEH-TR-003) renders blocked with its scenario-tagged NCRs —
// every number traces to a seed table through the medallion.

import { C, Panel, Tag } from "../primitives";
import type { ReadinessExport } from "@/lib/lab/factoryMlData";

function statusColor(status: string): string {
  if (status === "green") return C.green;
  if (status === "yellow" || status === "amber") return C.amber;
  return C.red;
}

function Gauge({ score, color }: { score: number; color: string }) {
  const radius = 44;
  const sweep = Math.PI * 1.5; // 270deg arc
  const start = Math.PI * 0.75;
  const arc = (frac: number) => {
    const a0 = start;
    const a1 = start + sweep * Math.max(0, Math.min(1, frac));
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number) => [60 + radius * Math.cos(a), 60 + radius * Math.sin(a)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
  };
  return (
    <svg width="120" height="104" viewBox="0 0 120 104">
      <path d={arc(1)} stroke={C.border} strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d={arc(score)} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" />
      <text x="60" y="64" textAnchor="middle" fill={color}
        style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600 }}>
        {(score * 100).toFixed(0)}
      </text>
      <text x="60" y="80" textAnchor="middle" fill={C.faint}
        style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em" }}>
        READINESS
      </text>
    </svg>
  );
}

export default function ReadinessGauge({ data }: { data: ReadinessExport }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>
      {data.vehicles.map((v) => {
        const color = statusColor(v.status);
        const anchor = v.vehicle_id === data.anchor_vehicle;
        return (
          <Panel key={v.vehicle_id} pad={14}
            style={anchor ? { borderColor: C.red + "66", boxShadow: `0 0 16px ${C.red}22` } : undefined}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text }}>{v.vehicle_id}</span>
              <Tag color={color}>{v.status}</Tag>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Gauge score={v.readiness_score} color={color} />
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.9 }}>
                <div>open NCRs <span style={{ color: v.open_ncrs ? C.amber : C.green }}>{v.open_ncrs}</span></div>
                {v.scenario_open_ncrs > 0 && (
                  <div>blocking NCRs <span style={{ color: C.red }}>{v.scenario_open_ncrs}</span></div>
                )}
                <div>inconclusive tests <span style={{ color: v.inconclusive_tests ? C.amber : C.green }}>{v.inconclusive_tests}</span></div>
                {v.unresolved_anomalies > 0 && (
                  <div>unresolved anomalies <span style={{ color: C.red }}>{v.unresolved_anomalies}</span></div>
                )}
                {v.missing_signoffs > 0 && (
                  <div>missing signoffs <span style={{ color: C.red }}>{v.missing_signoffs}</span></div>
                )}
              </div>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 4 }}>
              target launch {v.target_launch_date}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

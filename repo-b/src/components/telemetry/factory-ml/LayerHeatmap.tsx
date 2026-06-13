"use client";

// Run x layer-window heatmap of rolling-std z-scores. The SCN-005 golden pair
// is pinned to the top and highlighted: TEST-HOTFIRE-2026-00088 (inconclusive)
// rhymes with 00041 (failed) because both carry the PF-TPL-01 pre-failure
// template — the visual argument for similarity-based anomaly review.

import { useState } from "react";
import { C, Panel, Tag } from "../primitives";
import type { HeatmapExport } from "@/lib/lab/factoryMlData";

function zColor(z: number): string {
  // blue (calm) -> panel (neutral) -> red (agitated)
  const clamped = Math.max(-2.5, Math.min(2.5, z));
  if (clamped < 0) {
    const t = -clamped / 2.5;
    return `rgba(63,177,232,${0.08 + t * 0.45})`;
  }
  const t = clamped / 2.5;
  return `rgba(239,112,102,${0.08 + t * 0.7})`;
}

export default function LayerHeatmap({ data }: { data: HeatmapExport }) {
  const [selected, setSelected] = useState<string | null>(null);
  const anchorSet = new Set(data.anchor_pair);
  const runs = [...data.runs].sort((a, b) => {
    const aAnchor = anchorSet.has(a.run_id) ? 0 : 1;
    const bAnchor = anchorSet.has(b.run_id) ? 0 : 1;
    return aAnchor - bAnchor || a.run_id.localeCompare(b.run_id);
  });
  const maxWindows = Math.max(...runs.map((r) => r.cells.length), 1);
  const detail = runs.find((r) => r.run_id === selected);

  return (
    <Panel title="Layer-window shape heatmap" pad={12}
      right={<Tag color={C.cyan}>{runs.length} runs · rolling std z-score</Tag>}>
      <div style={{ overflowX: "auto" }}>
        {runs.map((run) => {
          const anchor = anchorSet.has(run.run_id);
          const isSelected = run.run_id === selected;
          return (
            <button key={run.run_id} type="button"
              onClick={() => setSelected(isSelected ? null : run.run_id)}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%",
                background: isSelected ? C.panelHi : "transparent", border: "none",
                padding: "1px 2px", cursor: "pointer" }}>
              <span style={{ fontFamily: C.mono, fontSize: 9.5, width: 210, flexShrink: 0,
                textAlign: "left", color: anchor ? C.amber : C.dim,
                fontWeight: anchor ? 700 : 400 }}>
                {run.run_id}
              </span>
              <span style={{ display: "grid", flex: 1,
                gridTemplateColumns: `repeat(${maxWindows}, minmax(8px, 1fr))`, gap: 1 }}>
                {run.cells.map((cell) => (
                  <span key={cell.w} title={`window ${cell.w}: z=${cell.z}`}
                    style={{ height: 13, background: zColor(cell.z), borderRadius: 2,
                      outline: anchor ? `1px solid ${C.amber}33` : "none" }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {detail && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: C.panelHi,
          borderRadius: 8, border: `1px solid ${C.borderHi}`, fontFamily: C.mono, fontSize: 11 }}>
          <span style={{ color: C.text }}>{detail.run_id}</span>
          <span style={{ color: C.dim }}> · pattern {detail.pattern}</span>
          {detail.scenario_id && <span style={{ color: C.amber }}> · {detail.scenario_id}</span>}
          <span style={{ color: C.faint }}>
            {" "}· peak z {Math.max(...detail.cells.map((c) => c.z)).toFixed(2)}
          </span>
        </div>
      )}
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 10 }}>
        Amber rows: the SCN-005 golden pair — the inconclusive run rhymes with the failed one
        (shared PF-TPL-01 signature). Red cells: rolling variance well above fleet baseline.
      </div>
    </Panel>
  );
}

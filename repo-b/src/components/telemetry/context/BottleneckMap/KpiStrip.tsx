"use client";

// KPI strip derived from the active time window (full range while presenting). Tiles mirror
// RsKpi's visual language; the value gets the keyed fade so window changes read as updates.
import React from "react";

import { RS, RS_MONO, RS_SANS } from "../../rsTokens";
import styles from "./BottleneckMap.module.css";
import type { KpiSummary } from "./types";

function KpiTile({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <div style={{ background: RS.panel, border: `1px solid ${RS.line}`, borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ color: RS.faint, fontSize: 11, marginBottom: 2, fontFamily: RS_SANS }}>{label}</div>
      <div key={value} className={styles.fade}
        style={{ fontFamily: RS_MONO, fontSize: 16, fontWeight: 600, color }}>{value}</div>
      <div style={{ color: RS.dim, fontSize: 10, fontFamily: RS_SANS, marginTop: 1 }}>{sub}</div>
    </div>
  );
}

export default function KpiStrip({ kpi, presenting, windowed, inflationAdjusted }: {
  kpi: KpiSummary;
  presenting: boolean;
  windowed: boolean;
  inflationAdjusted: boolean;
}) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5" style={{ marginTop: 14 }}>
      <KpiTile label="Active window" value={kpi.window} color={RS.text}
        sub={presenting ? "presenter mode" : windowed ? "brushed" : "full range"} />
      <KpiTile label="Orbital attempts" value={kpi.attempts} color={RS.blue} sub="in window" />
      <KpiTile label="Commercial share" value={kpi.share} color={RS.green}
        sub={kpi.shareYear != null ? `as of ${kpi.shareYear}` : ""} />
      <KpiTile label="Cost to LEO" value={kpi.cost} color={RS.amber}
        sub={`${kpi.costLabel}${inflationAdjusted ? ", 2025 $" : ", nominal"}`} />
    </div>
  );
}

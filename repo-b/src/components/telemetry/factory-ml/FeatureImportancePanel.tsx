"use client";

// SHAP top drivers for both models + the headline GroupKFold metrics,
// straight from the MLflow run artifacts.

import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { C, MetricCard, Panel, Tag } from "../primitives";
import type { ImportanceExport } from "@/lib/lab/factoryMlData";

const MODEL_LABELS: Record<string, string> = {
  strength: "Strength margin (regressor)",
  passfail: "Pass / fail (classifier)",
  run_failure: "Run failure (classifier)",
};

export default function FeatureImportancePanel({ data }: { data: ImportanceExport }) {
  const models = Object.keys(data.drivers).filter((k) => Array.isArray(data.drivers[k as "strength"]));
  const [model, setModel] = useState(models[0] || "strength");
  const drivers = (data.drivers[model as "strength"] || []).slice(0, 15);

  const headline = Object.entries(data.headline_metrics);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12, marginBottom: 14 }}>
        {headline.slice(0, 5).map(([key, value]) => (
          <MetricCard key={key} label={key.replace("mean_", "").replace(/_/g, " ")}
            value={value.toFixed(3)} sub="GroupKFold(part_id) mean" />
        ))}
      </div>
      <Panel title="SHAP top drivers" pad={12}
        right={
          <div style={{ display: "flex", gap: 6 }}>
            {models.map((m) => (
              <button key={m} type="button" onClick={() => setModel(m)}
                style={{ fontFamily: C.mono, fontSize: 10, padding: "4px 10px", borderRadius: 6,
                  cursor: "pointer", color: m === model ? C.text : C.dim,
                  background: m === model ? "rgba(63,177,232,0.12)" : "transparent",
                  border: `1px solid ${m === model ? C.cyan + "66" : C.border}` }}>
                {MODEL_LABELS[m] || m}
              </button>
            ))}
          </div>
        }>
        <ResponsiveContainer width="100%" height={Math.max(220, drivers.length * 24)}>
          <BarChart data={drivers} layout="vertical" margin={{ left: 40, right: 16 }}>
            <XAxis type="number" tick={{ fontFamily: C.mono, fontSize: 9, fill: C.faint }}
              stroke={C.border} />
            <YAxis type="category" dataKey="feature" width={220}
              tick={{ fontFamily: C.mono, fontSize: 10, fill: C.dim }} stroke={C.border} />
            <Bar dataKey="impact" fill={C.cyan} radius={[0, 3, 3, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 8 }}>
          <Tag color={C.faint}>MLflow run {data.run_id.slice(0, 12)}…</Tag>
        </div>
      </Panel>
    </div>
  );
}

"use client";

// SHAP top drivers for both models + the headline GroupKFold metrics,
// straight from the MLflow run artifacts. Every metric card and every SHAP
// feature is a click into the evidence drawer.

import { useState } from "react";
import { C, MetricCard, Panel, Tag } from "../primitives";
import type { DrillObject } from "./factoryDrill";
import type { ImportanceExport } from "@/lib/lab/factoryMlData";

const MODEL_LABELS: Record<string, string> = {
  strength: "Strength margin (regressor)",
  passfail: "Pass / fail (classifier)",
  run_failure: "Run failure (classifier)",
};

export default function FeatureImportancePanel({
  data,
  onDrill,
}: {
  data: ImportanceExport;
  onDrill: (d: DrillObject) => void;
}) {
  const models = Object.keys(data.drivers).filter((k) => Array.isArray(data.drivers[k as "strength"]));
  const [model, setModel] = useState(models[0] || "strength");
  const drivers = (data.drivers[model as "strength"] || []).slice(0, 15);
  const method = data.driver_methods?.[model];
  const maxImpact = drivers.reduce((m, d) => Math.max(m, d.impact), 0) || 1;

  const headline = Object.entries(data.headline_metrics);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12, marginBottom: 14 }}>
        {headline.slice(0, 5).map(([key, value]) => (
          <button key={key} type="button"
            onClick={() => onDrill({ kind: "model_metric", metricKey: key, value })}
            aria-label={`Inspect metric ${key}`}
            style={{ all: "unset", cursor: "pointer", display: "block", borderRadius: 9 }}>
            <MetricCard label={key.replace("mean_", "").replace(/_/g, " ")}
              value={value.toFixed(3)} sub="GroupKFold(part_id) mean" />
          </button>
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
        {/* Left-justified, clickable feature index in a fixed gutter + bar area.
            A custom grid (not recharts) so labels read as a drillable list. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {drivers.map((d) => (
            <button key={d.feature} type="button"
              onClick={() => onDrill({ kind: "feature", feature: d.feature, impact: d.impact, modelKey: model, method, runId: data.run_id })}
              title={d.feature}
              aria-label={`Inspect feature ${d.feature}, impact ${d.impact.toFixed(4)}`}
              style={{ all: "unset", cursor: "pointer", display: "grid",
                gridTemplateColumns: "220px 1fr auto", alignItems: "center", gap: 10,
                padding: "3px 6px", borderRadius: 6 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(63,177,232,0.07)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, textAlign: "left",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.feature}
              </span>
              <span style={{ display: "block", height: 12, background: C.panelHi, borderRadius: 3, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${(d.impact / maxImpact) * 100}%`, background: C.cyan, borderRadius: 3 }} />
              </span>
              <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, minWidth: 48, textAlign: "right" }}>
                {d.impact.toFixed(3)}
              </span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <Tag color={C.faint}>MLflow run {data.run_id.slice(0, 12)}…</Tag>
        </div>
      </Panel>
    </div>
  );
}

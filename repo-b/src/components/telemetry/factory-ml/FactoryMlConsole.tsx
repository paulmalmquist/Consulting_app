"use client";

// Factory ML — flight-readiness console fed by the committed medallion
// exports. Five sections over the gold tables + the live MLflow run, with a
// provenance footer pinning every number to a seed build sha and run id.

import { useState } from "react";
import { C, EmptyState, Loading, Panel, Tag } from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import FeatureImportancePanel from "./FeatureImportancePanel";
import LayerHeatmap from "./LayerHeatmap";
import NcrPanel from "./NcrPanel";
import ReadinessGauge from "./ReadinessGauge";
import RegistryPanel from "./RegistryPanel";
import { useFactoryMlData } from "@/lib/lab/factoryMlData";

const SECTIONS = [
  { id: "readiness", label: "Readiness" },
  { id: "heatmap", label: "Layer Heatmap" },
  { id: "model", label: "Model Quality" },
  { id: "registry", label: "Registry" },
  { id: "ncr", label: "NCR Intelligence" },
] as const;

export default function FactoryMlConsole() {
  const { data, loading, missing } = useFactoryMlData();
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("readiness");

  if (loading) return <Loading label="Loading medallion exports…" />;

  const exported = missing.length < 6;

  return (
    <div>
      <TelemetryPageHeader
        variant="standard"
        eyebrow="Factory ML"
        title="Flight-readiness analytics"
        description="Databricks medallion over the deterministic factory seed: bronze landings reconciled to the build manifest, window features along the layer axis, a gold feature store joined to QMS outcomes, and XGBoost models tracked in MLflow. Served as committed exports — every number is reviewable."
        actions={data.metadata && (
          <Tag color={C.cyan}>build {data.metadata.seed_build_sha.slice(0, 10)}</Tag>
        )}
      />

      {!exported ? (
        <EmptyState label="No medallion exports yet"
          hint="Run skills/rs-factory-ml/run_pipeline.py to load, train, and export. The page reads /labs/factory-ml/*.json committed by the export step." />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" onClick={() => setSection(s.id)}
                style={{ fontFamily: C.mono, fontSize: 11, padding: "7px 14px", borderRadius: 7,
                  cursor: "pointer", color: s.id === section ? C.text : C.dim,
                  background: s.id === section ? "rgba(63,177,232,0.12)" : C.panel,
                  border: `1px solid ${s.id === section ? C.cyan + "66" : C.border}` }}>
                {s.label}
              </button>
            ))}
          </div>

          {section === "readiness" && (data.readiness
            ? <ReadinessGauge data={data.readiness} />
            : <EmptyState label="readiness.json missing" hint="Re-run the export stage." />)}
          {section === "heatmap" && (data.heatmap
            ? <LayerHeatmap data={data.heatmap} />
            : <EmptyState label="layer_heatmap.json missing" hint="Re-run the export stage." />)}
          {section === "model" && (data.importance
            ? <FeatureImportancePanel data={data.importance} />
            : <EmptyState label="feature_importance.json missing" hint="Run the training stage first." />)}
          {section === "registry" && (data.registry
            ? <RegistryPanel data={data.registry} />
            : <EmptyState label="model_registry.json missing" hint="Re-run the export stage." />)}
          {section === "ncr" && (data.ncr
            ? <NcrPanel data={data.ncr} />
            : <EmptyState label="ncr_clusters.json missing" hint="Re-run the export stage." />)}

          {data.metadata && (
            <Panel pad={12} style={{ marginTop: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, lineHeight: 1.8 }}>
                Provenance — MLflow run {data.metadata.mlflow_run_id} · experiment {data.metadata.mlflow_experiment}
                {" "}· schema {data.metadata.schema} · seed build {data.metadata.seed_build_sha.slice(0, 16)}…
                {" "}· rows: {Object.entries(data.metadata.row_counts)
                  .map(([t, n]) => `${t.replace(/^(bronze_|gold_|silver_)/, "")} ${n.toLocaleString()}`)
                  .join(" · ")}
                <br />{data.metadata.target_note}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

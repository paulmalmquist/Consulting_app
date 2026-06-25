"use client";

// Model registry: the seed's governed registry (champion/challenger versions
// with eval metrics — adapted from the rs_jsx ModelRegistryConsole draft) plus
// the live MLflow run this pipeline actually produced. Every version row, the
// champion badge, and the live run id drill into the evidence drawer.

import { C, Panel, Tag } from "../primitives";
import type { DrillObject } from "./factoryDrill";
import type { RegistryExport, RegistryModel, RegistryVersion } from "@/lib/lab/factoryMlData";

function VersionRow({ model, v, onDrill }: {
  model: RegistryModel;
  v: RegistryVersion;
  onDrill: (d: DrillObject) => void;
}) {
  const stageColor = v.is_champion ? C.green : v.stage === "challenger" ? C.amber : C.faint;
  return (
    <button type="button"
      onClick={() => onDrill({ kind: "model_version", model, version: v })}
      aria-label={`Inspect ${model.model_key} v${v.version}`}
      style={{ all: "unset", cursor: "pointer", display: "flex", gap: 12, alignItems: "baseline",
        padding: "7px 4px", borderBottom: `1px solid ${C.border}`, width: "100%", boxSizing: "border-box" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(63,177,232,0.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text, width: 36 }}>v{v.version}</span>
      <Tag color={stageColor}>{v.is_champion ? "champion" : v.stage}</Tag>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan }}>
        {v.primary_metric} {v.primary_metric_value.toFixed(3)}
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
        {v.training_rows.toLocaleString()} rows
      </span>
      {v.model_card_summary && (
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {v.model_card_summary}
        </span>
      )}
    </button>
  );
}

export default function RegistryPanel({ data, onDrill }: {
  data: RegistryExport;
  onDrill: (d: DrillObject) => void;
}) {
  const live = data.live_mlflow_run;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Live MLflow run — this pipeline" pad={14}
        right={<Tag color={C.green}>trained now</Tag>}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 2 }}>
          <div>run{" "}
            <button type="button"
              onClick={() => onDrill({ kind: "mlflow_run", runId: live.run_id, experiment: live.experiment, registeredModels: live.registered_models, headlineMetrics: live.headline_metrics })}
              aria-label="Inspect live MLflow run"
              style={{ all: "unset", cursor: "pointer", color: C.cyan, textDecoration: "underline", textUnderlineOffset: 2 }}>
              {live.run_id}
            </button>
          </div>
          <div>experiment <span style={{ color: C.text }}>{live.experiment}</span></div>
          <div>registered {live.registered_models.map((m) => (
            <Tag key={m} color={C.cyan}>{m.split(".").pop()}</Tag>
          ))}</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
            {Object.entries(live.headline_metrics).slice(0, 6).map(([k, v]) => (
              <span key={k}>
                <span style={{ color: C.faint }}>{k.replace("mean_", "")}</span>{" "}
                <span style={{ color: C.green }}>{v.toFixed(3)}</span>
              </span>
            ))}
          </div>
        </div>
      </Panel>

      {data.seed_registry.map((model) => (
        <Panel key={model.model_key} title={model.model_key} pad={14}
          right={model.champion
            ? <button type="button"
                onClick={() => onDrill({ kind: "model_version", model, version: model.champion! })}
                aria-label={`Inspect champion v${model.champion.version}`}
                style={{ all: "unset", cursor: "pointer" }}>
                <Tag color={C.green}>champion v{model.champion.version}</Tag>
              </button>
            : <Tag color={C.faint}>no champion</Tag>}>
          {[...model.versions].sort((a, b) => b.version - a.version).map((v) => (
            <VersionRow key={v.version} model={model} v={v} onDrill={onDrill} />
          ))}
        </Panel>
      ))}
    </div>
  );
}

"use client";

// Model registry: the seed's governed registry (champion/challenger versions
// with eval metrics — adapted from the rs_jsx ModelRegistryConsole draft) plus
// the live MLflow run this pipeline actually produced.

import { C, Panel, Tag } from "../primitives";
import type { RegistryExport, RegistryVersion } from "@/lib/lab/factoryMlData";

function VersionRow({ v }: { v: RegistryVersion }) {
  const stageColor = v.is_champion ? C.green : v.stage === "challenger" ? C.amber : C.faint;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "7px 0",
      borderBottom: `1px solid ${C.border}` }}>
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
    </div>
  );
}

export default function RegistryPanel({ data }: { data: RegistryExport }) {
  const live = data.live_mlflow_run;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Live MLflow run — this pipeline" pad={14}
        right={<Tag color={C.green}>trained now</Tag>}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 2 }}>
          <div>run <span style={{ color: C.text }}>{live.run_id}</span></div>
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
            ? <Tag color={C.green}>champion v{model.champion.version}</Tag>
            : <Tag color={C.faint}>no champion</Tag>}>
          {[...model.versions].sort((a, b) => b.version - a.version).map((v) => (
            <VersionRow key={v.version} v={v} />
          ))}
        </Panel>
      ))}
    </div>
  );
}

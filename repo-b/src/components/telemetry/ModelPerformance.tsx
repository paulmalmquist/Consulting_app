"use client";

import { useEffect, useState } from "react";
import {
  getModelPerformance, type ModelRun, TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { C, Tag, Panel, Loading, ErrorState, DisclosureFooter, ScrollTable } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";

function metric(m: ModelRun, k: string): string {
  const v = (m.metrics || {})[k];
  return v == null ? "—" : Number(v).toFixed(k === "rmse" || k === "phm" ? 2 : 4);
}

function StatusTag({ m }: { m: ModelRun }) {
  return m.model_alias === "champion" || m.promotion_state === "promoted"
    ? <Tag color={C.green}>promoted</Tag>
    : <Tag color={C.faint}>{m.promotion_state}</Tag>;
}

function Table({ title, cols, rows }: { title: string; cols: string[]; rows: ModelRun[] }) {
  const isRul = rows[0]?.model_kind === "rul";
  const grid = "1.4fr 0.8fr 0.8fr 0.9fr 0.9fr";
  return (
    <Panel title={title}>
      <ScrollTable minWidth={560}>
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, fontFamily: C.mono, fontSize: 10,
          color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", paddingBottom: 8 }}>
          {cols.map((c) => <span key={c}>{c}</span>)}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {rows.map((m) => (
            <div key={`${m.model_name}-${m.model_version}`} style={{ display: "grid", gridTemplateColumns: grid, gap: 8,
              alignItems: "center", fontFamily: C.mono, fontSize: 12, color: C.text, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
              <span>{m.model_name}</span>
              <span style={{ fontWeight: 600 }}>{isRul ? metric(m, "rmse") : metric(m, "precision")}</span>
              <span style={{ color: C.dim }}>{isRul ? metric(m, "phm") : metric(m, "recall")}</span>
              <span style={{ color: isRul ? C.dim : C.text, fontWeight: isRul ? 400 : 600 }}>{isRul ? "" : metric(m, "f1")}</span>
              <span><StatusTag m={m} /></span>
            </div>
          ))}
        </div>
      </ScrollTable>
    </Panel>
  );
}

function HonestStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: tone || C.text }}>{value}</span>
    </div>
  );
}

// Renders ONLY when the champion row carries the honest keys (Stage 0 jsonb merge). Absent → null,
// so older registry rows / other environments are unaffected.
function HonestMetrics({ rows }: { rows: ModelRun[] }) {
  const champ = rows.find((m) => (m.metrics || {}).f1_pointwise != null);
  if (!champ) return null;
  const note = String((champ.metrics || {}).honest_metrics_note || "");
  return (
    <Panel title="Honest metrics — same frozen champion, no point adjustment">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16, padding: "4px 0 12px" }}>
        <HonestStat label="F1 (point-adjusted — legacy)" value={metric(champ, "f1")} tone={C.dim} />
        <HonestStat label="F1 (point-wise — honest)" value={metric(champ, "f1_pointwise")} tone={C.text} />
        <HonestStat label="Precision (point-wise)" value={metric(champ, "precision_pointwise")} />
        <HonestStat label="Recall (point-wise)" value={metric(champ, "recall_pointwise")} />
        <HonestStat label="Event recall" value={metric(champ, "event_recall")} tone={C.green} />
        <HonestStat label="Alarm precision" value={metric(champ, "alarm_precision")} />
      </div>
      {note && (
        <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6, display: "block",
          borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          {note}
        </span>
      )}
    </Panel>
  );
}

export default function ModelPerformance() {
  const [models, setModels] = useState<ModelRun[] | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getModelPerformance(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then((d) => { setModels(d.models); setNullReason(d.null_reason); })
      .catch((e) => setError(String(e)));
  }, []);

  const heading = <TelemetryPageHeader variant="standard" eyebrow="Model Performance" title="Champions, metrics, and promotion gates"
    description="Exact metrics from the registry-backed serving API, no hardcoded numbers. Baseline vs stronger model side by side, with the promotion decision shown honestly." />;
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!models) return <>{heading}<Loading label="Loading model metrics…" /></>;
  if (nullReason) return <>{heading}<ErrorState message={nullReason} /></>;

  const anomaly = models.filter((m) => m.model_kind === "anomaly");
  const rul = models.filter((m) => m.model_kind === "rul");

  return (
    <>
      {heading}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Table title="Anomaly detection — SMAP/MSL (legacy baseline · point-adjusted, labeled test split)"
          cols={["Model", "Precision", "Recall", "F1 (legacy)", "Status"]} rows={anomaly} />
        <HonestMetrics rows={anomaly} />
        <Table title="Remaining useful life — C-MAPSS FD001 (100 test units)"
          cols={["Model", "RMSE", "PHM", "", "Status"]} rows={rul} />
        <Panel pad={14}>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
            Gates declared before training: anomaly F1 ≥ 0.30, RUL RMSE ≤ 25. Values fetched live from the
            registry-backed serving API (tel_model_runs). The simpler MAD baseline beat the PCA model on F1,
            so it was promoted, recorded honestly rather than forcing a fancier model to win.
          </span>
        </Panel>
      </div>
      <DisclosureFooter />
    </>
  );
}

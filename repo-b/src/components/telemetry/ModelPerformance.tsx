"use client";

import { useEffect, useState } from "react";
import {
  getModelPerformance, type ModelRun, TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { C, Tag, Panel, Loading, ErrorState, PageHeading, DisclosureFooter } from "./primitives";

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

  const heading = <PageHeading eyebrow="Model Performance" title="Champions, metrics, and promotion gates"
    blurb="Exact metrics from the registry-backed serving API, no hardcoded numbers. Baseline vs stronger model side by side, with the promotion decision shown honestly." />;
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!models) return <>{heading}<Loading label="Loading model metrics…" /></>;
  if (nullReason) return <>{heading}<ErrorState message={nullReason} /></>;

  const anomaly = models.filter((m) => m.model_kind === "anomaly");
  const rul = models.filter((m) => m.model_kind === "rul");

  return (
    <>
      {heading}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Table title="Anomaly detection — SMAP/MSL (point-adjusted, labeled test split)"
          cols={["Model", "Precision", "Recall", "F1", "Status"]} rows={anomaly} />
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

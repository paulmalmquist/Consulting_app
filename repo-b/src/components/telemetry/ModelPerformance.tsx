"use client";

import { useEffect, useState } from "react";
import {
  getModelPerformance, type ModelRun, TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { C, Tag, Panel, Loading, ErrorState, DisclosureFooter, ScrollTable, SectionTabButton, TelemetryActionButton } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import { MetricInspectorDrawer } from "./drawerPrimitives";
import { SourceRowsTable, DatabricksRunLink, ModelArtifactLink, exportXlsxUrl } from "./drill";
import { MlProvenanceDrawer, MAD_FROZEN, type MlProvenanceSelection } from "./drill";
import { ThresholdSweepTab } from "./workbench/ThresholdSweepTab";
import { FpFnReviewDrawer, type ErrorCase } from "./workbench/FpFnReviewDrawer";

// Columns surfaced when drilling into the model rows. Mirrors the server XLSX export
// (telemetry_export.py "model_runs") so the CSV preview and the .xlsx match.
const MODEL_ROW_COLS = [
  "model_name", "model_kind", "model_version", "model_alias",
  "promotion_state", "mlflow_run_id", "metrics", "gate",
];

function metric(m: ModelRun, k: string): string {
  const v = (m.metrics || {})[k];
  return v == null ? "—" : Number(v).toFixed(k === "rmse" || k === "phm" ? 2 : 4);
}

// Champion = promoted alias; everything else is a challenger/alternative shown by its registry state
// so the role is explicit, not just "promoted".
function StatusTag({ m }: { m: ModelRun }) {
  return m.model_alias === "champion" || m.promotion_state === "promoted"
    ? <Tag color={C.green}>champion</Tag>
    : <Tag color={C.faint}>challenger · {m.promotion_state}</Tag>;
}

function Table({ title, cols, rows, note }: { title: string; cols: string[]; rows: ModelRun[]; note?: string }) {
  const isRul = rows[0]?.model_kind === "rul";
  const grid = "1.4fr 0.8fr 0.8fr 0.9fr 0.9fr";
  return (
    <Panel title={title}>
      {note && (
        <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>{note}</div>
      )}
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
  const [drillOpen, setDrillOpen] = useState(false);
  const [tab, setTab] = useState<"metrics" | "sweep">("metrics");
  const [fpfnOpen, setFpfnOpen] = useState(false);
  const [provSel, setProvSel] = useState<MlProvenanceSelection | null>(null);
  const [provOpen, setProvOpen] = useState(false);

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
  const champ = anomaly.find((m) => m.model_alias === "champion" || m.promotion_state === "promoted");

  // Build the continuous-drill selection from a failure case + the frozen MAD rule. The exact feature
  // vector and the per-channel reconciliation caveat arrive with the GCP error_review receipt (S9);
  // until then the drill shows the rule, the run, and the case facts honestly.
  function drillCase(c: ErrorCase) {
    setProvSel({
      title: `Failure case ${c.id} — ${c.kind}`,
      signal: [
        { label: "Case", value: c.kind },
        { label: "Channel", value: c.channel ?? "—" },
        { label: "Window", value: c.window ?? "—" },
        { label: "True label", value: c.true_label ?? "—" },
      ],
      featureVector: null,
      math: [
        { label: "Rule", value: "MAD: residual = |value − rmean| > k · scale" },
        { label: "MAD_K", value: MAD_FROZEN.mad_k },
        { label: "Detector threshold", value: MAD_FROZEN.detector_threshold.toFixed(4) },
        { label: "Feature pushed", value: c.feature_pushed ?? "—" },
      ],
      reconciliationCaveat: null,
      mlflowRunId: champ?.mlflow_run_id ?? null,
      modelName: champ?.model_name ?? null,
      gate: [
        { label: "Operationally", value: c.acceptable ?? "—" },
        { label: "Might fix it", value: c.suggested_fix ?? "—" },
      ],
    });
    setProvOpen(true);
  }

  return (
    <>
      {heading}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <SectionTabButton active={tab === "metrics"} onClick={() => setTab("metrics")}>Metrics</SectionTabButton>
        <SectionTabButton active={tab === "sweep"} onClick={() => setTab("sweep")}>Threshold sweep</SectionTabButton>
      </div>
      {tab === "sweep" ? <ThresholdSweepTab /> : (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Tag color={C.green}>live rows</Tag>
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
            tel_model_runs · metrics + promotion gate logged per run · champion vs challenger below
          </span>
        </div>
        <Table title="Anomaly detection — SMAP/MSL (legacy baseline · point-adjusted, labeled test split)"
          cols={["Model", "Precision", "Recall", "F1 (legacy)", "Role"]} rows={anomaly}
          note="Operational use: scores each window; a NO-GO verdict routes the print for review. The promoted champion is the rolling-MAD detector." />
        <HonestMetrics rows={anomaly} />
        <Table title="Remaining useful life — C-MAPSS FD001 (100 test units)"
          cols={["Model", "RMSE", "PHM", "", "Role"]} rows={rul}
          note="Operational use: estimates remaining useful life; the go/no-go gate clears on the conformal lower bound (see RUL Calibration)." />
        <Panel pad={14}>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
            Gates declared before training: anomaly F1 ≥ 0.30, RUL RMSE ≤ 25. Values fetched live from the
            registry-backed serving API (tel_model_runs). The simpler MAD baseline beat the PCA model on F1,
            so it was promoted, recorded honestly rather than forcing a fancier model to win.
          </span>
        </Panel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TelemetryActionButton variant="secondary" onClick={() => setDrillOpen(true)}
            aria-label="Inspect the model rows and export">
            Source rows + export ›
          </TelemetryActionButton>
          <TelemetryActionButton variant="secondary" onClick={() => setFpfnOpen(true)}
            aria-label="Open the false-positive / false-negative review">
            Failure review ›
          </TelemetryActionButton>
        </div>
      </div>
      )}
      <MetricInspectorDrawer
        open={drillOpen}
        onClose={() => setDrillOpen(false)}
        title="Model runs — source rows"
        description="The rows behind these metrics, straight from the registry-backed serving API. Export reflects this exact set."
        fields={[
          { label: "Source", value: "tel_model_runs" },
          { label: "Scope", value: `env ${TELEMETRY_DEMO_ENV_ID}` },
          { label: "Models", value: models.length },
        ]}
      >
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <SourceRowsTable
            kind="live-rows"
            columns={MODEL_ROW_COLS}
            rows={models as unknown as Array<Record<string, unknown>>}
            sourceLabel="tel_model_runs"
            filterContext="all model kinds"
            exportName="telemetry_model_runs"
            xlsxUrl={exportXlsxUrl("model_runs", {
              envId: TELEMETRY_DEMO_ENV_ID,
              businessId: TELEMETRY_DEMO_BUSINESS_ID,
            })}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
              Runs &amp; artifacts (per model) — MLflow link where a run id is logged; UC model link fails closed for seed registry names
            </span>
            {models.map((m) => (
              <div key={`${m.model_name}-${m.model_version}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text, minWidth: 170 }}>
                  {m.model_name} <span style={{ color: C.faint }}>v{m.model_version}</span>
                </span>
                <DatabricksRunLink runId={m.mlflow_run_id} />
                <ModelArtifactLink modelName={m.model_name} />
              </div>
            ))}
          </div>
        </div>
      </MetricInspectorDrawer>
      <FpFnReviewDrawer open={fpfnOpen} onClose={() => setFpfnOpen(false)} onDrill={drillCase} />
      <MlProvenanceDrawer open={provOpen} onClose={() => setProvOpen(false)} selection={provSel} />
      <DisclosureFooter />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  getModelPerformance, getMonitoring,
  type ModelRun, type MonitoringResponse,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  C, Tag, Panel, Loading, ErrorState, EmptyState, PageHeading, DisclosureFooter,
  MetricRow, Stat,
} from "./primitives";

// Format a registry metric, only ever from a present numeric value. Absent → "—" (never a fake 0).
function fmt(metrics: Record<string, number> | undefined, k: string, dp = 4): string {
  const v = (metrics || {})[k];
  return v == null ? "—" : Number(v).toFixed(dp);
}

function has(metrics: Record<string, number> | undefined, k: string): boolean {
  return (metrics || {})[k] != null;
}

// PSI drift band — fail-closed: a null PSI reads as "not computed", never "stable".
function psiBand(psi: number | null): { label: string; color: string } {
  if (psi == null) return { label: "not computed", color: C.faint };
  if (psi < 0.1) return { label: "stable", color: C.green };
  if (psi <= 0.25) return { label: "watch", color: C.amber };
  return { label: "drift", color: C.red };
}

// Metrics block for one model, branching on kind. Anomaly shows the honest point-wise F1 AND, when
// present, the point-adjusted benchmark F1 — both clearly labeled so neither is read as the other.
function MetricsBlock({ m }: { m: ModelRun }) {
  const mx = m.metrics;
  if (m.model_kind === "rul") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16 }}>
        <Stat label="RMSE (cycles)" value={fmt(mx, "rmse", 2)} />
        <Stat label="PHM score" value={fmt(mx, "phm", 2)} />
      </div>
    );
  }
  const honestF1 = has(mx, "f1_pointwise");
  const adjF1 = has(mx, "f1");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
      {honestF1 && <Stat label="F1 (honest pointwise)" value={fmt(mx, "f1_pointwise")} tone={C.text} />}
      {adjF1 && <Stat label="F1 (point-adjusted, benchmark)" value={fmt(mx, "f1")} tone={C.dim} />}
      {has(mx, "event_recall") && <Stat label="Event recall" value={fmt(mx, "event_recall")} tone={C.green} />}
      {has(mx, "alarm_precision") && <Stat label="Alarm precision" value={fmt(mx, "alarm_precision")} />}
    </div>
  );
}

// One model's complete evidence card. Only renders fields that the registry row actually carries.
function ModelCard({ m, psi }: { m: ModelRun; psi: number | null }) {
  const band = psiBand(psi);
  const gateEntries = Object.entries(m.gate || {});
  return (
    <Panel
      title={`${m.model_kind === "rul" ? "Remaining useful life" : "Anomaly detection"} — ${m.model_name}`}
      right={<Tag color={m.promotion_state === "promoted" || m.model_alias === "champion" ? C.green : C.faint}>{m.promotion_state}</Tag>}
    >
      <MetricRow label="Model version" value={`v${m.model_version}${m.model_alias ? ` (${m.model_alias})` : ""}`} />
      <MetricRow label="MLflow run" value={m.mlflow_run_id || "—"} />

      <div style={{ marginTop: 16, marginBottom: 4 }}>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>Metrics</span>
      </div>
      <div style={{ paddingTop: 8, paddingBottom: 12 }}>
        <MetricsBlock m={m} />
      </div>

      <div style={{ marginTop: 4, marginBottom: 4 }}>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>Promotion gate (declared before training)</span>
      </div>
      {gateEntries.length > 0 ? (
        gateEntries.map(([k, v]) => (
          <MetricRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
        ))
      ) : (
        <MetricRow label="gate" value="—" />
      )}

      <MetricRow label="Drift status (PSI)" value={psi != null ? `${psi.toFixed(2)} · ${band.label}` : band.label} tone={band.color} />

      <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6, display: "block",
        borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 12 }}>
        Validation: grouped-by-unit walk-forward; label-shuffle leakage control.
      </span>
    </Panel>
  );
}

export default function ModelEvidenceCard() {
  const [models, setModels] = useState<ModelRun[] | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [mon, setMon] = useState<MonitoringResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getModelPerformance(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
      getMonitoring(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
    ])
      .then(([perf, m]) => { setModels(perf.models); setNullReason(perf.null_reason); setMon(m); })
      .catch((e) => setError(String(e)));
  }, []);

  const heading = <PageHeading eyebrow="Model Evidence" title="Can you trust this model?"
    blurb="One card per promoted champion: exact registry metrics (honest pointwise F1 beside the point-adjusted benchmark), the promotion gate as declared, live drift, and the validation method. Every value is fetched — nothing is hardcoded, and an honestly missing field shows a dash." />;

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!models) return <>{heading}<Loading label="Loading model evidence…" /></>;
  if (nullReason) return <>{heading}<ErrorState message={nullReason} /></>;

  // Champion of each kind (promoted / alias=champion), else the kind's first row as the representative.
  const kinds = ["anomaly", "rul"];
  const cards: ModelRun[] = [];
  for (const kind of kinds) {
    const ofKind = models.filter((m) => m.model_kind === kind);
    if (ofKind.length === 0) continue;
    const champ = ofKind.find((m) => m.promotion_state === "promoted" || m.model_alias === "champion") || ofKind[0];
    cards.push(champ);
  }

  if (cards.length === 0) {
    return <>{heading}<EmptyState label="No promoted model to show" hint="model_not_promoted — the registry has no champion for this environment yet." /></>;
  }

  const psi = mon?.psi ?? null;

  return (
    <>
      {heading}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {cards.map((m) => <ModelCard key={`${m.model_name}-${m.model_version}`} m={m} psi={psi} />)}
      </div>
      <DisclosureFooter />
    </>
  );
}

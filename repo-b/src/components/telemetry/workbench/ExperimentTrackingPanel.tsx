"use client";

import { useEffect, useState } from "react";
import { getWorkbenchExperiments, type ReceiptEnvelope } from "@/lib/telemetry/api";
import { C, EmptyState, Loading, Tag } from "../primitives";
import { CloudRunLink } from "../drill";

const ACCENT = "#a855f7";

interface Run {
  run_id: string;
  model_kind?: string;
  feature_set?: string;
  metrics?: Record<string, number>;
  status?: string;
}
interface ExperimentsPayload {
  experiment_id?: string;
  runs?: Run[];
  hpo?: { status?: string; note?: string; best_run_id?: string | null; beat_honest_baseline?: boolean };
}

function fmt(v: number | undefined): string {
  return v == null ? "—" : Number(v).toFixed(4);
}

// Experiment tracking + HPO board. Reads the experiment_runs receipt produced by the Vertex Custom
// Training Job (S8) / Vizier (S10). Fail-closed until the first Vertex run lands; then shows the runs
// with a deep link to the Vertex Experiment run.
export function ExperimentTrackingPanel() {
  const [payload, setPayload] = useState<ExperimentsPayload | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getWorkbenchExperiments()
      .then((r: ReceiptEnvelope) => {
        setProvider(r.provider);
        setRunId(r.vertex_run_id);
        setExperimentId(r.vertex_experiment);
        setNullReason(r.null_reason);
        setPayload(r.payload as ExperimentsPayload | null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, []);

  if (error) return <EmptyState label="Experiment tracking unavailable" hint="The experiment_runs receipt could not be loaded." nullReason={error} />;
  if (!loaded) return <Loading label="Loading experiment runs…" />;
  const runs = payload?.runs ?? [];
  if (nullReason || runs.length === 0) {
    return (
      <EmptyState
        label="No experiment runs recorded yet"
        hint="The first Vertex Custom Training Job (S8) logs to the Vertex Experiment and exports experiment_runs; Vizier HPO (S10) adds the search."
        nullReason={nullReason}
      />
    );
  }
  const hpo = payload?.hpo;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Experiment tracking</span>
        <Tag color={provider === "vertex" ? C.green : C.amber}>{provider ?? "local_fixture"}</Tag>
        <CloudRunLink provider={provider} runId={runId} experimentId={experimentId} />
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.9fr 0.9fr 0.8fr", gap: 8, fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
          <span>Run</span><span>Feature set</span><span>F1 (pt)</span><span>Event recall</span><span>Status</span>
        </div>
        {runs.map((r) => (
          <div key={r.run_id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.9fr 0.9fr 0.8fr", gap: 8, alignItems: "center", fontFamily: C.mono, fontSize: 11.5, color: C.text, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <span>{r.run_id}</span>
            <span style={{ color: C.dim }}>{r.feature_set ?? "—"}</span>
            <span>{fmt(r.metrics?.f1_pointwise)}</span>
            <span>{fmt(r.metrics?.event_recall)}</span>
            <span><Tag color={C.green}>{(r.status ?? "done").replace(/^JobState\./, "")}</Tag></span>
          </div>
        ))}
      </div>
      {hpo && (
        <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
          HPO: {hpo.status === "not_run" ? "not run — Vizier search lands in S10" : `${hpo.status}${hpo.beat_honest_baseline === false ? " · best trial did not beat the honest MAD baseline" : ""}`}
          {hpo.note ? ` · ${hpo.note}` : ""}
        </span>
      )}
    </div>
  );
}

export default ExperimentTrackingPanel;

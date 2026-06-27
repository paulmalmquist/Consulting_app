"use client";

import { useEffect, useState } from "react";
import { getWorkbenchExperiments, type ReceiptEnvelope } from "@/lib/telemetry/api";
import { C, EmptyState, Loading, Tag, TelemetryActionButton } from "../primitives";
import { MetricInspectorDrawer } from "../drawerPrimitives";

// One replayed experiment receipt. Every field is committed by the GCP MLOps pipeline (Part II) — the
// button NEVER triggers live compute.
interface RunReceipt {
  run_id?: string;
  dataset?: string;
  feature_set?: string;
  training_window?: string;
  validation?: string;
  params?: string;
  result?: string;
  reason?: string;
  artifacts?: string[];
}
interface ExperimentsPayload { latest_run?: RunReceipt }

function Row({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: 10, fontFamily: C.mono, fontSize: 11.5, lineHeight: 1.6 }}>
      <span style={{ color: C.faint, minWidth: 120 }}>{k}</span>
      <span style={{ color: C.text }}>{v}</span>
    </div>
  );
}

function RunReceiptView({ run }: { run: RunReceipt }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Row k="Dataset" v={run.dataset} />
      <Row k="Feature set" v={run.feature_set} />
      <Row k="Training window" v={run.training_window} />
      <Row k="Validation" v={run.validation} />
      <Row k="Params" v={run.params} />
      <Row k="Result" v={run.result} />
      <Row k="Reason" v={run.reason} />
      {run.artifacts && run.artifacts.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Artifacts</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
            {run.artifacts.map((a) => <Tag key={a} color={C.dim}>{a}</Tag>)}
          </div>
        </div>
      )}
    </div>
  );
}

// The honest "run" button — labeled Replay, never "Train model live". Opens the latest committed
// experiment receipt; fails closed when none has been generated yet.
export function ExperimentReplayButton() {
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<RunReceipt | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    getWorkbenchExperiments()
      .then((r: ReceiptEnvelope) => {
        setProvider(r.provider);
        setNullReason(r.null_reason);
        setRun((r.payload as ExperimentsPayload | null)?.latest_run ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  const fields = [
    { label: "Mode", value: "replay — no live compute triggered" },
    { label: "Provider", value: provider ?? "—" },
    { label: "Run ID", value: run?.run_id ?? "—" },
  ];

  return (
    <>
      <TelemetryActionButton variant="primary" onClick={() => setOpen(true)} aria-label="Replay experiment receipt">
        Replay experiment receipt
      </TelemetryActionButton>
      <MetricInspectorDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Replay experiment receipt — no live compute triggered"
        description="The Workbench replays a committed receipt produced offline by the GCP MLOps pipeline. Clicking this never starts a training job."
        fields={fields}
      >
        <div style={{ marginTop: 14 }}>
          {error && <EmptyState label="Receipt unavailable" hint="The experiment_runs receipt could not be loaded." nullReason={error} />}
          {!error && !loaded && <Loading label="Opening receipt…" />}
          {!error && loaded && (nullReason || !run) && (
            <EmptyState
              label="No experiment receipt to replay yet"
              hint="The first experiment run is produced offline by the GCP MLOps pipeline (Part II) and committed verbatim."
              nullReason={nullReason}
            />
          )}
          {!error && loaded && !nullReason && run && <RunReceiptView run={run} />}
        </div>
      </MetricInspectorDrawer>
    </>
  );
}

export default ExperimentReplayButton;

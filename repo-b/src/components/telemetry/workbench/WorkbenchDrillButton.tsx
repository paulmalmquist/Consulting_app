"use client";

import { useState } from "react";
import { getReplayFeed, type ReplayFeed, type ReplayTick } from "@/lib/telemetry/api";
import { TelemetryActionButton } from "../primitives";
import { MAD_FROZEN, MlProvenanceDrawer, type MlProvenanceSelection } from "../drill";

function residual(t: ReplayTick): number {
  return Math.abs(t.value - t.rmean);
}

// Build the continuous drill selection from a real replay anomaly. The reconciliation caveat is the
// backend's honest per_channel_caveat (for D-4 the global-scale serving threshold does NOT reproduce the
// champion's firing — surfaced, not hidden). Nothing is fabricated: every field comes from the committed
// replay fixture + the frozen serving constants.
function selectionFromReplay(feed: ReplayFeed): MlProvenanceSelection | null {
  const fired = feed.feed.find((t) => t.model_pred === 1) ?? null;
  const anchor = fired ?? feed.feed[Math.floor(feed.feed.length / 2)] ?? null;
  if (!anchor) return null;
  const idx = feed.feed.indexOf(anchor);
  const window = feed.feed.slice(Math.max(0, idx - 3), idx + 1).map((t) => ({
    t: t.t,
    value: Number(t.value.toFixed(4)),
    rmean: Number(t.rmean.toFixed(4)),
    residual: Number(residual(t).toFixed(4)),
    model_pred: t.model_pred,
    is_anomaly: t.is_anomaly,
  }));
  const diag = feed.scoringDiagnostics ?? null;
  const r = residual(anchor);
  const threshold = diag?.threshold_residual_units ?? MAD_FROZEN.detector_threshold;
  return {
    title: `Replay anomaly — ${feed.channel} @ t=${anchor.t}`,
    signal: [
      { label: "Verdict", value: anchor.model_pred === 1 ? "NO_GO (model_pred=1)" : "GO" },
      { label: "Channel", value: feed.channel },
      { label: "Tick", value: anchor.t },
      { label: "Residual", value: r.toFixed(4) },
      { label: "Threshold", value: threshold.toFixed(4) },
    ],
    featureVector: {
      columns: ["t", "value", "rmean", "residual", "model_pred", "is_anomaly"],
      rows: window,
      sourceLabel: feed.provenance?.source_table ?? "gold_replay_feed",
    },
    math: [
      { label: "Rule", value: "MAD: residual = |value − rmean| > k · scale" },
      { label: "MAD_K", value: MAD_FROZEN.mad_k },
      { label: "Global train scale", value: MAD_FROZEN.global_train_scale.toFixed(6) },
      { label: "Detector threshold", value: threshold.toFixed(4) },
      { label: "This tick", value: `residual ${r.toFixed(4)} ${r > threshold ? ">" : "≤"} threshold` },
    ],
    reconciliationCaveat: diag?.per_channel_caveat ?? null,
    mlflowRunId: feed.provenance?.champion_mlflow_run_id ?? null,
    modelName: feed.provenance?.champion_model ?? null,
    gate: [{ label: "Promotion gate", value: "anomaly honest gate — see Model Registry" }],
    deltaTable: feed.provenance?.source_table ?? null,
  };
}

// "Drill a live replay anomaly" — opens the continuous provenance drill on a real committed replay
// anomaly, including the honest scoring-reconciliation caveat. This is the demo's anti-black-box moment.
export function WorkbenchDrillButton() {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<MlProvenanceSelection | null>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const feed = await getReplayFeed();
      setSelection(selectionFromReplay(feed));
    } catch {
      setSelection(null);
    } finally {
      setBusy(false);
      setOpen(true);
    }
  }

  return (
    <>
      <TelemetryActionButton variant="secondary" onClick={onClick} disabled={busy}
        aria-label="Drill a live replay anomaly">
        {busy ? "Loading…" : "Drill a replay anomaly ›"}
      </TelemetryActionButton>
      <MlProvenanceDrawer open={open} onClose={() => setOpen(false)} selection={selection} />
    </>
  );
}

export default WorkbenchDrillButton;

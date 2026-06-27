"use client";

import { useEffect, useState } from "react";
import {
  getWorkbenchDrift, getWorkbenchEmbedding, getWorkbenchFactoryShap, getWorkbenchParity,
  type ReceiptEnvelope,
} from "@/lib/telemetry/api";
import { C, EmptyState, Loading, Tag } from "../primitives";

const ACCENT = "#a855f7";

// Parity panel — REAL today (S7). Shows the GCP-side reproduction of the deployed champion (Δ=0),
// the migration's honesty anchor.
export function ParityPanel() {
  const [p, setP] = useState<ReceiptEnvelope | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getWorkbenchParity().then(setP).catch((e) => setErr(String(e))).finally(() => setLoaded(true));
  }, []);
  if (err) return <EmptyState label="Parity unavailable" hint="The parity receipt could not be loaded." nullReason={err} />;
  if (!loaded) return <Loading label="Loading parity…" />;
  const pl = (p?.payload ?? null) as { match?: boolean; gcp_metrics?: Record<string, number>; champion_metrics?: Record<string, number>; deltas?: Record<string, number> } | null;
  if (!pl || p?.null_reason) return <EmptyState label="Parity not generated yet" hint="Run the BigQuery gold + parity pipeline (S7)." nullReason={p?.null_reason ?? null} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Parity</span>
        <Tag color={pl.match ? C.green : C.red}>{pl.match ? "reproduces champion (Δ=0)" : "mismatch"}</Tag>
        <span style={{ fontFamily: C.sans, fontSize: 12, color: C.dim }}>GCP-side rolling-MAD reproduces the deployed champion from public data — no Databricks.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr", gap: 8, fontFamily: C.mono, fontSize: 11, color: C.text }}>
        <span style={{ color: C.faint }}>metric</span><span style={{ color: C.faint }}>gcp</span><span style={{ color: C.faint }}>champion</span><span style={{ color: C.faint }}>Δ</span>
        {Object.keys(pl.champion_metrics ?? {}).map((k) => (
          <>
            <span key={`${k}-l`}>{k}</span>
            <span key={`${k}-g`}>{pl.gcp_metrics?.[k]?.toFixed(6) ?? "—"}</span>
            <span key={`${k}-c`} style={{ color: C.dim }}>{pl.champion_metrics?.[k]?.toFixed(6) ?? "—"}</span>
            <span key={`${k}-d`} style={{ color: (pl.deltas?.[k] ?? 0) === 0 ? C.green : C.amber }}>{(pl.deltas?.[k] ?? 0).toFixed(6)}</span>
          </>
        ))}
      </div>
    </div>
  );
}

// Generic fail-closed supporting panel for receipts that land later (drift S11, embedding S11, SHAP S11).
function PendingReceiptPanel({
  title, fetcher, pendingHint, caveat,
}: { title: string; fetcher: () => Promise<ReceiptEnvelope>; pendingHint: string; caveat?: string }) {
  const [r, setR] = useState<ReceiptEnvelope | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetcher().then(setR).catch((e) => setErr(String(e))).finally(() => setLoaded(true));
  }, [fetcher]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>{title}</span>
        {caveat && <Tag color={C.faint}>{caveat}</Tag>}
      </div>
      {err ? <EmptyState label={`${title} unavailable`} hint="Receipt could not be loaded." nullReason={err} />
        : !loaded ? <Loading label="Loading…" />
        : (r?.null_reason || !r?.payload)
          ? <EmptyState label={`${title} not generated yet`} hint={pendingHint} nullReason={r?.null_reason ?? null} />
          : <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>Receipt present (provider {r?.provider ?? "—"}).</span>}
    </div>
  );
}

export function DriftPanel() {
  return <PendingReceiptPanel title="Statistical drift" fetcher={getWorkbenchDrift}
    pendingHint="PSI / KS / Wasserstein per feature land with the GCP drift job (S11)." />;
}
export function EmbeddingPanel() {
  return <PendingReceiptPanel title="Latent projection" fetcher={getWorkbenchEmbedding}
    pendingHint="2-D PCA of the fused vectors + reconstruction error land with the GCP projection job (S11)."
    caveat="Diagnostic projection only — not a trust gate" />;
}
export function FactoryShapPanel() {
  return <PendingReceiptPanel title="Local SHAP (factory)" fetcher={getWorkbenchFactoryShap}
    pendingHint="Per-prediction SHAP for the factory tree models lands with the GCP SHAP job (S11)."
    caveat="Attribution, not SHAP, for the MAD rule" />;
}

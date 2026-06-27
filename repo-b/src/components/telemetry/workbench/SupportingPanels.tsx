"use client";

import { Fragment, useEffect, useState } from "react";
import {
  CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import {
  getWorkbenchDrift, getWorkbenchEmbedding, getWorkbenchFactoryShap, getWorkbenchParity,
  type ReceiptEnvelope,
} from "@/lib/telemetry/api";
import { C, EmptyState, Loading, Tag } from "../primitives";

const ACCENT = "#a855f7";

// ── Parity (REAL, S7) ──────────────────────────────────────────────────────────
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
          <Fragment key={k}>
            <span>{k}</span>
            <span>{pl.gcp_metrics?.[k]?.toFixed(6) ?? "—"}</span>
            <span style={{ color: C.dim }}>{pl.champion_metrics?.[k]?.toFixed(6) ?? "—"}</span>
            <span style={{ color: (pl.deltas?.[k] ?? 0) === 0 ? C.green : C.amber }}>{(pl.deltas?.[k] ?? 0).toFixed(6)}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Statistical drift (REAL, S11) ───────────────────────────────────────────────
interface DriftFeature { feature: string; psi: number; ks_stat: number; wasserstein: number; stability: string; drifted: boolean }
interface DriftPayload { features: DriftFeature[]; top_drifted_channels?: { channel: string; psi: number }[]; summary?: { n_features: number; n_drifted: number; max_psi: number } }
function stabColor(s: string): string { return s === "stable" ? C.green : s === "watch" ? C.amber : C.red; }

export function DriftPanel() {
  const [p, setP] = useState<ReceiptEnvelope | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getWorkbenchDrift().then(setP).catch((e) => setErr(String(e))).finally(() => setLoaded(true));
  }, []);
  if (err) return <EmptyState label="Statistical drift unavailable" hint="The drift receipt could not be loaded." nullReason={err} />;
  if (!loaded) return <Loading label="Loading drift…" />;
  const pl = (p?.payload ?? null) as DriftPayload | null;
  if (!pl || p?.null_reason) return <EmptyState label="Statistical drift not generated yet" hint="PSI / KS / Wasserstein per feature land with the GCP drift job (S11)." nullReason={p?.null_reason ?? null} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Statistical drift</span>
        <Tag color={p?.provider === "vertex" ? C.green : C.amber}>{p?.provider ?? "—"}</Tag>
        <span style={{ fontFamily: C.sans, fontSize: 12, color: C.dim }}>PSI · KS · Wasserstein — train reference vs test</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr 1fr 0.8fr", gap: 8, fontFamily: C.mono, fontSize: 11, color: C.text }}>
        <span style={{ color: C.faint }}>feature</span><span style={{ color: C.faint }}>PSI</span><span style={{ color: C.faint }}>KS</span><span style={{ color: C.faint }}>Wasserstein</span><span style={{ color: C.faint }}>status</span>
        {pl.features.map((f) => (
          <Fragment key={f.feature}>
            <span>{f.feature}</span>
            <span>{f.psi}</span>
            <span style={{ color: C.dim }}>{f.ks_stat}</span>
            <span style={{ color: C.dim }}>{f.wasserstein}</span>
            <span><Tag color={stabColor(f.stability)}>{f.stability}</Tag></span>
          </Fragment>
        ))}
      </div>
      {pl.top_drifted_channels && pl.top_drifted_channels.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>top drifted channels:</span>
          {pl.top_drifted_channels.slice(0, 6).map((c) => <Tag key={c.channel} color={C.amber}>{c.channel} · PSI {c.psi}</Tag>)}
        </div>
      )}
    </div>
  );
}

// ── Latent projection (REAL, S11) ───────────────────────────────────────────────
interface EmbPoint { x: number; y: number; label_any_anomaly: number; recon_error: number }
interface EmbPayload { explained_variance?: number[]; points: EmbPoint[]; non_goal_note?: string; alignment_note?: string }

export function EmbeddingPanel() {
  const [p, setP] = useState<ReceiptEnvelope | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getWorkbenchEmbedding().then(setP).catch((e) => setErr(String(e))).finally(() => setLoaded(true));
  }, []);
  if (err) return <EmptyState label="Latent projection unavailable" hint="The embedding receipt could not be loaded." nullReason={err} />;
  if (!loaded) return <Loading label="Loading projection…" />;
  const pl = (p?.payload ?? null) as EmbPayload | null;
  if (!pl || p?.null_reason) return <EmptyState label="Latent projection not generated yet" hint="2-D PCA of the fused vectors lands with the GCP projection job (S11)." nullReason={p?.null_reason ?? null} />;
  const nominal = pl.points.filter((pt) => pt.label_any_anomaly === 0);
  const anomalous = pl.points.filter((pt) => pt.label_any_anomaly === 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Latent projection</span>
        <Tag color={C.faint}>Diagnostic projection only — not a trust gate</Tag>
        {pl.explained_variance && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>explained var {pl.explained_variance.map((v) => v.toFixed(2)).join(" / ")}</span>}
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
        <ScatterChart width={420} height={240} margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
          <XAxis type="number" dataKey="x" stroke={C.faint} tick={{ fontSize: 9, fill: C.faint }} />
          <YAxis type="number" dataKey="y" stroke={C.faint} tick={{ fontSize: 9, fill: C.faint }} />
          <ZAxis range={[12, 12]} />
          <Tooltip contentStyle={{ background: C.panelHi, border: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 11 }} />
          <Scatter name="nominal" data={nominal} fill={C.dim} isAnimationActive={false} />
          <Scatter name="anomalous" data={anomalous} fill={C.red} isAnimationActive={false} />
        </ScatterChart>
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
        {pl.alignment_note} {pl.non_goal_note}
      </span>
    </div>
  );
}

// ── Local SHAP (fail-closed; factory tree models out of this migration's scope) ─
export function FactoryShapPanel() {
  const [r, setR] = useState<ReceiptEnvelope | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getWorkbenchFactoryShap().then(setR).catch((e) => setErr(String(e))).finally(() => setLoaded(true));
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Local SHAP (factory)</span>
        <Tag color={C.faint}>Attribution, not SHAP, for the MAD rule</Tag>
      </div>
      {err ? <EmptyState label="Local SHAP unavailable" hint="Receipt could not be loaded." nullReason={err} />
        : !loaded ? <Loading label="Loading…" />
        : (r?.null_reason || !r?.payload)
          ? <EmptyState label="Local SHAP not generated yet" hint="Per-prediction SHAP applies to the factory tree models, which are outside this Databricks→GCP migration's scope." nullReason={r?.null_reason ?? null} />
          : <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>Receipt present (provider {r?.provider ?? "—"}).</span>}
    </div>
  );
}

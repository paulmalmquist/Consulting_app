"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getWorkbenchThresholdSweep, type ReceiptEnvelope } from "@/lib/telemetry/api";
import { C, EmptyState, Loading, MetricCard, StatGrid, Tag } from "../primitives";

const ACCENT = "#a855f7";

interface SweepPoint {
  threshold: number;
  precision: number;
  recall: number;
  f1_pointwise?: number;
  tpr?: number;
  fpr?: number;
  tp?: number;
  fp?: number;
  fn?: number;
  tn?: number;
}
interface Confusion { tp: number; fp: number; fn: number; tn: number; }
interface OperatingPoint { mad_k: number; global_train_scale: number; detector_threshold: number; source: string; }
interface SweepPayload {
  operating_point: OperatingPoint;
  sweep: SweepPoint[];
  confusion_at_operating: Confusion | null;
  metric_basis?: string;
  sweep_pending?: boolean;
  note?: string;
}

function ConfusionGrid({ c }: { c: Confusion }) {
  const Cell = ({ label, n, tone }: { label: string; n: number; tone: string }) => (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700, color: tone }}>{n}</div>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <Cell label="True positives" n={c.tp} tone={C.green} />
      <Cell label="False positives" n={c.fp} tone={C.amber} />
      <Cell label="False negatives" n={c.fn} tone={C.red} />
      <Cell label="True negatives" n={c.tn} tone={C.dim} />
    </div>
  );
}

export function ThresholdSweepTab() {
  const [data, setData] = useState<SweepPayload | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkbenchThresholdSweep()
      .then((r: ReceiptEnvelope) => {
        setProvider(r.provider);
        setNullReason(r.null_reason);
        setData(r.payload as SweepPayload | null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <EmptyState label="Threshold sweep unavailable" hint="The threshold_sweep receipt could not be loaded." nullReason={error} />;
  if (!data && !nullReason) return <Loading label="Loading threshold sweep…" />;
  if (nullReason || !data) {
    return (
      <EmptyState
        label="Threshold sweep not generated yet"
        hint="The MAD_K sweep is computed over the BigQuery labeled SMAP/MSL test split in the GCP run (Part II.4)."
        nullReason={nullReason}
      />
    );
  }

  const op = data.operating_point;
  const sweep = data.sweep ?? [];
  const pending = Boolean(data.sweep_pending) || sweep.length === 0;
  // PR curve points; operating point marked from the confusion matrix when present.
  const pr = sweep.map((p) => ({ recall: p.recall, precision: p.precision }));
  const conf = data.confusion_at_operating;
  const opPr = conf && conf.tp + conf.fp > 0 && conf.tp + conf.fn > 0
    ? { recall: conf.tp / (conf.tp + conf.fn), precision: conf.tp / (conf.tp + conf.fp) }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Threshold sweep</span>
        <Tag color={provider === "vertex" ? C.green : C.amber}>{provider ?? "local_fixture"}</Tag>
        <span style={{ fontFamily: C.sans, fontSize: 12, color: C.dim }}>
          the honest threshold-selection story — a real sweep, not a single magic number
        </span>
      </div>

      <StatGrid cols={3}>
        <MetricCard label="MAD_K (operating)" value={op.mad_k} accent={C.text} />
        <MetricCard label="Detector threshold" value={op.detector_threshold.toFixed(4)} accent={C.green} sub="residual units · frozen serving" />
        <MetricCard label="Global train scale" value={op.global_train_scale.toFixed(6)} />
      </StatGrid>

      {pending ? (
        <EmptyState
          label="Full sweep pending"
          hint={data.note ?? "The operating point above is the real frozen serving threshold; the full MAD_K sweep (PR/ROC + confusion matrix) lands with the GCP run (Part II.4)."}
        />
      ) : (
        <>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Precision–recall across MAD_K · operating point marked
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={pr} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                <XAxis dataKey="recall" type="number" domain={[0, 1]} stroke={C.faint} tick={{ fontSize: 10, fill: C.faint }}
                  label={{ value: "recall", position: "insideBottom", offset: -8, fill: C.faint, fontSize: 10 }} />
                <YAxis type="number" domain={[0, 1]} stroke={C.faint} tick={{ fontSize: 10, fill: C.faint }}
                  label={{ value: "precision", angle: -90, position: "insideLeft", fill: C.faint, fontSize: 10 }} />
                <Tooltip contentStyle={{ background: C.panelHi, border: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 11 }} />
                <Line type="monotone" dataKey="precision" stroke={ACCENT} dot={false} strokeWidth={2} isAnimationActive={false} />
                {opPr && <ReferenceDot x={opPr.recall} y={opPr.precision} r={5} fill={C.green} stroke={C.bg} />}
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 6 }}>
              {data.metric_basis ?? "point-wise honest metrics"}
            </div>
          </div>

          {conf && (
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                Confusion at the operating threshold
              </div>
              <ConfusionGrid c={conf} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ThresholdSweepTab;

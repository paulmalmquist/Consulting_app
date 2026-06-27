"use client";

import { useEffect, useState } from "react";
import {
  getModelPerformance, getWorkbenchPromotionReview, type ModelRun, type ReceiptEnvelope,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { C, EmptyState, Loading, Tag } from "../primitives";

const ACCENT = "#a855f7";
const FONT_EDITORIAL = "var(--font-editorial), Georgia, serif";

// promotion_review payload (Part II.5). Optional — enriches the panel with the structured gate decision.
interface GateCheck { name: string; champion?: number | string; challenger?: number | string; verdict?: string; }
interface PromotionReviewPayload {
  champion?: string;
  challenger?: string;
  decision?: string;
  reason_rejected?: string;
  gates?: GateCheck[];
}

function metric(m: ModelRun, k: string): string {
  const v = (m.metrics || {})[k];
  return v == null ? "—" : Number(v).toFixed(4);
}

function ModelCard({ m, role }: { m: ModelRun; role: "champion" | "challenger" }) {
  const isChamp = role === "champion";
  return (
    <div style={{ background: C.panel, border: `1px solid ${isChamp ? ACCENT : C.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: C.mono, fontSize: 12.5, color: C.text }}>{m.model_name}</span>
        {isChamp ? <Tag color={C.green}>champion</Tag> : <Tag color={C.faint}>challenger</Tag>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
        {[
          ["Alarm precision", "alarm_precision"],
          ["Event recall", "event_recall"],
          ["F1 (point-wise)", "f1_pointwise"],
          ["Precision", "precision"],
        ].map(([label, key]) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
            <span style={{ fontFamily: C.mono, fontSize: 14, color: C.text }}>{metric(m, key)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GateTable({ review }: { review: PromotionReviewPayload }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.8fr", gap: 8, fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        <span>Gate</span><span>Champion</span><span>Challenger</span><span>Verdict</span>
      </div>
      {(review.gates ?? []).map((g) => (
        <div key={g.name} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.8fr", gap: 8, alignItems: "center", fontFamily: C.mono, fontSize: 11.5, color: C.text, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
          <span>{g.name}</span>
          <span>{g.champion ?? "—"}</span>
          <span style={{ color: C.dim }}>{g.challenger ?? "—"}</span>
          <span><Tag color={g.verdict === "pass" ? C.green : g.verdict === "fail" ? C.red : C.faint}>{g.verdict ?? "—"}</Tag></span>
        </div>
      ))}
      {review.reason_rejected && (
        <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginTop: 10 }}>
          <span style={{ color: C.faint, fontFamily: C.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Why not promoted — </span>
          {review.reason_rejected}
        </div>
      )}
    </div>
  );
}

// Champion review — the theatrical-but-honest story: PCA looked smarter, MAD operated better, MAD stayed
// champion. Champion/challenger facts come from the live registry (tel_model_runs). The gate-by-gate
// decision enriches the panel when the promotion_review receipt has landed (Part II.5).
export function ChampionReviewPanel() {
  const [models, setModels] = useState<ModelRun[] | null>(null);
  const [review, setReview] = useState<PromotionReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getModelPerformance(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then((d) => setModels(d.models))
      .catch((e) => setError(String(e)));
    getWorkbenchPromotionReview()
      .then((r: ReceiptEnvelope) => { if (!r.null_reason) setReview(r.payload as PromotionReviewPayload); })
      .catch(() => { /* receipt is optional enrichment */ });
  }, []);

  if (error) return <EmptyState label="Champion review unavailable" hint="The registry-backed model API could not be loaded." nullReason={error} />;
  if (!models) return <Loading label="Loading champion review…" />;

  const anomaly = models.filter((m) => m.model_kind === "anomaly");
  const champ = anomaly.find((m) => m.model_alias === "champion" || m.promotion_state === "promoted");
  const challenger = anomaly.find((m) => m !== champ);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", fontFamily: FONT_EDITORIAL, fontSize: 19, lineHeight: 1.4 }}>
        <span style={{ color: C.dim }}>PCA looked smarter.</span>
        <span style={{ color: C.text }}>MAD operated better.</span>
        <span style={{ color: ACCENT }}>MAD stayed champion.</span>
      </div>
      <span style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.6, maxWidth: 780 }}>
        The promotion gate cared about operational false alarms, not headline accuracy. A model can look
        sharper on one metric and still be rejected if it degrades alarm precision — that is the gate
        doing its job, recorded honestly rather than forcing a fancier model to win.
      </span>

      {champ && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <ModelCard m={champ} role="champion" />
          {challenger && <ModelCard m={challenger} role="challenger" />}
        </div>
      )}

      {review?.gates && review.gates.length > 0 ? (
        <GateTable review={review} />
      ) : (
        <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
          Live registry rows shown. The gate-by-gate promotion receipt (challenger improved X, failed Y)
          lands with the GCP run (Part II.5).
        </span>
      )}
    </div>
  );
}

export default ChampionReviewPanel;

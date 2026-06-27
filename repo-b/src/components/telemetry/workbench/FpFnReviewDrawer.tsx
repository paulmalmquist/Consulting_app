"use client";

import { useEffect, useState } from "react";
import { getWorkbenchErrorReview, type ReceiptEnvelope } from "@/lib/telemetry/api";
import { C, EmptyState, Loading, Tag, TelemetryActionButton } from "../primitives";
import { MetricInspectorDrawer } from "../drawerPrimitives";

const ACCENT = "#a855f7";

// One mis-/borderline case. `feature_pushed` = which feature most drove the (wrong) call; `acceptable`
// = the operational-consequence judgment; `suggested_fix` = the feature that might fix it. All fields
// come straight from the error_review receipt — no case is fabricated.
export interface ErrorCase {
  id: string;
  kind: "false_positive" | "false_negative" | "borderline";
  channel?: string;
  window?: string;
  model_saw?: string;
  true_label?: string;
  feature_pushed?: string;
  acceptable?: string;
  suggested_fix?: string;
}
interface ErrorReviewPayload {
  cases: ErrorCase[];
  highlights?: { label: string; value: string }[];
  note?: string;
}

const KIND_LABEL: Record<ErrorCase["kind"], string> = {
  false_positive: "False positive",
  false_negative: "False negative",
  borderline: "Borderline",
};
const KIND_COLOR: Record<ErrorCase["kind"], string> = {
  false_positive: C.amber,
  false_negative: C.red,
  borderline: C.dim,
};

function CaseRow({ c, onDrill }: { c: ErrorCase; onDrill?: (c: ErrorCase) => void }) {
  const Line = ({ k, v }: { k: string; v?: string }) =>
    v ? (
      <div style={{ display: "flex", gap: 8, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5 }}>
        <span style={{ color: C.faint, minWidth: 118 }}>{k}</span>
        <span style={{ color: C.text }}>{v}</span>
      </div>
    ) : null;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tag color={KIND_COLOR[c.kind]}>{KIND_LABEL[c.kind]}</Tag>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
            {c.channel ?? "—"}{c.window ? ` · ${c.window}` : ""}
          </span>
        </div>
        {onDrill && (
          <TelemetryActionButton variant="secondary" onClick={() => onDrill(c)} aria-label={`Drill ${c.id}`}>
            Drill ›
          </TelemetryActionButton>
        )}
      </div>
      <Line k="What it saw" v={c.model_saw} />
      <Line k="True label" v={c.true_label} />
      <Line k="Feature pushed" v={c.feature_pushed} />
      <Line k="Operationally" v={c.acceptable} />
      <Line k="Might fix it" v={c.suggested_fix} />
    </div>
  );
}

// FP / FN review — the credibility centerpiece: show where the model is wrong, not just aggregate metrics.
// Reads the error_review receipt. Until the GCP run lands it (Part II.4), the drawer fails closed with an
// honest "not generated yet" state — never invented cases. `onDrill` (wired in S5) opens the prediction
// provenance drawer for any case.
export function FpFnReviewDrawer({
  open, onClose, onDrill,
}: { open: boolean; onClose: () => void; onDrill?: (c: ErrorCase) => void }) {
  const [payload, setPayload] = useState<ErrorReviewPayload | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    getWorkbenchErrorReview()
      .then((r: ReceiptEnvelope) => {
        setProvider(r.provider);
        setNullReason(r.null_reason);
        setPayload(r.payload as ErrorReviewPayload | null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  const cases = payload?.cases ?? [];
  const fields = [
    { label: "Source", value: "error_review receipt" },
    { label: "Provider", value: provider ?? "—" },
    { label: "Cases", value: nullReason ? "—" : cases.length },
  ];

  return (
    <MetricInspectorDrawer
      open={open}
      onClose={onClose}
      title="Failure review — false positives, false negatives, borderline"
      description="Where the model is wrong, with the feature that pushed each call and the operational consequence. Every case comes from the error_review receipt; none are fabricated."
      fields={fields}
    >
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <EmptyState label="Failure review unavailable" hint="The error_review receipt could not be loaded." nullReason={error} />}
        {!error && !loaded && <Loading label="Loading failure cases…" />}
        {!error && loaded && (nullReason || cases.length === 0) && (
          <EmptyState
            label="Failure review not generated yet"
            hint="FP/FN/borderline cases are classified over real predictions in the GCP run (Part II.4). Each case will drill to its exact feature vector and math (S5)."
            nullReason={nullReason}
          />
        )}
        {!error && loaded && !nullReason && cases.length > 0 && (
          <>
            {payload?.highlights && payload.highlights.length > 0 && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", paddingBottom: 4 }}>
                {payload.highlights.map((h) => (
                  <div key={h.label}>
                    <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>{h.label}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 13, color: ACCENT }}>{h.value}</div>
                  </div>
                ))}
              </div>
            )}
            {cases.map((c) => <CaseRow key={c.id} c={c} onDrill={onDrill} />)}
          </>
        )}
      </div>
    </MetricInspectorDrawer>
  );
}

export default FpFnReviewDrawer;

"use client";

import { useEffect, useState } from "react";
import { getWorkbenchExperiments, type ReceiptEnvelope } from "@/lib/telemetry/api";
import { C, Tag } from "../primitives";

const ACCENT = "#a855f7";

type Headline = {
  experiment_label?: string;
  hypothesis?: string;
  feature_change?: string;
  result?: string;
  promotion_outcome?: string;
};

// The non-negotiable first-screen artifact: Hypothesis -> Feature change -> Result -> Promotion outcome.
// A reviewer must grasp the experiment without opening any drawer. It reads the experiment_runs receipt's
// `headline`; until the first GCP experiment lands (Part II) it shows the established baseline honestly
// with the measured field marked pending — never a fabricated result.
const FALLBACK: Required<Headline> = {
  experiment_label: "Baseline — rolling-MAD detector",
  hypothesis: "A transparent rolling-MAD detector is hard to beat honestly on operational metrics.",
  feature_change: "value · rolling_mean_50 · residual · global_train_scale (the frozen champion inputs).",
  result: "Awaiting first GCP experiment receipt — no challenger has been replayed yet.",
  promotion_outcome: "MAD is the promoted champion.",
};

function Col({ label, value, pending }: { label: string; value: string; pending?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: ACCENT }}>{label}</span>
      <span style={{ fontFamily: C.sans, fontSize: 13.5, lineHeight: 1.5, color: pending ? C.faint : C.text }}>{value}</span>
    </div>
  );
}

export function WorkbenchHeadlineCard() {
  const [h, setH] = useState<Required<Headline>>(FALLBACK);
  const [provider, setProvider] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    getWorkbenchExperiments()
      .then((r: ReceiptEnvelope) => {
        const head = (r.payload as { headline?: Headline } | null)?.headline;
        if (head && !r.null_reason) {
          setH({ ...FALLBACK, ...head });
          setPending(false);
        }
        setProvider(r.provider);
      })
      .catch(() => {
        /* keep the honest baseline fallback */
      });
  }, []);

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{h.experiment_label}</span>
        {pending
          ? <Tag color={C.faint}>awaiting receipt</Tag>
          : <Tag color={provider === "vertex" ? C.green : C.amber}>{provider ?? "local_fixture"}</Tag>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 18 }}>
        <Col label="Hypothesis" value={h.hypothesis} />
        <Col label="Feature change" value={h.feature_change} />
        <Col label="Result" value={h.result} pending={pending} />
        <Col label="Promotion outcome" value={h.promotion_outcome} />
      </div>
    </div>
  );
}

export default WorkbenchHeadlineCard;

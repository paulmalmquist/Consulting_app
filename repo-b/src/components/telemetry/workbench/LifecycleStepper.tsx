"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { C } from "../primitives";
import { telemetryHref } from "../telemetryNav";

// Models & Intelligence section color (mirrors TELEMETRY_NAV_GROUP_META). Kept as a literal so this
// presentational module stays free of nav-meta coupling.
const ACCENT = "#a855f7";

type StageStatus = "live" | "computed" | "planned";

const STATUS_COLOR: Record<StageStatus, string> = {
  live: C.green,
  computed: C.amber,
  planned: C.faint,
};
const STATUS_LABEL: Record<StageStatus, string> = {
  live: "live",
  computed: "computed artifact",
  planned: "planned",
};

// The 15-stage ML lifecycle — the Workbench spine. Each stage deep-links to the existing page that
// proves it. Status is honest: live = real serving read now; computed = reproducible evidence artifact
// / replay; planned = fail-closed until the GCP MLOps pipeline (Part II) lands its receipt.
const STAGES: ReadonlyArray<{ n: number; label: string; slug: string; status: StageStatus }> = [
  { n: 1, label: "Raw telemetry", slug: "stream", status: "live" },
  { n: 2, label: "Feature engineering", slug: "workbench", status: "live" },
  { n: 3, label: "Training split", slug: "workbench", status: "computed" },
  { n: 4, label: "Model selection", slug: "model-performance", status: "live" },
  { n: 5, label: "Hyperparameter tuning", slug: "registry", status: "planned" },
  { n: 6, label: "Evaluation", slug: "model-performance", status: "live" },
  { n: 7, label: "Failure analysis", slug: "model-performance", status: "planned" },
  { n: 8, label: "Model registry", slug: "registry", status: "live" },
  { n: 9, label: "Champion promotion", slug: "registry", status: "live" },
  { n: 10, label: "Real-time inference", slug: "replay", status: "live" },
  { n: 11, label: "Operator alert", slug: "system-health", status: "live" },
  { n: 12, label: "Explainability", slug: "model-performance", status: "computed" },
  { n: 13, label: "Calibration", slug: "calibration", status: "computed" },
  { n: 14, label: "Feedback loop", slug: "system-health", status: "planned" },
  { n: 15, label: "Business decision", slug: "control-tower", status: "live" },
];

export function LifecycleStepper({ activeSlug }: { activeSlug?: string }) {
  const params = useParams<{ envId: string }>();
  const envId = (params?.envId as string) ?? "";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>
          ML lifecycle
        </span>
        <span style={{ fontFamily: C.sans, fontSize: 12, color: C.dim }}>
          trace a prediction end-to-end — every stage deep-links to the page that proves it
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
        {STAGES.map((s) => {
          const active = activeSlug != null && s.slug === activeSlug;
          const dot = STATUS_COLOR[s.status];
          return (
            <Link
              key={s.n}
              href={telemetryHref(envId, s.slug)}
              title={`${s.label} — ${STATUS_LABEL[s.status]}`}
              style={{
                flexShrink: 0,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontFamily: C.mono,
                fontSize: 11,
                color: active ? C.text : C.dim,
                background: active ? `${ACCENT}1a` : C.panel,
                border: `1px solid ${active ? ACCENT : C.border}`,
                borderRadius: 999,
                padding: "6px 11px",
                whiteSpace: "nowrap",
              }}
            >
              <span aria-hidden style={{ fontSize: 9, color: C.faint }}>{s.n}</span>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: dot, boxShadow: `0 0 6px ${dot}aa` }} />
              {s.label}
            </Link>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {(["live", "computed", "planned"] as StageStatus[]).map((st) => (
          <span key={st} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 10, color: C.faint }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_COLOR[st] }} />
            {STATUS_LABEL[st]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default LifecycleStepper;

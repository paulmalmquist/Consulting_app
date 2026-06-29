"use client";

import type { ReactNode } from "react";
import { C, Tag } from "./primitives";
import { DrawerWrapper, DrawerHeader, FieldRow } from "./drawerPrimitives";
import type {
  RulDrawerTarget,
  EvidenceProvenance,
  RulMetricEvidence,
  RulArtifactStep,
  RulChartPointTarget,
  RulReliabilityBin,
} from "@/lib/telemetry/rulCalibrationEvidence";

// One right-drawer for every drill-through on the RUL Calibration page. Driven by a single
// discriminated RulDrawerTarget union so the page only tracks one piece of state. Built on the
// shared DrawerWrapper (Radix: right panel on lg / bottom sheet mobile, Escape + overlay close +
// focus trap) so the interaction matches the rest of telemetry. Missing provenance never renders a
// placeholder — it renders a specific null reason via FieldRow ("Not available") or an explicit line.

const TYPE_LABEL: Record<RulDrawerTarget["kind"], string> = {
  metric: "metric",
  artifact: "artifact",
  "chart-point": "chart point",
  "reliability-bin": "reliability bin",
  "model-card": "model card",
  "source-row": "source row",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.faint, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Prose({ children, tone = C.dim }: { children: ReactNode; tone?: string }) {
  return <p style={{ fontFamily: C.sans, fontSize: 13, color: tone, lineHeight: 1.55, margin: 0 }}>{children}</p>;
}

function Mono({ children, tone = C.dim }: { children: ReactNode; tone?: string }) {
  return <div style={{ fontFamily: C.mono, fontSize: 11.5, color: tone, lineHeight: 1.55, overflowWrap: "anywhere" }}>{children}</div>;
}

// Provenance section, shared by every kind. A null field renders a specific reason, never an id.
function ProvenanceSection({ provenance, extraNullReasons }: {
  provenance: EvidenceProvenance; extraNullReasons?: Record<string, string>;
}) {
  const reasonFor = (key: string, fallback: string) => extraNullReasons?.[key] ?? fallback;
  return (
    <Section title="Source / provenance">
      <FieldRow label="Source kind" value={provenance.sourceKind.replace(/_/g, " ")} />
      <FieldRow
        label="Run id"
        value={provenance.runId ?? `Not available — ${reasonFor("runId", "run id is not stored on this fixture")}`}
      />
      <FieldRow
        label="Artifact id"
        value={provenance.artifactId ?? `Not available — ${reasonFor("artifactId", "artifact id is not stored in current fixture")}`}
      />
      <FieldRow
        label="Table"
        value={provenance.table ?? `Not available — ${reasonFor("table", "source table id is not stored on this replay fixture")}`}
      />
      <FieldRow
        label="Evidence path"
        value={provenance.path ?? `Not available — ${reasonFor("path", "evidence path is not stored in current fixture")}`}
      />
      <FieldRow
        label="Created at"
        value={provenance.createdAt ?? `Not available — ${reasonFor("createdAt", "timestamp is not stored on this fixture")}`}
      />
      {provenance.note && (
        <div style={{ marginTop: 10 }}>
          <Mono tone={C.faint}>{provenance.note}</Mono>
        </div>
      )}
    </Section>
  );
}

function statusTone(status: string): string {
  if (status === "passed" || status === "available") return C.green;
  if (status === "warning" || status === "computed" || status === "fixture" || status === "artifact") return C.amber;
  if (status === "failed" || status === "unavailable") return C.red;
  if (status === "not_sota") return C.amber;
  return C.dim;
}

// ---- per-kind bodies -------------------------------------------------------

const METRIC_ACCENT: Record<string, string> = { cyan: C.cyan, green: C.green, amber: C.amber, red: C.red };

function MetricBody({ t }: { t: RulMetricEvidence }) {
  const valueColor = t.accent ? METRIC_ACCENT[t.accent] ?? C.text : C.text;
  return (
    <>
      <Section title="Summary">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: C.sans, fontSize: 30, fontWeight: 600, color: valueColor }}>
            {t.value}
          </span>
          {t.baselineSub && <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{t.baselineSub}</span>}
        </div>
        {t.deltaLabel && <div style={{ marginTop: 6 }}><Mono tone={C.dim}>{t.deltaLabel}</Mono></div>}
      </Section>
      {t.formula && (
        <Section title="Formula">
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "9px 11px" }}>
            <Mono tone={C.text}>{t.formula}</Mono>
          </div>
        </Section>
      )}
      <Section title="Data used"><Prose>{t.dataUsed}</Prose></Section>
      <Section title="Interpretation"><Prose>{t.interpretation}</Prose></Section>
      <Section title="Limitations">
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
          {t.limitations.map((l, i) => (
            <li key={i} style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>{l}</li>
          ))}
        </ul>
      </Section>
      <ProvenanceSection provenance={t.provenance} />
      {t.downstream && t.downstream.length > 0 && (
        <Section title="Downstream consumers">
          {t.downstream.map((d, i) => <Mono key={i} tone={C.dim}>· {d}</Mono>)}
        </Section>
      )}
    </>
  );
}

function ArtifactBody({ t }: { t: RulArtifactStep }) {
  return (
    <>
      <Section title="Summary"><Prose>{t.summary}</Prose></Section>
      <Section title="Details">
        {Object.entries(t.details).map(([k, v]) => (
          <FieldRow
            key={k}
            label={k}
            value={v ?? `Not available — ${t.nullReasons?.[k] ?? "not stored in current fixture"}`}
          />
        ))}
      </Section>
      <ProvenanceSection provenance={t.provenance} />
    </>
  );
}

function ChartPointBody({ t }: { t: RulChartPointTarget }) {
  return (
    <>
      <Section title="Summary">
        <FieldRow label="Cycle" value={t.cycle} />
        <FieldRow label="True RUL" value={`${t.trueRul} cycles`} />
        <FieldRow label="Predicted RUL" value={`${t.predRul} cycles`} />
        <FieldRow label="Error (pred − true)" value={`${t.error > 0 ? "+" : ""}${t.error} cycles`} />
        <FieldRow label="Absolute error" value={`${t.absError} cycles`} />
      </Section>
      <Section title="Interval containment">
        <FieldRow label="80% interval" value={`[${t.lo80}, ${t.hi80}]`} />
        <FieldRow label="Inside 80%" value={t.inside80 ? "yes" : "no"} />
        <FieldRow label="90% interval" value={`[${t.lo90}, ${t.hi90}]`} />
        <FieldRow label="Inside 90%" value={t.inside90 ? "yes" : "no"} />
        <FieldRow label="Late / early" value={t.late ? "late (optimistic)" : "early / on-time"} />
      </Section>
      <Section title="Operational interpretation">
        <Prose>
          {t.late
            ? "Late prediction: the model claims more remaining life than there is. Near failure this is the dangerous direction — a part could run past its safe window."
            : "Early / on-time prediction: the model is conservative here, which would trigger maintenance earlier than strictly needed — costly but not dangerous."}
        </Prose>
        {t.lateRisk && (
          <div style={{ marginTop: 10 }}>
            <Tag color={C.red}>late-risk zone</Tag>
            <div style={{ marginTop: 6 }}>
              <Mono tone={C.dim}>This point is a late prediction near low true RUL — the operational concern this page flags.</Mono>
            </div>
          </div>
        )}
      </Section>
      <ProvenanceSection provenance={t.provenance} />
    </>
  );
}

function ReliabilityBinBody({ t }: { t: RulReliabilityBin }) {
  const within = Math.abs(t.delta) <= t.tolerance;
  return (
    <>
      <Section title="Summary">
        <FieldRow label="Nominal level" value={`${Math.round(t.nominal * 100)}%`} />
        <FieldRow label="Observed coverage" value={`${(t.observed * 100).toFixed(1)}%`} />
        <FieldRow label="Delta" value={`${t.delta >= 0 ? "+" : ""}${(t.delta * 100).toFixed(1)}%`} />
        <FieldRow label="Tolerance" value={`±${(t.tolerance * 100).toFixed(0)}%`} />
        <FieldRow
          label="Sample count"
          value={t.sampleCount ?? `Not available — ${t.nullReason ?? "sample count not included in current static evidence artifact"}`}
        />
      </Section>
      <Section title="Interpretation">
        <Prose>
          {within
            ? "Observed coverage is within tolerance of the nominal level — this bin supports the calibration claim."
            : "Observed coverage is outside tolerance — this bin weakens the calibration claim at this level."}
        </Prose>
      </Section>
      <ProvenanceSection
        provenance={{ sourceKind: "computed_artifact", runId: "1000196687230771", path: "docs/plans/03-implementation-plans/evidence/telemetry-calibration-challenger.md", table: null, artifactId: null, note: "Reliability table from the challenger evidence artifact." }}
      />
    </>
  );
}

export function RulEvidenceDrawer({ target, onClose }: { target: RulDrawerTarget | null; onClose: () => void }) {
  const open = target !== null;
  if (!target) return <DrawerWrapper open={false} onClose={onClose}>{null}</DrawerWrapper>;

  const title =
    target.kind === "metric" ? target.metric.label
    : target.kind === "artifact" ? target.artifact.label
    : target.kind === "chart-point" ? `Cycle ${target.cycle} — per-cycle calibration`
    : target.kind === "reliability-bin" ? `${Math.round(target.bin.nominal * 100)}% reliability bin`
    : target.kind === "model-card" ? "Model card — CNN-LSTM"
    : (target.title ?? "Evidence");

  const status =
    target.kind === "metric" ? target.metric.status
    : target.kind === "artifact" ? target.artifact.status
    : target.kind === "reliability-bin" ? target.bin.status
    : target.kind === "chart-point" ? (target.lateRisk ? "warning" : target.inside90 ? "passed" : "warning")
    : "artifact";

  const statusText =
    target.kind === "artifact" ? target.artifact.statusTag
    : status.replace(/_/g, " ");

  return (
    <DrawerWrapper open={open} onClose={onClose}>
      <DrawerHeader
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {title}
            <Tag color={C.faint}>{TYPE_LABEL[target.kind]}</Tag>
            <Tag color={statusTone(status)}>{statusText}</Tag>
          </span>
        }
        description="Inspectable evidence — provenance, method, and limitations for this artifact. Computed evidence + replay fixture, not live serving."
      />
      {target.kind === "metric" && <MetricBody t={target.metric} />}
      {target.kind === "artifact" && <ArtifactBody t={target.artifact} />}
      {target.kind === "chart-point" && <ChartPointBody t={target} />}
      {target.kind === "reliability-bin" && <ReliabilityBinBody t={target.bin} />}
      {target.kind === "model-card" && (
        <>
          <Section title="Summary">
            <Prose>CNN-LSTM (Conv1D×2 → LSTM → Dense) champion on C-MAPSS FD001 with asymmetric split-conformal uncertainty. Champion, but NOT literature-competitive (above the ~13 RMSE bar).</Prose>
          </Section>
          <Section title="Data used"><Prose>FD001 train/test split (public NASA analog).</Prose></Section>
          <Section title="Limitations">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>Not SOTA — 17.33 RMSE vs the ~13 FD001 literature bar.</li>
              <li style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>Model registry id unavailable in this environment.</li>
            </ul>
          </Section>
          <ProvenanceSection
            provenance={target.provenance}
            extraNullReasons={{ table: "model registry endpoint is not configured for this environment", artifactId: "model registry endpoint is not configured for this environment" }}
          />
        </>
      )}
      {target.kind === "source-row" && (
        <>
          <Section title="Summary"><Prose>{target.title}</Prose></Section>
          {target.nullReason && (
            <Section title="Limitations / null reason"><Mono tone={C.amber}>Not available — {target.nullReason}</Mono></Section>
          )}
          <ProvenanceSection provenance={target.provenance} />
        </>
      )}
    </DrawerWrapper>
  );
}

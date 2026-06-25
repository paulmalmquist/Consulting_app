"use client";

// The shared "click anything → evidence" drawer for the Factory ML page.
// One drawer instance lives in FactoryMlConsole; every tab passes a DrillObject.
// The Radix shell is copied from metadata/LineageDrawer.tsx (same right-slide
// pattern, C.rail bg); the domain logic is factory-ml specific.
//
// Discipline: every field fails closed (missing → "Unavailable"), weak metrics
// are interpreted honestly (never softened), and external links are live by
// default but disabled-with-reason when an identifier is missing.

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

import { C, Tag } from "../primitives";
import type { DrillObject } from "./factoryDrill";
import {
  mlflowExperimentLink,
  mlflowRunLink,
  registeredModelLink,
  type ExternalEvidenceLink,
} from "@/lib/lab/factoryEvidenceLinks";
import { lookupFeature } from "@/lib/lab/factoryFeatureCatalog";
import {
  GROUPKFOLD_NOTE,
  SYNTHETIC_EVAL_NOTE,
  interpretMetric,
} from "@/lib/lab/factoryMetricGlossary";
import { derivePromotionRationale } from "@/lib/lab/factoryPromotionRationale";

// ── shared presentational helpers ────────────────────────────────────────────

function isPresent(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

/** Fail-closed field row: missing values render "Unavailable", never blank. */
function Field({ label, value }: { label: string; value: unknown }) {
  const present = isPresent(value);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(110px,0.8fr) minmax(0,1.6fr)",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color: present ? C.dim : C.faint, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5, overflowWrap: "anywhere" }}>
        {present ? String(value) : "Unavailable"}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18 }} aria-label={title}>
      <div style={{ fontFamily: C.mono, color: C.faint, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </section>
  );
}

/** A weak-evidence / caveat callout in amber — used for honest interpretation. */
function Caution({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 7, padding: "9px 11px", color: C.amber, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5, marginTop: 8 }}>
      {children}
    </div>
  );
}

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      style={{ fontFamily: C.mono, fontSize: 9, color: C.dim, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer" }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

/** Live <a> when href is set; disabled <button> + reason + copy chip otherwise. */
function EvidenceLinkButton({ link }: { link: ExternalEvidenceLink }) {
  if (link.href) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 11, color: C.cyan, background: `${C.cyan}12`, border: `1px solid ${C.cyan}55`, borderRadius: 6, padding: "6px 11px", textDecoration: "none" }}
      >
        {link.label} ↗
      </a>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        disabled
        aria-disabled
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 11, color: C.faint, background: C.panel, border: `1px dashed ${C.border}`, borderRadius: 6, padding: "6px 11px", cursor: "not-allowed", alignSelf: "flex-start" }}
      >
        {link.label}
      </button>
      <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span>Unavailable — {link.unavailableReason}</span>
        {link.copyText && <CopyChip text={link.copyText} />}
      </div>
    </div>
  );
}

function LinkRow({ links }: { links: ExternalEvidenceLink[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {links.map((l) => (
        <EvidenceLinkButton key={`${l.kind}-${l.label}`} link={l} />
      ))}
    </div>
  );
}

/** The "what changes because of this?" decision-relevance line. */
function OperationalUse({ value }: { value: string }) {
  return (
    <Section title="Operational use">
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>{value}</div>
    </Section>
  );
}

const REVIEWER_QUESTIONS = [
  "Target: what exactly is the label, and who assigns it?",
  "Split: why this grouping — any leakage across build / vehicle / lot / time?",
  "Baseline: does this beat a naive rule or the prior champion?",
  "Calibration: are the predicted probabilities reliable?",
  "Slices: does it hold by part family / printer / toolhead / material lot?",
  "Reproducibility: can this exact run be recreated from code + data + model metadata?",
  "Operational action: what decision changes because of this score?",
];

function ReviewerQuestions() {
  return (
    <Section title="What a reviewer would ask">
      <ul style={{ margin: 0, paddingLeft: 16, fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.7 }}>
        {REVIEWER_QUESTIONS.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    </Section>
  );
}

// ── per-kind content ─────────────────────────────────────────────────────────

function titleFor(drill: DrillObject): string {
  switch (drill.kind) {
    case "model_metric":
      return drill.metricKey.replace(/^mean_/, "").replace(/_/g, " ");
    case "feature":
      return drill.feature;
    case "model_version":
      return `${drill.model.model_key} · v${drill.version.version}`;
    case "mlflow_run":
      return "Live MLflow run";
    case "ncr":
      return drill.ncrId;
    case "ncr_category":
      return drill.cluster.defect_code;
    case "vehicle":
      return drill.vehicle.vehicle_id;
  }
}

function DrillBody({ drill }: { drill: DrillObject }) {
  switch (drill.kind) {
    case "model_metric": {
      const i = interpretMetric(drill.metricKey, drill.value);
      return (
        <>
          <Section title="Summary">
            <Field label="Metric" value={drill.metricKey.replace(/^mean_/, "")} />
            <Field label="Value" value={drill.value.toFixed(4)} />
            <Field label="Model / target" value={i.target} />
            <Field label="Split" value={GROUPKFOLD_NOTE} />
            <Field label="Promotion" value={i.usedForPromotion ? "Used for champion promotion (pr_auc)" : "Informational — not the promotion metric"} />
          </Section>
          <Section title="Definition">
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>{i.definition}</div>
            {i.weakBand && <Caution>{i.weakBand}</Caution>}
          </Section>
          <Section title="Validation">
            <Field label="Eval" value={SYNTHETIC_EVAL_NOTE} />
          </Section>
          <OperationalUse value={i.weakBand ? "Informational only — weak evidence does not justify operational use." : "Model promotion review."} />
          <ReviewerQuestions />
        </>
      );
    }

    case "feature": {
      const def = lookupFeature(drill.feature);
      return (
        <>
          <Section title="Summary">
            <Field label="Feature" value={drill.feature} />
            <Field label="SHAP impact" value={drill.impact.toFixed(4)} />
            <Field label="Model" value={drill.modelKey} />
            <Field label="Method" value={drill.method} />
          </Section>
          <Section title="Definition">
            {def ? (
              <>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>{def.definition}</div>
                <div style={{ marginTop: 8 }}>
                  <Field label="Signal" value={def.signal} />
                  <Field label="Statistic" value={def.statistic} />
                  <Field label="Units" value={def.units} />
                </div>
                <Caution>{def.caveat}</Caution>
              </>
            ) : (
              <Caution>Unavailable — no definition for this feature name in the inferred catalog.</Caution>
            )}
          </Section>
          <Section title="Source / lineage">
            <Field label="From" value="gold_feature_importance (SHAP export)" />
            <Field label="MLflow run" value={drill.runId} />
          </Section>
          <Section title="Model / run evidence">
            <LinkRow links={[mlflowRunLink(drill.runId)]} />
          </Section>
          <OperationalUse value="Informational only — feature attribution, not a release decision." />
          <ReviewerQuestions />
        </>
      );
    }

    case "model_version": {
      const r = derivePromotionRationale(drill.model, drill.version);
      const v = drill.version;
      return (
        <>
          <Section title="Summary">
            <Field label="Model" value={drill.model.model_key} />
            <Field label="Version" value={`v${v.version}`} />
            <Field label="Stage" value={v.is_champion ? "champion" : v.stage} />
            <Field label={v.primary_metric} value={v.primary_metric_value.toFixed(3)} />
            <Field label="Training rows" value={v.training_rows.toLocaleString()} />
          </Section>
          <Section title="Validation">
            <Field label="Eval" value={SYNTHETIC_EVAL_NOTE} />
            <Field label="Card" value={v.model_card_summary} />
          </Section>
          <Section title="Promotion rationale">
            {v.is_champion ? (
              <ul style={{ margin: 0, paddingLeft: 16, fontFamily: C.mono, fontSize: 10.5, color: C.green, lineHeight: 1.7 }}>
                {r.whyChampion.length ? r.whyChampion.map((b) => <li key={b}>{b}</li>) : <li style={{ color: C.faint }}>Unavailable</li>}
              </ul>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 16, fontFamily: C.mono, fontSize: 10.5, color: C.amber, lineHeight: 1.7 }}>
                {r.whyNotChampion.length ? r.whyNotChampion.map((b) => <li key={b}>{b}</li>) : <li style={{ color: C.faint }}>Unavailable</li>}
              </ul>
            )}
            <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>{r.source}</div>
          </Section>
          <OperationalUse value="Model promotion review." />
          <ReviewerQuestions />
        </>
      );
    }

    case "mlflow_run":
      return (
        <>
          <Section title="Summary">
            <Field label="Run id" value={drill.runId} />
            <Field label="Experiment" value={drill.experiment} />
          </Section>
          <Section title="Registered models">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {drill.registeredModels.map((m) => (
                <Tag key={m} color={C.cyan}>{m.split(".").pop()}</Tag>
              ))}
            </div>
          </Section>
          <Section title="Headline metrics">
            {Object.entries(drill.headlineMetrics).map(([k, val]) => (
              <Field key={k} label={k.replace(/^mean_/, "")} value={val.toFixed(4)} />
            ))}
          </Section>
          <Section title="Model / run evidence">
            <LinkRow links={[mlflowRunLink(drill.runId), mlflowExperimentLink(drill.experiment), ...drill.registeredModels.map((m) => registeredModelLink(m))]} />
          </Section>
          <OperationalUse value="Model promotion review." />
        </>
      );

    case "ncr":
      return (
        <>
          <Section title="Summary">
            <Field label="NCR id" value={drill.ncrId} />
            <Field label="Defect code" value={drill.defectCode} />
            <Field label="Status" value={drill.status} />
            <Field label="Disposition" value={drill.disposition} />
            <Field label="Part id" value={drill.partId} />
            <Field label="Opened" value={drill.openedDate} />
          </Section>
          <Section title="Source / lineage">
            <Field label="From" value="bronze_raw_qms_ncrs (synthetic QMS seed)" />
          </Section>
          <OperationalUse value="NCR triage." />
        </>
      );

    case "ncr_category": {
      const c = drill.cluster;
      const trendSummary = c.trend.length
        ? `${c.trend[0].month} → ${c.trend[c.trend.length - 1].month}, ${c.trend.map((t) => t.n).join(" · ")}`
        : null;
      return (
        <>
          <Section title="Summary">
            <Field label="Defect code" value={c.defect_code} />
            <Field label="Open" value={c.open_n} />
            <Field label="Total" value={c.n} />
            <Field label="Avg age" value={`${c.avg_age_days.toFixed(0)} days`} />
          </Section>
          <Section title="Trend (monthly opened)">
            <Field label="Series" value={trendSummary} />
          </Section>
          <Section title="Source / lineage">
            <Field label="From" value="bronze_raw_qms_ncrs (synthetic QMS seed)" />
          </Section>
          <OperationalUse value="NCR triage." />
        </>
      );
    }

    case "vehicle": {
      const v = drill.vehicle;
      const blockers: string[] = [];
      if (v.scenario_open_ncrs > 0) blockers.push(`${v.scenario_open_ncrs} blocking NCR${v.scenario_open_ncrs === 1 ? "" : "s"} must close`);
      if (v.unresolved_anomalies > 0) blockers.push(`${v.unresolved_anomalies} unresolved anomal${v.unresolved_anomalies === 1 ? "y" : "ies"} must clear`);
      if (v.missing_signoffs > 0) blockers.push(`${v.missing_signoffs} missing signoff${v.missing_signoffs === 1 ? "" : "s"} must be obtained`);
      if (v.inconclusive_tests > 0) blockers.push(`${v.inconclusive_tests} inconclusive test${v.inconclusive_tests === 1 ? "" : "s"} to resolve`);
      return (
        <>
          <Section title="Summary">
            <Field label="Vehicle" value={`${v.vehicle_id} — ${v.vehicle_name}`} />
            <Field label="Status" value={v.status} />
            <Field label="Readiness" value={(v.readiness_score * 100).toFixed(0)} />
            <Field label="Target launch" value={v.target_launch_date} />
          </Section>
          <Section title="Score breakdown (open items)">
            <Field label="Open NCRs" value={v.open_ncrs} />
            <Field label="Blocking NCRs" value={v.scenario_open_ncrs} />
            <Field label="Inconclusive tests" value={v.inconclusive_tests} />
            <Field label="Unresolved anomalies" value={v.unresolved_anomalies} />
            <Field label="Missing signoffs" value={v.missing_signoffs} />
          </Section>
          <Section title="What must clear before green">
            {blockers.length ? (
              <ul style={{ margin: 0, paddingLeft: 16, fontFamily: C.mono, fontSize: 10.5, color: C.amber, lineHeight: 1.7 }}>
                {blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            ) : (
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.green }}>No open blockers — readiness gates met.</div>
            )}
          </Section>
          <Section title="Source / lineage">
            <Field label="From" value="gold_readiness_summary (medallion rollup)" />
          </Section>
          <OperationalUse value="Readiness hold / release review." />
        </>
      );
    }
  }
}

// ── shell ────────────────────────────────────────────────────────────────────

export default function FactoryEvidenceDrawer({
  drill,
  onClose,
}: {
  drill: DrillObject | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={Boolean(drill)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 70 }} />
        <Dialog.Content
          className="fixed bottom-0 left-0 right-0 z-[80] max-h-[86vh] rounded-t-xl lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-screen lg:max-h-none lg:w-[460px] lg:rounded-none lg:rounded-l-xl"
          style={{ background: C.rail, border: `1px solid ${C.borderHi}`, color: C.text, overflowY: "auto", padding: 20, boxShadow: "-18px 0 50px rgba(0,0,0,0.38)" }}
        >
          {drill && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <Dialog.Title style={{ fontFamily: C.sans, fontSize: 19, fontWeight: 700, overflowWrap: "anywhere" }}>
                    {titleFor(drill)}
                  </Dialog.Title>
                  <Dialog.Description style={{ color: C.dim, fontFamily: C.mono, fontSize: 10, lineHeight: 1.5, marginTop: 6 }}>
                    Evidence — where this comes from, and whether to trust it.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button type="button" aria-label="Close evidence drawer" style={{ width: 36, height: 36, borderRadius: 7, border: `1px solid ${C.borderHi}`, background: C.panel, color: C.dim, cursor: "pointer", flexShrink: 0 }}>
                    x
                  </button>
                </Dialog.Close>
              </div>
              <DrillBody drill={drill} />
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

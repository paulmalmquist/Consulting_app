"use client";

import type { ReactNode } from "react";
import { C, MetricRow, Tag } from "../primitives";
import { MetricInspectorDrawer } from "../drawerPrimitives";
import { SourceRowsTable } from "./SourceRowsTable";
import { DatabricksRunLink, DeltaTableLink, LineageLink, ModelArtifactLink } from "./evidenceLinks";

const ACCENT = "#a855f7";

// Frozen anomaly-champion constants, mirrored from backend/app/services/telemetry_serving.py (the serving
// source of truth). Surfaced so any MAD-based drill shows the exact rule it was scored against. Not a
// second source of truth — these are the same frozen values the seeded threshold_sweep receipt carries.
export const MAD_FROZEN = {
  mad_k: 4.0,
  global_train_scale: 0.033866801182436346,
  detector_threshold: 0.13546720472974538,
};

// The continuous drill payload. The caller assembles it from data it already holds; the drawer does no
// fetching. Every rung fails closed independently — a missing value renders "—" or the receipt's reason.
export interface MlProvenanceSelection {
  title?: string;
  /** Rung 1 — verdict + score + threshold. */
  signal: Array<{ label: string; value: ReactNode }>;
  /** Rung 2 — the exact window rows / feature vector that produced the call. */
  featureVector?: {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    sourceLabel?: string;
    nullReason?: string | null;
  } | null;
  /** Rung 3 — the mathematical rule (frozen MAD constants, or model card facts). */
  math: Array<{ label: string; value: ReactNode }>;
  /** Rung 3 — reconciliation finding when the scoring path diverges (per_channel_caveat). */
  reconciliationCaveat?: string | null;
  /** Rung 4 — the experiment run + model artifact. */
  mlflowRunId?: string | null;
  modelName?: string | null;
  /** Rung 5 — the promotion gate decision + the source Delta/BigQuery table + lineage. */
  gate?: Array<{ label: string; value: ReactNode }>;
  deltaTable?: string | null;
  lineageHref?: string | null;
}

function Rung({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span aria-hidden style={{ width: 18, height: 18, borderRadius: 999, display: "inline-flex",
          alignItems: "center", justifyContent: "center", background: `${ACCENT}22`, color: ACCENT,
          fontFamily: C.mono, fontSize: 10 }}>{n}</span>
        <span style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

// The continuous "anomaly → feature vector → math → run → gate" drill — one drawer, consistent
// everywhere it is wired, no dead ends. It is the anti-black-box centerpiece.
export function MlProvenanceDrawer({
  open, onClose, selection,
}: { open: boolean; onClose: () => void; selection: MlProvenanceSelection | null }) {
  const s = selection;
  return (
    <MetricInspectorDrawer
      open={open}
      onClose={onClose}
      title={s?.title ?? "Prediction provenance — verdict → feature vector → math → run → gate"}
      description="Drill any prediction to the exact data, rule, run, and gate behind it. Every rung fails closed with a copyable id when an artifact is missing — no rung is faked."
      fields={s?.signal ?? [{ label: "Selection", value: "none" }]}
    >
      {!s ? null : (
        <div style={{ marginTop: 4 }}>
          <Rung n={2} label="Feature vector — the window that produced it">
            {s.featureVector && !s.featureVector.nullReason && s.featureVector.rows.length > 0 ? (
              <SourceRowsTable
                kind="computed-artifact"
                columns={s.featureVector.columns}
                rows={s.featureVector.rows}
                sourceLabel={s.featureVector.sourceLabel ?? "feature window"}
              />
            ) : (
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>
                {s.featureVector?.nullReason ? `Unavailable — ${s.featureVector.nullReason}` : "Feature window not attached to this selection."}
              </span>
            )}
          </Rung>

          <Rung n={3} label="Math — the rule it was scored against">
            {s.math.map((m) => <MetricRow key={m.label} label={m.label} value={m.value} />)}
            {s.reconciliationCaveat && (
              <div style={{ marginTop: 10, background: `${C.amber}14`, border: `1px solid ${C.amber}55`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Tag color={C.amber}>scoring reconciliation</Tag>
                </div>
                <span style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>{s.reconciliationCaveat}</span>
              </div>
            )}
          </Rung>

          <Rung n={4} label="Run — the experiment that produced the model">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <DatabricksRunLink runId={s.mlflowRunId} />
              <ModelArtifactLink modelName={s.modelName} />
            </div>
          </Rung>

          <Rung n={5} label="Gate — the promotion decision + source table">
            {(s.gate ?? []).map((g) => <MetricRow key={g.label} label={g.label} value={g.value} />)}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              <DeltaTableLink tableName={s.deltaTable} />
              <LineageLink href={s.lineageHref ?? undefined} unavailableReason={s.lineageHref ? undefined : "lineage link not attached"} />
            </div>
          </Rung>
        </div>
      )}
    </MetricInspectorDrawer>
  );
}

export default MlProvenanceDrawer;

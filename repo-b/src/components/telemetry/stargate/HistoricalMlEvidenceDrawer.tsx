"use client";

// Historical ML Evidence Bridge — the auditable surface behind the live Stargate baseline detector.
//
// It renders a COMPUTED EVIDENCE ARTIFACT (repo-b/src/lib/telemetry/regimeAnomalyEvidence.json), produced
// by telemetry-platform/compute_regime_anomaly.py from real NASA C-MAPSS FD004 rows on Databricks. Every
// number, the source query, and the lineage chain are stored fields you can click into; anything the
// artifact does not carry (live table refresh ts, full-table rowcount, live materialization status) renders
// "Not available" + a null_reason. It is explicit that this is HISTORICAL VALIDATION, not proof that this
// PCA model scores the live Stargate stream (which is a separate transparent rolling-MAD baseline).

import { useState } from "react";

import evidence from "@/lib/telemetry/regimeAnomalyEvidence.json";
import { C, Tag } from "../primitives";
import { DrawerWrapper, DrawerHeader } from "../drawerPrimitives";
import { deltaTableLink, type ExternalEvidenceLink } from "@/lib/lab/factoryEvidenceLinks";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ev = evidence as unknown as RegimeEvidence;

interface RegimeRow { regime: number; n_eval_rows: number; global_fp: number; regime_conditioned_fp: number }
interface RegimeEvidence {
  as_of?: string; dataset?: string; n_units?: number; n_regimes?: number; n_active_sensors?: number;
  metrics?: { global_mean_fp: number; regime_conditioned_mean_fp: number; global_worst_regime_fp: number;
    regime_conditioned_worst_regime_fp: number; mean_fp_reduction_pct: number; worst_regime_fp_reduction_pct: number };
  per_regime?: RegimeRow[];
  source?: {
    fully_qualified?: string; dataset_family?: string; subset?: string; split?: string; purpose?: string;
    compute_artifact?: string; rows_used_fit?: number; rows_used_eval?: number;
    table_rowcount?: number | null; table_rowcount_null_reason?: string;
    materialized_at?: string | null; materialized_at_null_reason?: string;
  };
  source_query?: string; source_query_note?: string;
  lineage?: Array<{ id: string; label: string; kind: string; layer: string; table?: string; ref?: string; note?: string }>;
  lineage_status?: string; lineage_status_null_reason?: string;
  model_card?: {
    family: string; training_data: string; evaluation_data: string; baseline: string; validated_method: string;
    primary_metric: string; headline: string; caveat: string; decision_informed: string;
  };
  theory?: string[];
}

// ── small presentational helpers (self-contained; no cross-drawer imports) ──────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
      color: C.faint, margin: "18px 0 8px" }}>{children}</div>
  );
}

function Field({ label, value, nullReason }: { label: string; value?: React.ReactNode; nullReason?: string }) {
  const present = value !== undefined && value !== null && value !== "";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, alignItems: "baseline",
      padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 12, color: present ? C.text : C.faint, lineHeight: 1.5 }}>
        {present ? value : `Not available — ${nullReason ?? "not exposed by the artifact"}`}
      </span>
    </div>
  );
}

function CopyId({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`Copy ${text}`}
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}
      style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, background: C.panel, cursor: "pointer",
        border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px" }}>
      {done ? "copied" : "copy"}
    </button>
  );
}

function LinkButton({ link }: { link: ExternalEvidenceLink }) {
  if (link.href) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 11,
          color: C.cyan, background: `${C.cyan}12`, border: `1px solid ${C.cyan}55`, borderRadius: 6,
          padding: "6px 11px", textDecoration: "none" }}>
        {link.label} ↗
      </a>
    );
  }
  return (
    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, display: "flex", alignItems: "center",
      gap: 8, flexWrap: "wrap" }}>
      <span>{link.label}: not available — {link.unavailableReason}</span>
      {link.copyText && <CopyId text={link.copyText} />}
    </div>
  );
}

function FpBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: C.panel, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.border}` }}>
        <div style={{ width: `${Math.min(100, value * 100)}%`, height: "100%", background: `${color}aa` }} />
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 10.5, color, minWidth: 40, textAlign: "right" }}>{pct(value)}</span>
    </div>
  );
}

export default function HistoricalMlEvidenceDrawer({ open, onClose, envHref }: {
  open: boolean; onClose: () => void; envHref?: string;
}) {
  const card = ev.model_card;
  const m = ev.metrics;
  const src = ev.source;
  const failClosed = !card || !m || !src;

  const silverLink = deltaTableLink(src?.fully_qualified);
  const bronzeLink = deltaTableLink(ev.lineage?.find((l) => l.layer === "bronze")?.table);

  return (
    <DrawerWrapper open={open} onClose={onClose}>
      <DrawerHeader
        title="Historical ML anomaly evidence"
        description="The validated ML pipeline behind the live baseline. Live Stargate detection is a transparent rolling-MAD baseline over a recorded capture — NOT this model. This is historical validation on NASA C-MAPSS FD004."
      />

      {failClosed ? (
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.amber, padding: "12px 0" }}>
          Not available — the regime-anomaly evidence artifact is missing required fields
          (model_card / metrics / source). Nothing is rendered in their place.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
            <Tag color={C.amber}>computed evidence artifact · not live serving</Tag>
            <Tag color={C.dim}>{ev.dataset}{ev.as_of ? ` · as of ${ev.as_of}` : ""}</Tag>
          </div>

          {/* Headline metric */}
          <div style={{ marginTop: 14, padding: "12px 14px", background: C.panel,
            border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint }}>
              Primary metric · false-positive reduction
            </div>
            <div style={{ fontFamily: C.sans, fontSize: 26, fontWeight: 700, color: C.green, marginTop: 4 }}>
              {m!.mean_fp_reduction_pct}% mean
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 3 }}>
              global {pct(m!.global_mean_fp)} → regime-conditioned {pct(m!.regime_conditioned_mean_fp)} ·
              worst regime {pct(m!.global_worst_regime_fp)} → {pct(m!.regime_conditioned_worst_regime_fp)} ({m!.worst_regime_fp_reduction_pct}% reduction)
            </div>
          </div>

          {/* Model card */}
          <SectionLabel>Model card</SectionLabel>
          <Field label="Model family" value={card!.family} />
          <Field label="Training data" value={card!.training_data} />
          <Field label="Evaluation data" value={card!.evaluation_data} />
          <Field label="Baseline" value={card!.baseline} />
          <Field label="Validated method" value={card!.validated_method} />
          <Field label="Primary metric" value={card!.primary_metric} />
          <Field label="Decision informed" value={card!.decision_informed} />

          {/* Per-regime FP */}
          {Array.isArray(ev.per_regime) && ev.per_regime.length > 0 && (
            <>
              <SectionLabel>False positives per operating regime (healthy rows)</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 8, alignItems: "center",
                fontFamily: C.mono, fontSize: 10, color: C.faint, paddingBottom: 6 }}>
                <span>regime</span><span>global (single-mode)</span><span>regime-conditioned</span>
              </div>
              {ev.per_regime.map((r) => (
                <div key={r.regime} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 8,
                  alignItems: "center", padding: "4px 0" }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>#{r.regime}</span>
                  <FpBar value={r.global_fp} color={C.red} />
                  <FpBar value={r.regime_conditioned_fp} color={C.green} />
                </div>
              ))}
            </>
          )}

          {/* Theory */}
          {Array.isArray(ev.theory) && ev.theory.length > 0 && (
            <>
              <SectionLabel>Why this works</SectionLabel>
              <ul style={{ margin: 0, paddingLeft: 16, fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.6 }}>
                {ev.theory.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
              </ul>
            </>
          )}

          {/* Source & lineage */}
          <SectionLabel>Source &amp; lineage (Databricks)</SectionLabel>
          <Field label="Dataset family" value={src!.dataset_family} />
          <Field label="Source table" value={
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {src!.fully_qualified}{src!.fully_qualified && <CopyId text={src!.fully_qualified} />}
            </span>} />
          <Field label="Subset / split" value={src!.subset && src!.split ? `${src!.subset} · ${src!.split}` : undefined} />
          <Field label="Purpose" value={src!.purpose} />
          <Field label="Rows used" value={src!.rows_used_fit != null
            ? `${src!.rows_used_fit.toLocaleString()} fit · ${(src!.rows_used_eval ?? 0).toLocaleString()} held-out eval` : undefined} />
          <Field label="Sensors / units / regimes"
            value={`${ev.n_active_sensors} sensors · ${ev.n_units} units · ${ev.n_regimes} regimes`} />
          <Field label="Full table rowcount" value={src!.table_rowcount} nullReason={src!.table_rowcount_null_reason} />
          <Field label="Last materialized" value={src!.materialized_at} nullReason={src!.materialized_at_null_reason} />
          <Field label="Lineage status" value={ev.lineage_status === "unknown" ? null : ev.lineage_status}
            nullReason={ev.lineage_status_null_reason} />
          <Field label="Compute artifact" value={src!.compute_artifact} />

          {/* Build query excerpt */}
          {ev.source_query && (
            <>
              <SectionLabel>Source query (extraction)</SectionLabel>
              <pre style={{ fontFamily: C.mono, fontSize: 10.5, color: C.dim, lineHeight: 1.5, background: C.panel,
                border: `1px solid ${C.border}`, borderRadius: 7, padding: 12, whiteSpace: "pre-wrap",
                wordBreak: "break-word", margin: 0 }}>{ev.source_query}</pre>
              {ev.source_query_note && (
                <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
                  {ev.source_query_note}
                </div>
              )}
            </>
          )}

          {/* Databricks links + lineage chain */}
          <SectionLabel>Open in Databricks</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <LinkButton link={{ ...silverLink, label: "Open silver_cmapss (Delta)" }} />
            <LinkButton link={{ ...bronzeLink, label: "Open bronze_cmapss (Delta)" }} />
          </div>
          {Array.isArray(ev.lineage) && ev.lineage.length > 0 && (
            <div style={{ marginTop: 12, fontFamily: C.mono, fontSize: 10.5, color: C.dim, lineHeight: 1.7 }}>
              {ev.lineage.map((l, i) => (
                <div key={l.id}>
                  <span style={{ color: C.faint }}>{i > 0 ? "→ " : ""}</span>
                  <span style={{ color: C.text }}>{l.label}</span>
                  <span style={{ color: C.faint }}> · {l.layer}</span>
                  {l.table && <span style={{ color: C.dim }}> · {l.table}</span>}
                  {l.ref && <span style={{ color: C.faint }}> · {l.ref}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Honest caveat */}
          <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 8,
            background: `${C.amber}10`, border: `1px solid ${C.amber}33` }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.amber, lineHeight: 1.6 }}>
              {card!.caveat}
            </span>
          </div>

          {envHref && (
            <a href={`${envHref}/evidence`}
              style={{ display: "inline-block", marginTop: 14, fontFamily: C.mono, fontSize: 11, color: C.cyan,
                textDecoration: "none" }}>
              See the full evidence card (per-regime breakdown, limitations) ›
            </a>
          )}
        </>
      )}
    </DrawerWrapper>
  );
}

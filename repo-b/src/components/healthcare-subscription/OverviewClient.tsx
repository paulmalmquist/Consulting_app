"use client";

/**
 * Healthcare Subscription Analytics — Exec Overview (standalone, no app shell).
 *
 * SYNTHETIC / NO-PHI. Self-contained bespoke design: this component owns its full
 * chrome (background, header, footer) and is intentionally NOT wrapped in any shared
 * workspace shell. Reads the governed KPI strip from /api/hha/v1/overview and renders
 * a metric-definition drawer + freshness/provenance footer.
 */

import { useEffect, useState } from "react";
import {
  fetchHhaOverview,
  type HhaKpi,
  type HhaOverview,
} from "@/lib/healthcare-subscription/client";

// Bespoke health-tech palette (teal accent matches the env template theme tokens).
const C = {
  bg: "#0a1413",
  panel: "#0f1d1b",
  panelHi: "#12302b",
  border: "#1d3a35",
  accent: "#2dd4bf", // teal-400
  accentSoft: "#5eead4",
  text: "#e7f3f1",
  dim: "#8fb3ad",
  faint: "#5b7c77",
  warn: "#fbbf24",
  good: "#34d399",
  bad: "#fb7185",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
};

function fmtValue(k: HhaKpi): string {
  if (k.value == null) return "—";
  const v = k.value;
  switch (k.fmt) {
    case "currency": {
      const abs = Math.abs(v);
      if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (abs >= 10_000) return `$${(v / 1_000).toFixed(0)}K`;
      return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    case "percent":
      return `${(v * 100).toFixed(1)}%`;
    case "ratio":
      return `${v.toFixed(1)}×`;
    case "months":
      return `${v.toFixed(1)} mo`;
    case "count":
      return v.toLocaleString();
    default:
      return String(v);
  }
}

function kpiTone(k: HhaKpi): string {
  // Light directional coloring for a few signal metrics; neutral otherwise.
  if (k.value == null) return C.text;
  if (k.key === "net_churn") return k.value <= 0 ? C.good : C.warn;
  if (k.key === "nrr") return k.value >= 1 ? C.good : C.warn;
  if (k.key === "ltv_cac") return k.value >= 3 ? C.good : C.warn;
  return C.text;
}

function Banner() {
  return (
    <div
      role="note"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "#11302b", border: `1px solid ${C.accent}44`,
        borderRadius: 8, padding: "9px 14px", marginBottom: 18,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: C.accent, boxShadow: `0 0 8px ${C.accent}`, flexShrink: 0 }} />
      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, lineHeight: 1.4 }}>
        <strong style={{ color: C.accentSoft }}>Synthetic demo · no PHI.</strong>{" "}
        Business analytics only — no real patients, no medical advice, diagnosis, or treatment.
      </span>
    </div>
  );
}

function KpiCard({ k, onOpen }: { k: HhaKpi; onOpen: (k: HhaKpi) => void }) {
  return (
    <button
      onClick={() => onOpen(k)}
      style={{
        textAlign: "left", cursor: "pointer", background: C.panel,
        border: `1px solid ${C.border}`, borderRadius: 10, padding: 14,
        display: "flex", flexDirection: "column", gap: 6, transition: "border-color 120ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${C.accent}66`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
      title="View metric definition"
    >
      <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint }}>
        {k.label}
      </span>
      <span style={{ fontFamily: C.sans, fontSize: 24, fontWeight: 600, lineHeight: 1, color: kpiTone(k) }}>
        {fmtValue(k)}
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, opacity: 0.8 }}>{k.definition.grain}</span>
    </button>
  );
}

function Drawer({ k, onClose }: { k: HhaKpi; onClose: () => void }) {
  const d = k.definition;
  const rows: [string, string][] = [
    ["Value", fmtValue(k)],
    ["Formula", d.formula],
    ["Grain", d.grain],
    ["Owner", d.owner],
    ["Source", d.source],
  ];
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 92vw)", height: "100%", background: C.panelHi,
          borderLeft: `1px solid ${C.accent}55`, padding: 24, overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.accent }}>
              Metric definition
            </div>
            <div style={{ fontFamily: C.sans, fontSize: 20, fontWeight: 600, color: C.text, marginTop: 4 }}>{d.label}</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontFamily: C.mono }}>
            ✕
          </button>
        </div>
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.map(([label, val]) => (
            <div key={label}>
              <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint }}>{label}</div>
              <div style={{ fontFamily: label === "Formula" || label === "Source" ? C.mono : C.sans, fontSize: 13.5, color: C.text, marginTop: 3, lineHeight: 1.45 }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
          One definition per metric — the dashboard, the AI layer, and ad-hoc SQL all resolve through this governed definition.
        </div>
      </div>
    </div>
  );
}

export default function OverviewClient({ envId }: { envId: string }) {
  const [data, setData] = useState<HhaOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HhaKpi | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHhaOverview(envId)
      .then((d) => {
        if (!alive) return;
        if (!d) setError("Overview data is not available for this environment yet.");
        else setData(d);
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [envId]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 28px 64px" }}>
        {/* Header */}
        <div style={{ marginBottom: 6, fontFamily: C.mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.accent }}>
          Healthcare Subscription Analytics
        </div>
        <h1 style={{ fontFamily: C.sans, fontSize: 30, fontWeight: 650, margin: "0 0 8px", lineHeight: 1.15 }}>
          The operating layer for a longevity-membership business
        </h1>
        <p style={{ fontFamily: C.sans, fontSize: 14.5, color: C.dim, maxWidth: 760, margin: "0 0 22px", lineHeight: 1.5 }}>
          Membership economics, acquisition funnel, signup-cohort retention, and care-operations
          SLAs — every number read from the serving API, governed by a single metric definition,
          and kept strictly separate from clinical decisioning.
        </p>

        <Banner />

        {/* Body */}
        {loading && (
          <div style={{ fontFamily: C.mono, fontSize: 13, color: C.dim, padding: "40px 0" }}>Loading console…</div>
        )}
        {error && !loading && (
          <div style={{ fontFamily: C.mono, fontSize: 13, color: C.bad, border: `1px solid ${C.bad}44`, borderRadius: 8, padding: 16 }}>
            {error}
          </div>
        )}
        {data && !loading && (
          <>
            <div
              style={{
                display: "grid", gap: 12,
                gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))",
              }}
            >
              {data.kpis.map((k) => (
                <KpiCard key={k.key} k={k} onOpen={setSelected} />
              ))}
            </div>

            {/* Freshness / provenance footer */}
            <div
              style={{
                marginTop: 28, paddingTop: 14, borderTop: `1px solid ${C.border}`,
                display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between",
                fontFamily: C.mono, fontSize: 11, color: C.faint,
              }}
            >
              <span>
                as of {data.as_of_date ?? "—"}
                {data.source_freshness_at ? ` · refreshed ${new Date(data.source_freshness_at).toLocaleString()}` : ""}
              </span>
              <span>{data.provenance_label ?? "synthetic gold rollup"}</span>
            </div>
            <div style={{ marginTop: 8, fontFamily: C.mono, fontSize: 10.5, color: C.faint, opacity: 0.85 }}>
              {data.disclaimer}
            </div>
          </>
        )}
      </div>

      {selected && <Drawer k={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

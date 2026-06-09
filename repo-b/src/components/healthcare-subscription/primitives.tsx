"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type {
  HhaKpi,
  HhaKpiFormat,
  HhaMetricDefinition,
} from "@/lib/healthcare-subscription/client";

export const C = {
  bg: "#0a1413",
  panel: "#0f1d1b",
  panelHi: "#12302b",
  border: "#1d3a35",
  accent: "#2dd4bf",
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

export function formatCurrency(value: number | null): string {
  if (value == null) return "\u2014";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number | null): string {
  return value == null ? "\u2014" : `${(value * 100).toFixed(1)}%`;
}

export function formatCount(value: number | null): string {
  return value == null ? "\u2014" : value.toLocaleString();
}

export function fmtValue(k: HhaKpi): string {
  if (k.value == null) return "\u2014";
  const v = k.value;
  switch (k.fmt) {
    case "currency":
      return formatCurrency(v);
    case "percent":
      return formatPercent(v);
    case "ratio":
      return `${v.toFixed(1)}\u00d7`;
    case "months":
      return `${v.toFixed(1)} mo`;
    case "hours":
      return `${v.toFixed(1)}h`;
    case "count":
      return v.toLocaleString();
    default:
      return String(v);
  }
}

export function metricKpi(
  definition: HhaMetricDefinition,
  value: number | null,
  fmt: HhaKpiFormat,
  unit: string,
): HhaKpi {
  return {
    key: definition.key,
    label: definition.label,
    value,
    fmt,
    unit,
    definition,
  };
}

function kpiTone(k: HhaKpi): string {
  if (k.value == null) return C.text;
  if (k.key === "net_churn") return k.value <= 0 ? C.good : C.warn;
  if (k.key === "nrr") return k.value >= 1 ? C.good : C.warn;
  if (k.key === "ltv_cac") return k.value >= 3 ? C.good : C.warn;
  return C.text;
}

export function Banner() {
  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#11302b",
        border: `1px solid ${C.accent}44`,
        borderRadius: 8,
        padding: "9px 14px",
        marginBottom: 18,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: C.accent,
          boxShadow: `0 0 8px ${C.accent}`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, lineHeight: 1.4 }}>
        <strong style={{ color: C.accentSoft }}>
          Synthetic demo{" \u00b7 "}no PHI.
        </strong>{" "}
        Business analytics only{" \u2014 "}no real patients, no medical advice,
        diagnosis, or treatment.
      </span>
    </div>
  );
}

export function KpiCard({
  k,
  onOpen,
}: {
  k: HhaKpi;
  onOpen: (k: HhaKpi) => void;
}) {
  return (
    <button
      onClick={() => onOpen(k)}
      style={{
        textAlign: "left",
        cursor: "pointer",
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "border-color 120ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${C.accent}66`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
      title="View metric definition"
    >
      <span
        style={{
          fontFamily: C.mono,
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: C.faint,
        }}
      >
        {k.label}
      </span>
      <span
        style={{
          fontFamily: C.sans,
          fontSize: 24,
          fontWeight: 600,
          lineHeight: 1,
          color: kpiTone(k),
        }}
      >
        {fmtValue(k)}
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, opacity: 0.8 }}>
        {k.definition.grain}
      </span>
    </button>
  );
}

export function DefinitionButton({
  label = "Metric definition",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${C.border}`,
        background: C.panel,
        color: C.dim,
        borderRadius: 6,
        padding: "5px 9px",
        cursor: "pointer",
        fontFamily: C.mono,
        fontSize: 10,
      }}
    >
      {label}
    </button>
  );
}

export function Drawer({ k, onClose }: { k: HhaKpi; onClose: () => void }) {
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
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 92vw)",
          height: "100%",
          background: C.panelHi,
          borderLeft: `1px solid ${C.accent}55`,
          padding: 24,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div
              style={{
                fontFamily: C.mono,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: C.accent,
              }}
            >
              Metric definition
            </div>
            <div
              style={{
                fontFamily: C.sans,
                fontSize: 20,
                fontWeight: 600,
                color: C.text,
                marginTop: 4,
              }}
            >
              {d.label}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.dim,
              borderRadius: 6,
              padding: "4px 9px",
              cursor: "pointer",
              fontFamily: C.mono,
            }}
          >
            x
          </button>
        </div>
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.map(([label, value]) => (
            <div key={label}>
              <div
                style={{
                  fontFamily: C.mono,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: C.faint,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontFamily: label === "Formula" || label === "Source" ? C.mono : C.sans,
                  fontSize: 13.5,
                  color: C.text,
                  marginTop: 3,
                  lineHeight: 1.45,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 22,
            paddingTop: 14,
            borderTop: `1px solid ${C.border}`,
            fontFamily: C.mono,
            fontSize: 11,
            color: C.faint,
            lineHeight: 1.5,
          }}
        >
          One definition per metric. Dashboard and ad-hoc analysis resolve through this
          governed definition.
        </div>
      </div>
    </div>
  );
}

export function HhaNav({ envId }: { envId: string }) {
  const pathname = usePathname();
  const base = `/lab/env/${envId}/healthcare-subscription`;
  const items = [
    ["Overview", base],
    ["Funnel", `${base}/funnel`],
    ["Cohorts", `${base}/cohorts`],
    ["Operations", `${base}/operations`],
  ];

  return (
    <nav
      aria-label="Healthcare analytics surfaces"
      style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}
    >
      {items.map(([label, href]) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            style={{
              textDecoration: "none",
              border: `1px solid ${active ? `${C.accent}88` : C.border}`,
              background: active ? `${C.accent}18` : C.panel,
              color: active ? C.accentSoft : C.dim,
              borderRadius: 7,
              padding: "7px 11px",
              fontFamily: C.mono,
              fontSize: 11,
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Footer({
  asOfDate,
  sourceFreshnessAt,
  provenanceLabel,
  disclaimer,
}: {
  asOfDate: string | null;
  sourceFreshnessAt: string | null;
  provenanceLabel: string | null;
  disclaimer: string;
}) {
  return (
    <>
      <div
        style={{
          marginTop: 28,
          paddingTop: 14,
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "space-between",
          fontFamily: C.mono,
          fontSize: 11,
          color: C.faint,
        }}
      >
        <span>
          as of {asOfDate ?? "\u2014"}
          {sourceFreshnessAt
            ? ` \u00b7 refreshed ${new Date(sourceFreshnessAt).toLocaleString()}`
            : ""}
        </span>
        <span>{provenanceLabel ?? "synthetic gold rollup"}</span>
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: C.mono,
          fontSize: 10.5,
          color: C.faint,
          opacity: 0.85,
        }}
      >
        {disclaimer}
      </div>
    </>
  );
}

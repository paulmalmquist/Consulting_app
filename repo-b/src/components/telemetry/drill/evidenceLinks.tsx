"use client";

import { useState } from "react";
import { C } from "../primitives";
import {
  mlflowRunLink,
  registeredModelLink,
  deltaTableLink,
  type ExternalEvidenceLink,
} from "@/lib/lab/factoryEvidenceLinks";

// Self-contained copy chip (the factory drawer's is private to that file; we keep this
// shared component independent of it).
function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => {},
        );
      }}
      style={{
        fontFamily: C.mono, fontSize: 9.5, color: C.dim, background: C.panel,
        border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 6px", cursor: "pointer",
      }}
    >
      {copied ? "copied" : `copy ${text.length > 18 ? `${text.slice(0, 16)}…` : text}`}
    </button>
  );
}

// Shared renderer for a fail-closed external evidence link. Live → an anchor; missing →
// a disabled button + the unavailable reason + a copy chip for the raw id. Mirrors the
// factory drawer's private EvidenceLinkButton so any page can render Databricks/MLflow
// links over the same builders without re-implementing (or fabricating) them.
export function EvidenceLink({ link }: { link: ExternalEvidenceLink }) {
  if (link.href) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 11,
          color: C.cyan, background: `${C.cyan}12`, border: `1px solid ${C.cyan}55`,
          borderRadius: 6, padding: "6px 11px", textDecoration: "none",
        }}
      >
        {link.label} ↗
      </a>
    );
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        disabled
        aria-disabled
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 11,
          color: C.faint, background: C.panel, border: `1px dashed ${C.border}`, borderRadius: 6,
          padding: "6px 11px", cursor: "not-allowed", alignSelf: "flex-start",
        }}
      >
        {link.label}
      </button>
      <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, lineHeight: 1.5, display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span>Unavailable — {link.unavailableReason}</span>
        {link.copyText && <CopyChip text={link.copyText} />}
      </span>
    </span>
  );
}

export function DatabricksRunLink({ runId }: { runId?: string | null }) {
  return <EvidenceLink link={mlflowRunLink(runId)} />;
}

export function ModelArtifactLink({ modelName }: { modelName?: string | null }) {
  return <EvidenceLink link={registeredModelLink(modelName)} />;
}

export function DeltaTableLink({ tableName }: { tableName?: string | null }) {
  return <EvidenceLink link={deltaTableLink(tableName)} />;
}

// Inline "open lineage" affordance. The caller supplies either an `href` (deep-link to
// the Metric Lineage explorer) or an `onClick` (open a LineageDrawer in place). When
// neither is available it renders fail-closed (disabled + reason), never a dead link.
export function LineageLink({
  href,
  onClick,
  label = "Open lineage",
  unavailableReason,
}: {
  href?: string | null;
  onClick?: () => void;
  label?: string;
  unavailableReason?: string | null;
}) {
  const style = {
    display: "inline-flex" as const, alignItems: "center" as const, gap: 6,
    fontFamily: C.mono, fontSize: 11, borderRadius: 6, padding: "6px 11px",
  };
  if (href) {
    return (
      <a href={href} style={{ ...style, color: C.cyan, background: `${C.cyan}12`, border: `1px solid ${C.cyan}55`, textDecoration: "none" }}>
        {label} →
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ ...style, color: C.cyan, background: `${C.cyan}12`, border: `1px solid ${C.cyan}55`, cursor: "pointer" }}>
        {label} →
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button type="button" disabled aria-disabled style={{ ...style, color: C.faint, background: C.panel, border: `1px dashed ${C.border}`, cursor: "not-allowed", alignSelf: "flex-start" }}>
        {label}
      </button>
      <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint }}>
        Unavailable — {unavailableReason ?? "no lineage node for this metric"}
      </span>
    </span>
  );
}

"use client";

import { useEffect } from "react";
import type { EvidencePayload } from "@/lib/historyrhymes/evidence";
import { C, Tag } from "./primitives";

// Zone 6 — the evidence drawer. Clicking a regime header, signal tile, analog
// track, alert card, or scenario panel opens the receipts: the field list
// (null fields show their nullReason, never a blank row), the request_id when
// the source was a match response, and the raw source JSON collapsed at the
// bottom. This drawer is what makes the visualization trustworthy — every
// number on the cockpit can answer "where did you come from".

export interface EvidenceDrawerProps {
  evidence: EvidencePayload | null;
  onClose: () => void;
}

export function EvidenceDrawer({ evidence, onClose }: EvidenceDrawerProps) {
  useEffect(() => {
    if (!evidence) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [evidence, onClose]);

  if (!evidence) return null;

  return (
    <div data-testid="hr-evidence-drawer" style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <button type="button" aria-label="Close evidence" data-testid="hr-evidence-backdrop" onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer" }} />
      <aside className="w-full max-w-md"
        style={{ position: "absolute", right: 0, top: 0, height: "100%", overflowY: "auto",
          background: C.rail, borderLeft: `1px solid ${C.borderHi}`, padding: "20px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
          <Tag color={C.accent}>{evidence.kind}</Tag>
          <button type="button" data-testid="hr-evidence-close" onClick={onClose} aria-label="Close"
            style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, background: "transparent",
              border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
            close
          </button>
        </div>
        <h2 style={{ fontFamily: C.sans, fontSize: 18, fontWeight: 700, color: C.text, margin: "8px 0 16px" }}>
          {evidence.title}
        </h2>

        <dl style={{ margin: 0 }}>
          {evidence.fields.map((f) => (
            <div key={f.label} data-testid="hr-evidence-field"
              style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "7px 0",
                borderBottom: `1px solid ${C.border}` }}>
              <dt style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", color: C.faint, textTransform: "uppercase", flexShrink: 0 }}>
                {f.label}
              </dt>
              <dd style={{ fontFamily: C.mono, fontSize: 11, margin: 0, textAlign: "right",
                color: f.value === null ? C.amber : C.dim, overflowWrap: "anywhere" }}>
                {f.value === null ? `— ${f.nullReason ?? "unavailable"}` : f.value}
              </dd>
            </div>
          ))}
        </dl>

        {evidence.requestId && (
          <div data-testid="hr-evidence-request-id"
            style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 12 }}>
            request: {evidence.requestId}
          </div>
        )}

        {evidence.raw != null && (
          <details data-testid="hr-evidence-raw" style={{ marginTop: 16 }}>
            <summary style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.faint,
              textTransform: "uppercase", cursor: "pointer" }}>
              raw JSON
            </summary>
            <pre style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, lineHeight: 1.6,
              whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: C.panel,
              border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginTop: 8 }}>
              {JSON.stringify(evidence.raw, null, 2)}
            </pre>
          </details>
        )}
      </aside>
    </div>
  );
}

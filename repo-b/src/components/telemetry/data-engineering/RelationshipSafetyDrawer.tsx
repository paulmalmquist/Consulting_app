"use client";

import { C, Tag } from "../primitives";
import { DrawerWrapper, DrawerHeader, FieldRow } from "../drawerPrimitives";
import {
  VERDICT_LABEL,
  type SafetyResult,
  type SafetyVerdict,
} from "@/lib/telemetry/relationshipSafety";
import type { TelemetryMetadataNode } from "@/lib/telemetry/metadata";

// Right-side drawer explaining a single relationship's safety verdict: grain on both sides, keys,
// confidence, the reasons, and the recommended bridge path. Pure presentation over a SafetyResult —
// it invents nothing; "not declared" is shown wherever the catalog has no value.

export function verdictColor(v: SafetyVerdict): string {
  if (v === "safe") return C.green;
  if (v === "bridge_required") return C.amber;
  if (v === "unsafe") return C.red;
  return C.faint; // unverifiable
}

function keyList(keys: string[] | null) {
  return keys && keys.length ? keys.join(", ") : null;
}

export default function RelationshipSafetyDrawer({
  open,
  result,
  source,
  target,
  onClose,
}: {
  open: boolean;
  result: SafetyResult | null;
  source: TelemetryMetadataNode | null;
  target: TelemetryMetadataNode | null;
  onClose: () => void;
}) {
  return (
    <DrawerWrapper open={open} onClose={onClose}>
      {result && (
        <>
          <DrawerHeader
            title={`${source?.label ?? "?"} → ${target?.label ?? "?"}`}
            description={`Relationship: ${result.relationship.replace(/_/g, " ")}`}
            closeLabel="Close relationship safety"
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
            <Tag color={verdictColor(result.verdict)}>{VERDICT_LABEL[result.verdict]}</Tag>
            <Tag color={result.confidence === "explicit" ? C.cyan : C.amber}>{result.confidence}</Tag>
          </div>

          {/* Why this verdict — every line is evidence-grounded. */}
          <section style={{ marginTop: 18 }} aria-label="Verdict reasons">
            <div style={{ fontFamily: C.mono, color: C.faint, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Why
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {result.reasons.map((r, i) => (
                <li key={i} style={{ fontFamily: C.mono, fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>{r}</li>
              ))}
            </ul>
            {result.nullReason && (
              <div style={{ marginTop: 10, fontFamily: C.mono, fontSize: 11, color: C.amber }}>
                null_reason: {result.nullReason}
              </div>
            )}
          </section>

          {/* The evidence the verdict was (or wasn't) built from. */}
          <section style={{ marginTop: 18 }} aria-label="Evidence">
            <div style={{ fontFamily: C.mono, color: C.faint, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              Evidence
            </div>
            <FieldRow label="Source grain" value={result.sourceGrain} />
            <FieldRow label="Target grain" value={result.targetGrain} />
            <FieldRow label="Source primary key" value={keyList(result.sourcePrimaryKey)} />
            <FieldRow label="Target primary key" value={keyList(result.targetPrimaryKey)} />
            <FieldRow label="Foreign key link" value={result.foreignKeyLink} />
            <FieldRow label="Source status" value={source?.status ?? null} />
            <FieldRow label="Target status" value={target?.status ?? null} />
          </section>

          {/* Recommended bridge (only when a bridge is required). */}
          {result.verdict === "bridge_required" && result.bridgePath && (
            <section style={{ marginTop: 18 }} aria-label="Recommended bridge">
              <div style={{ fontFamily: C.mono, color: C.faint, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                Recommended bridge
              </div>
              <div style={{ border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 8, padding: "10px 12px", fontFamily: C.mono, fontSize: 11.5, color: C.dim, lineHeight: 1.55 }}>
                {result.bridgePath}
              </div>
            </section>
          )}

          <div style={{ marginTop: 16, fontFamily: C.mono, fontSize: 9, color: C.faint, lineHeight: 1.6 }}>
            Verdict derived from telemetry metadata catalog fields only (grain, keys, status, edge
            confidence). A safe verdict requires a declared foreign key or matching declared grain;
            absent that, the verdict fails closed to unverifiable — never &ldquo;safe.&rdquo;
          </div>
        </>
      )}
    </DrawerWrapper>
  );
}

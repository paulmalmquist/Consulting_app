"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  C, Panel, Tag, Loading, ErrorState, EmptyState, PageHeading, InlineCode,
} from "./primitives";

// ===========================================================================
// Evidence-card contract. Every resume-claim evidence surface answers the same
// questions in the same order so the page scans as one system:
//   title · thesis role (operational question) · source status · as-of ·
//   core metrics (children) · method · claim boundary · null_reason ·
//   detail link · provenance.
//
// This is a presentational FRAME. Cards still own their own fetch; they pass the
// resolved state in. Fail-closed is built in: a nullReason renders the designed
// EmptyState, an error renders ErrorState, loading renders Loading — the card
// body never shows partial/seeded data.
// ---------------------------------------------------------------------------

export type EvidenceSourceTone = "live" | "computed" | "recorded" | "static" | "unavailable";

const SOURCE_TONE_COLOR: Record<EvidenceSourceTone, string> = {
  live: C.green,
  computed: C.cyan,
  recorded: C.amber,
  static: C.dim,
  unavailable: C.faint,
};

export interface EvidenceContract {
  /** Card title (the claim, plainly). */
  title: string;
  /** Operational question / why this matters — the thesis role. */
  thesisRole: string;
  /** Source status chip, e.g. {label: "recorded capture", tone: "recorded"}. */
  sourceStatus?: { label: string; tone?: EvidenceSourceTone };
  /** As-of / last-updated marker (already formatted). */
  asOf?: string;
  /** How the number was produced (method line). */
  method?: ReactNode;
  /** What must NOT be over-read (claim boundary). */
  claimBoundary?: ReactNode;
  /** Provenance / artifact reference (table, run id, source). */
  provenance?: ReactNode;
  /** Link to a detail page or source. */
  detail?: { href: string; label: string };
}

function SourceChip({ status }: { status: NonNullable<EvidenceContract["sourceStatus"]> }) {
  return <Tag color={SOURCE_TONE_COLOR[status.tone ?? "static"]}>{status.label}</Tag>;
}

// The standardized evidence-card frame. `children` is the core-metrics body.
export function TelemetryEvidenceCard({
  contract, loading, error, nullReason, children,
}: {
  contract: EvidenceContract;
  loading?: boolean;
  error?: string | null;
  /** When set, the card fails closed with this exact reason (kept verbatim). */
  nullReason?: string | null;
  children?: ReactNode;
}) {
  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontFamily: C.sans, fontSize: 16, fontWeight: 600, color: C.text }}>{contract.title}</div>
        <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.dim, marginTop: 5, lineHeight: 1.5, maxWidth: 640 }}>
          {contract.thesisRole}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {contract.sourceStatus && <SourceChip status={contract.sourceStatus} />}
        {contract.asOf && <InlineCode color={C.faint}>{contract.asOf}</InlineCode>}
      </div>
    </div>
  );

  let body: ReactNode;
  if (error) {
    body = <ErrorState message={error} />;
  } else if (loading) {
    body = <Loading label="Loading evidence…" />;
  } else if (nullReason) {
    body = <EmptyState label="Evidence unavailable" hint={nullReason} />;
  } else {
    body = (
      <>
        {children}
        {(contract.method || contract.claimBoundary) && (
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 14, paddingTop: 12,
            display: "flex", flexDirection: "column", gap: 8 }}>
            {contract.method && (
              <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>
                <span style={{ color: C.dim }}>Method. </span>{contract.method}
              </div>
            )}
            {contract.claimBoundary && (
              <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>
                <span style={{ color: C.dim }}>Claim boundary. </span>{contract.claimBoundary}
              </div>
            )}
          </div>
        )}
        {(contract.provenance || contract.detail) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            flexWrap: "wrap", marginTop: 12 }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>
              {contract.provenance && <><span style={{ color: C.dim }}>Provenance. </span>{contract.provenance}</>}
            </span>
            {contract.detail && (
              <Link href={contract.detail.href}
                style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, textDecoration: "none", flexShrink: 0 }}>
                {contract.detail.label} →
              </Link>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <Panel>
      {header}
      <div style={{ marginTop: 14 }}>{body}</div>
    </Panel>
  );
}

// Editorial section heading for an evidence page (delegates to PageHeading so
// there is one heading implementation).
export function EvidencePageHeading(props: Parameters<typeof PageHeading>[0]) {
  return <PageHeading {...props} />;
}

"use client";

// System Health — consolidates the two operational surfaces (Monitoring + Spike Inspector) into
// one page so an operator has a single place for "is the platform healthy?". Both sub-surfaces are
// already real_backend and fail closed; this composes them (embedded, no duplicate chrome) under
// section dividers. Finer Data/Models/Agents/Infrastructure quadranting + RS polish is a later phase.

import { C, DisclosureFooter, PageHeading } from "./primitives";
import Monitoring from "./Monitoring";
import SpikeInspector from "./SpikeInspector";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "22px 0 12px",
      }}
    >
      <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint, whiteSpace: "nowrap" }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

export default function SystemHealth({ envId }: { envId: string }) {
  return (
    <>
      <PageHeading
        eyebrow="Operations"
        title="System Health"
        blurb="One operational view: data freshness and drift, model serving health, and the analyzer's findings. Real serving reads only — each panel fails closed (a dash or an explicit null_reason), never a fabricated value."
      />

      <SectionLabel>Data &amp; infrastructure — drift, serving, stream health</SectionLabel>
      <Monitoring embedded />

      <SectionLabel>Agents &amp; findings — analyzer dispositions (evaluate-only)</SectionLabel>
      <SpikeInspector envId={envId} embedded />

      <DisclosureFooter />
    </>
  );
}

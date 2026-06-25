"use client";

import { C, DisclosureFooter } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import TelemetryArchitectureMap, { KnownLimitationsPanel } from "./TelemetryArchitectureMap";

// "How This Works" — the telemetry system-architecture exhibit. A faithful React port of the
// standalone "Winston Telemetry Architecture" diagram: a tabbed, pan/zoom node map over eight
// pipeline lanes (NASA/Databricks RUL, operational serving, ISS/ADS-B streaming, Stargate Kafka,
// RS Factory thread, Factory ML, NCR intelligence, AI Copilot & Control Tower), with a
// click-a-node plain-English story drawer, status + serving-tech legends, and a consolidated
// known-limitations list. Honest by construction: node statuses are truth classes, deep-links
// only exist where a real surface does (telemetryArchitectureData.test.ts enforces this).

export default function HowItWorks({ envId }: { envId: string }) {
  return (
    <div>
      <TelemetryPageHeader
        variant="evidence"
        eyebrow="System Architecture"
        title="Winston Telemetry Platform"
        description="Data · ML · Streaming · Serving · Governance — a truth-bounded map of the whole platform. Click a lane to read it; click a node for the plain-English story: what it is, which system runs it, whether it is real-and-live, real-over-synthetic, committed evidence, optional, or planned — and a link to the live surface where one exists."
      />

      <TelemetryArchitectureMap envId={envId} />

      <div style={{ marginTop: 8 }}>
        <KnownLimitationsPanel />
      </div>

      <div style={{ marginTop: 4 }}>
        <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 18 }}>
          The map is a visual explanation of verified system structure, not a simulator — nothing here
          executes and no live value is fetched. Every node names a real source, service, table, or topic.
        </p>
      </div>

      <DisclosureFooter />
    </div>
  );
}

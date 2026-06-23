"use client";

// Overview — the launch-history landing. Leads straight into the Spaceflight Bottleneck Map: the
// launch-attempts timeline, who-flies commercial-vs-government, the cost-to-LEO curve, the pinned
// event record, and presenter mode. The Bottleneck Map is a static public-data context module (no
// API). No KPI strip and no executive "readiness"/"projection" scaffolding here — just the charts.

import Link from "next/link";
import { C, PageHeading, DisclosureFooter } from "./primitives";
import BottleneckMap from "./context/BottleneckMap/BottleneckMap";

export default function TelemetryOverview({ envId }: { envId: string }) {
  return (
    <>
      <PageHeading eyebrow="Overview"
        title="Why launch became a data problem"
        blurb="Every era of spaceflight solved the previous bottleneck and exposed a new one — today it is decision velocity. The live telemetry platform that addresses it is in the tabs at left; the launch-history charts below frame why it matters."
        right={
          <Link href={`/lab/env/${envId}/telemetry/metric-lineage`}
            style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.bg, background: C.cyan,
              border: "none", borderRadius: 8, padding: "10px 18px", textDecoration: "none" }}>
            Trace lineage →
          </Link>
        } />

      {/* Spaceflight Bottleneck Map: launch timeline, commercial-vs-government, cost-to-LEO, event
          record, and presenter mode. Static public-data context module. */}
      <section aria-label="Spaceflight bottleneck — launch history">
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.dim,
          textTransform: "uppercase", marginBottom: 12 }}>
          Context · why launch became a data problem
        </div>
        <BottleneckMap />
      </section>

      <DisclosureFooter />
    </>
  );
}

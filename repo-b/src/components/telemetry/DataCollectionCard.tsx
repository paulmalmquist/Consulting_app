"use client";

// Data Collection / Methodology layer — the bridge between the "why launch became a
// data problem" thesis and the proof cards below it. This is a METHODOLOGY explainer:
// it names the data types a modern launch/test program depends on and ties each to the
// operational decision it changes. It claims no metrics and presents no live values —
// it is the framework, labeled as such, that the rest of the evidence page proves out.

import { C, PageHeading, Panel, ScrollTable, Tag } from "./primitives";

type Row = { type: string; collected: string; affects: string };

const DATA_TYPES: Row[] = [
  { type: "Telemetry streams", collected: "protobuf-over-Kafka, windowed in flight, ring-buffered",
    affects: "real-time test abort / review calls" },
  { type: "Sensor channels", collected: "per-channel residuals + rolling features (no look-ahead)",
    affects: "anomaly detection & per-channel attribution" },
  { type: "Test-stand data", collected: "recorded capture replayed through the live bridge",
    affects: "hot-fire go/no-go and post-test review" },
  { type: "Manufacturing / quality records", collected: "NCR corpus + clustering + backlog forecast",
    affects: "manufacturing feedback loops & build quality" },
  { type: "Model predictions", collected: "anomaly score + RUL with conformal intervals",
    affects: "model confidence & launch-readiness margin" },
  { type: "Anomaly events", collected: "threshold-routed to their own topic + labeled events",
    affects: "anomaly investigation & root-cause" },
  { type: "Lineage / source records", collected: "governed metric catalog + provenance per number",
    affects: "whether a number is trusted enough to act on" },
  { type: "Operator decisions & receipts", collected: "GO/REVIEW/NO-GO verdicts + Ed25519 signed receipts",
    affects: "auditable reliability improvement over time" },
];

export default function DataCollectionCard() {
  return (
    <>
      <PageHeading eyebrow="Data collection · methodology"
        title="What modern launch operations actually run on"
        blurb="Increasing vehicle complexity, reuse, rapid iteration, and higher cadence make telemetry and operational data central to launch reliability — not a side effect of it. This is the data a modern test/build/launch program depends on, and the decision each type changes. (Framework, not live metrics — the cards below prove each one out.)" />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Tag color={C.dim}>static framework · methodology (not evidence-tier)</Tag>
      </div>
      <Panel title="Data type → what it changes" pad={0}>
        <ScrollTable minWidth={640}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.sans, fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: C.faint, textAlign: "left" }}>
                {["Data type", "How it is collected", "What it changes"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
                    fontFamily: C.mono, fontSize: 10.5, fontWeight: 500, textTransform: "uppercase",
                    letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DATA_TYPES.map((r) => (
                <tr key={r.type} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px 14px", color: C.text, fontWeight: 600 }}>{r.type}</td>
                  <td style={{ padding: "10px 14px", color: C.dim }}>{r.collected}</td>
                  <td style={{ padding: "10px 14px", color: C.cyan }}>{r.affects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </Panel>
    </>
  );
}

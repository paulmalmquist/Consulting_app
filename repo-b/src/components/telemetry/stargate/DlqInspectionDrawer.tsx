"use client";

// Dead-letter inspection drawer - parity with the anomaly inspection drawer. A dead letter is a payload the
// bridge could not decode; this shows its full record (topic, reason, byte size, full raw preview, time) so a
// corrupted payload is auditable, not a one-line ticker entry. Routed here instead of crashing ingestion -
// bad data is visible and fail-closed, never silently dropped.

import * as Dialog from "@radix-ui/react-dialog";

import { C, Tag } from "../primitives";
import type { DlqRow } from "@/lib/lab/stargateStream";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "baseline",
      padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export default function DlqInspectionDrawer({ row, onClose }: {
  row: DlqRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 70 }} />
        <Dialog.Content
          className="fixed bottom-0 left-0 right-0 z-[80] max-h-[88vh] rounded-t-xl lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-screen lg:max-h-none lg:w-[460px] lg:rounded-none lg:rounded-l-xl"
          style={{ background: C.rail, border: `1px solid ${C.borderHi}`, color: C.text,
            overflowY: "auto", padding: 20, boxShadow: "-18px 0 50px rgba(0,0,0,0.38)" }}
        >
          {row && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <Dialog.Title style={{ fontFamily: C.sans, fontSize: 18, fontWeight: 700 }}>
                    Dead letter inspection
                  </Dialog.Title>
                  <Dialog.Description style={{ color: C.dim, fontFamily: C.mono, fontSize: 10,
                    lineHeight: 1.5, marginTop: 6 }}>
                    {new Date(row.ts_ms).toLocaleTimeString([], { hour12: false })} · routed, not dropped
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button type="button" aria-label="Close dead letter inspection"
                    style={{ width: 36, height: 36, borderRadius: 7, border: `1px solid ${C.borderHi}`,
                      background: C.panel, color: C.dim, cursor: "pointer", flexShrink: 0 }}>x</button>
                </Dialog.Close>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
                <Tag color={C.red}>{row.reason}</Tag>
                <Tag color={C.dim}>{row.raw_bytes}B</Tag>
              </div>

              <div style={{ marginTop: 16 }}>
                <Row label="Reason" value={row.reason} />
                <Row label="Topic" value={row.topic || "not available - topic not on the dead-letter record"} />
                <Row label="Raw bytes" value={`${row.raw_bytes}B`} />
                <Row label="Received" value={new Date(row.ts_ms).toLocaleString([], { hour12: false })} />
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.1em",
                  textTransform: "uppercase", marginBottom: 6 }}>Raw payload preview</div>
                <pre style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.5,
                  background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7, padding: 12,
                  whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                  {row.raw_preview || "not available - no preview captured"}
                </pre>
              </div>

              <p style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6, marginTop: 14 }}>
                This payload could not be decoded against the protobuf schema, so it was routed to the dead
                letter queue rather than crashing ingestion. Bad data is visible and fails closed; it is never
                silently discarded.
              </p>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

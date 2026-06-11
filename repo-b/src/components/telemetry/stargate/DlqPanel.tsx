"use client";

// Dead-letter feed: every payload the bridge could not decode, with reason and
// a raw-bytes preview. The panel border flares red while entries are arriving
// — bad data is routed and visible, never silently dropped.

import { C, Panel, Tag } from "../primitives";
import type { DlqRow } from "@/lib/lab/stargateStream";

function fmtTime(tsMs: number): string {
  return new Date(tsMs).toLocaleTimeString([], { hour12: false });
}

export default function DlqPanel({ rows, count }: { rows: DlqRow[]; count: number }) {
  const newestMs = rows.length ? rows[rows.length - 1].ts_ms : 0;
  const hot = newestMs > 0 && Date.now() - newestMs < 3000;
  return (
    <Panel
      title="Dead letter queue"
      right={<Tag color={count > 0 ? C.red : C.green}>{count} routed</Tag>}
      style={hot ? { borderColor: C.red, boxShadow: `0 0 14px ${C.red}33` } : undefined}
      pad={0}
    >
      {rows.length === 0 ? (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, padding: 14 }}>
          No dead letters. Corrupted payloads will be routed here instead of crashing ingestion.
        </div>
      ) : (
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {[...rows].reverse().map((row, i) => (
            <div key={`${row.ts_ms}-${i}`} style={{ display: "flex", gap: 12, alignItems: "baseline",
              padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, flexShrink: 0 }}>{fmtTime(row.ts_ms)}</span>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.red, flexShrink: 0 }}>{row.reason}</span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.raw_bytes}B · {row.raw_preview}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

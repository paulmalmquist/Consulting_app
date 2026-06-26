"use client";

// Dead-letter feed: every payload the bridge could not decode, with reason and
// a raw-bytes preview. The panel border flares red while entries are arriving
// — bad data is routed and visible, never silently dropped.

import { C, Panel, Tag } from "../primitives";
import type { DlqRow } from "@/lib/lab/stargateStream";
import { ExportToCsvButton } from "../drill";
import { DLQ_EXPORT_COLUMNS, dlqExportRows } from "./streamExportRows";

function fmtTime(tsMs: number): string {
  return new Date(tsMs).toLocaleTimeString([], { hour12: false });
}

export default function DlqPanel({ rows, count, onInspect }: {
  rows: DlqRow[]; count: number; onInspect?: (row: DlqRow) => void;
}) {
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
            <button key={`${row.ts_ms}-${i}`} type="button"
              onClick={onInspect ? () => onInspect(row) : undefined}
              aria-label={onInspect ? `Inspect dead letter: ${row.reason}` : undefined}
              style={{ display: "flex", gap: 12, alignItems: "baseline", width: "100%", textAlign: "left",
                background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                padding: "8px 14px", cursor: onInspect ? "pointer" : "default" }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, flexShrink: 0 }}>{fmtTime(row.ts_ms)}</span>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.red, flexShrink: 0 }}>{row.reason}</span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.raw_bytes}B · {row.raw_preview}
              </span>
            </button>
          ))}
        </div>
      )}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, display: "flex",
        alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint }}>
          {count} routed · real SSE rows over a recorded-capture replay
        </span>
        <ExportToCsvButton filename="stargate_dead_letters" columns={DLQ_EXPORT_COLUMNS}
          rows={dlqExportRows(rows)} label="Export CSV" disabledReason="No dead letters" />
      </div>
    </Panel>
  );
}

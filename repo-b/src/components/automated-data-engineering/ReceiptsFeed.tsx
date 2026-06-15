"use client";

import { useEffect, useState } from "react";
import {
  getReceipts, ADE_DEFAULT_BUSINESS_ID, type ReceiptsResponse, type ReceiptRow,
} from "@/lib/automated-data-engineering/api";
import {
  C, Panel, Tag, PageHeading, Loading, ErrorState, EmptyState, UnavailableState,
  Drawer, DrawerRow,
} from "./primitives";

// Audit receipt feed. Each row is a recorded tool execution from the existing
// audit trail; the drawer shows every field we have for the selected receipt.
// When the audit read path cannot serve scoped rows, the backend returns a
// null_reason and we render it instead of inventing data.

function rowStatusColor(status: string): string {
  if (status === "success" || status === "ok") return C.green;
  if (status === "error" || status === "failed" || status === "failure") return C.red;
  return C.amber;
}

function ReceiptDrawer({ receipt, onClose }: { receipt: ReceiptRow; onClose: () => void }) {
  return (
    <Drawer title={receipt.tool_name} eyebrow="Execution receipt" onClose={onClose}>
      <DrawerRow label="Tool" value={receipt.tool_name} />
      <DrawerRow label="Status" value={<Tag color={rowStatusColor(receipt.status)}>{receipt.status}</Tag>} />
      <DrawerRow label="Permission mode" value={receipt.permission_mode} />
      <DrawerRow label="Latency" value={receipt.latency_ms != null ? `${receipt.latency_ms} ms` : null} />
      <DrawerRow label="Actor" value={receipt.actor} />
      <DrawerRow label="Recorded at" value={receipt.created_at} />
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 14 }}>
        Redaction is applied when the receipt is written, per the tool&apos;s audit policy.
        This view reads the stored record as-is.
      </p>
    </Drawer>
  );
}

export default function ReceiptsFeed({ envId }: { envId: string }) {
  const [data, setData] = useState<ReceiptsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReceiptRow | null>(null);

  useEffect(() => {
    getReceipts(envId, ADE_DEFAULT_BUSINESS_ID).then(setData).catch((e) => setError(String(e)));
  }, [envId]);

  const heading = (
    <PageHeading eyebrow="Evidence" title="Execution Receipts"
      blurb="Recorded tool executions from the audit trail: what ran, in what permission mode, by whom, and when. Click a row for the stored fields. If scoped audit reads are unavailable, the reason is shown — never substitute data." />
  );

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!data) return <>{heading}<Loading label="Loading receipts…" /></>;
  if (data.null_reason) return <>{heading}<UnavailableState nullReason={data.null_reason} /></>;
  if (data.runs.length === 0) {
    return <>{heading}<EmptyState label="No receipts yet" hint="The audit read path responded but no executions are recorded for this scope." /></>;
  }

  const grid = "1.6fr 0.7fr 0.9fr 0.6fr 0.8fr 1fr";

  return (
    <>
      {heading}
      <Panel title="Recent executions" right={<Tag color={C.accent}>{data.runs.length} receipts</Tag>}>
        <div className="hidden sm:grid" style={{ gridTemplateColumns: grid, gap: 8, fontFamily: C.mono, fontSize: 10,
          color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", paddingBottom: 8 }}>
          <span>Tool</span><span>Status</span><span>Permission</span><span>Latency</span><span>Actor</span><span>Recorded</span>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, maxHeight: 620, overflowY: "auto" }}>
          {data.runs.map((r, i) => (
            <button key={`${r.tool_name}-${r.created_at}-${i}`} type="button" onClick={() => setSelected(r)}
              className="grid grid-cols-2 sm:grid-cols-[1.6fr_0.7fr_0.9fr_0.6fr_0.8fr_1fr]"
              style={{ width: "100%", gap: 8, alignItems: "center", textAlign: "left",
                fontFamily: C.mono, fontSize: 12, color: C.text, padding: "8px 0",
                background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                cursor: "pointer" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.tool_name}</span>
              <span><Tag color={rowStatusColor(r.status)}>{r.status}</Tag></span>
              <span style={{ color: C.dim }}>{r.permission_mode}</span>
              <span style={{ color: C.dim }}>{r.latency_ms != null ? `${r.latency_ms} ms` : "—"}</span>
              <span style={{ color: C.dim }}>{r.actor ?? "—"}</span>
              <span style={{ color: C.faint }}>{r.created_at ?? "—"}</span>
            </button>
          ))}
        </div>
      </Panel>

      {selected && <ReceiptDrawer receipt={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

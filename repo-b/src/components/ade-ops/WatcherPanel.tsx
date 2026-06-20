"use client";

import { useEffect, useState } from "react";

import type { WatcherResult, WatcherVerdictName } from "@/lib/ade-ops/api";
import { getWatchState } from "@/lib/ade-ops/api";

import { C, Panel, Tag } from "./primitives";

// PR 6A surface: post-change watcher. Per executed change, shows a verdict and
// the evidence behind it. The watcher evaluates and recommends — it never rolls
// back. The UI distinguishes simulated vs live non-prod vs unavailable evidence.

function verdictColor(v: WatcherVerdictName): string {
  if (v === "accepted") return C.green;
  if (v === "still_observing") return C.accent;
  if (v === "degraded") return C.amber;
  if (v === "rollback_recommended") return C.red;
  return C.faint; // insufficient_evidence
}

function verdictLabel(v: WatcherVerdictName): string {
  return v.replace(/_/g, " ");
}

function modeTag(mode: WatcherResult["execution_mode"]) {
  if (mode === "simulation") return <Tag color={C.violet}>Simulated</Tag>;
  if (mode === "nonprod") return <Tag color={C.red}>Live · non-prod</Tag>;
  return <Tag color={C.faint}>Unknown mode</Tag>;
}

function WatchRow({ w }: { w: WatcherResult }) {
  return (
    <div
      data-testid="watch-row"
      style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8,
        background: C.panel }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {modeTag(w.execution_mode)}
          <Tag color={verdictColor(w.verdict)}>{verdictLabel(w.verdict)}</Tag>
        </div>
        {w.window_open != null && (
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>
            {w.window_open ? "window open" : "window closed"}
          </span>
        )}
      </div>
      {w.finding && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 6 }}>{w.finding}</div>
      )}
      {w.recommendation && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.text, marginTop: 4 }}>
          {w.recommendation}
        </div>
      )}
      {/* Evidence is unavailable when there's no observation signal yet — say so. */}
      {w.evidence.length === 0 && (
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 4 }}>
          evidence unavailable
        </div>
      )}
      {w.null_reason && (
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 4 }}>{w.null_reason}</div>
      )}
    </div>
  );
}

export function WatcherPanel({ businessId, envId }: { businessId: string; envId?: string }) {
  const [items, setItems] = useState<WatcherResult[] | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getWatchState(businessId, envId)
      .then((r) => { if (live) { setItems(r.watching); setNullReason(r.null_reason); } })
      .catch(() => { if (live) { setItems([]); setNullReason("watch_state_unavailable"); } });
    return () => { live = false; };
  }, [businessId, envId]);

  return (
    <Panel title="Post-change watcher">
      <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginBottom: 10 }}>
        The watcher evaluates executed changes during their observation window and
        recommends accept / keep watching / rollback. It never rolls back automatically —
        a rollback recommendation is an artifact for a human to act on.
      </div>
      {items === null && <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading…</div>}
      {items !== null && items.length === 0 && (
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>
          No executed changes under observation{nullReason ? ` (${nullReason})` : ""}.
        </div>
      )}
      {items?.map((w, i) => <WatchRow key={w.approval_id ?? i} w={w} />)}
    </Panel>
  );
}

"use client";

import { useEffect, useState } from "react";

import type { Incident, IncidentStateName } from "@/lib/ade-ops/api";
import { getIncidents } from "@/lib/ade-ops/api";

import { C, Panel, Tag } from "./primitives";

// PR 6B surface: governed incidents opened from watcher degraded / rollback-
// recommended verdicts. Shows current state + linked receipts/evidence. Incidents
// are records + remediation artifacts — ADE Ops never rolls back a provider here.

function stateColor(s: IncidentStateName): string {
  if (s === "closed" || s === "resolved") return C.green;
  if (s === "mitigation_planned") return C.accent;
  if (s === "owner_notified" || s === "triaged") return C.amber;
  return C.red; // detected
}

function sevColor(sev: Incident["severity"]): string {
  if (sev === "critical" || sev === "high") return C.red;
  if (sev === "medium") return C.amber;
  return C.dim;
}

function IncidentRow({ inc }: { inc: Incident }) {
  return (
    <div
      data-testid="incident-row"
      style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8,
        background: C.panel }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{inc.title}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <Tag color={sevColor(inc.severity)}>{inc.severity}</Tag>
          <Tag color={stateColor(inc.state)}>{inc.state.replace(/_/g, " ")}</Tag>
        </div>
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 6 }}>
        from {inc.source_verdict ?? "—"} · {inc.provider ?? "—"}:{inc.target_ref ?? "—"}
        {inc.owner ? ` · owner ${inc.owner}` : ""}
      </div>
      {inc.mitigation_plan && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.text, marginTop: 4 }}>
          plan: {inc.mitigation_plan}
        </div>
      )}
      {inc.resolution_note && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.green, marginTop: 4 }}>
          resolution: {inc.resolution_note}
        </div>
      )}
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 4 }}>
        {inc.approval_id ? `approval ${inc.approval_id.slice(0, 8)}… · ` : ""}
        evidence: {inc.evidence.length}
      </div>
    </div>
  );
}

export function IncidentsPanel({ businessId, envId }: { businessId: string; envId?: string }) {
  const [items, setItems] = useState<Incident[] | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getIncidents(businessId, envId)
      .then((r) => { if (live) { setItems(r.incidents); setNullReason(r.null_reason); } })
      .catch(() => { if (live) { setItems([]); setNullReason("incidents_read_unavailable"); } });
    return () => { live = false; };
  }, [businessId, envId]);

  return (
    <Panel title="Incidents">
      <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginBottom: 10 }}>
        Incidents are opened from degraded / rollback-recommended watcher verdicts and
        move through a governed state machine. They are records and remediation
        artifacts — ADE Ops never rolls back a provider automatically, and an incident
        cannot close without a resolution note and evidence.
      </div>
      {items === null && <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading…</div>}
      {items !== null && items.length === 0 && (
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>
          No incidents{nullReason ? ` (${nullReason})` : ""}.
        </div>
      )}
      {items?.map((inc, i) => <IncidentRow key={inc.id ?? i} inc={inc} />)}
    </Panel>
  );
}

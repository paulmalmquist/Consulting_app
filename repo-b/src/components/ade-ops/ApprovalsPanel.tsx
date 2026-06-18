"use client";

import { useEffect, useState } from "react";

import type { ApprovalRequest, ApprovalStateName } from "@/lib/ade-ops/api";
import { listApprovals } from "@/lib/ade-ops/api";

import { C, Panel, Tag } from "./primitives";

// PR 5A surface: the approval escrow + preflight spine. Shows each request's
// state (Pending Approval / Approved / Expired / Blocked) and is honest that
// execution is disabled — even an approved, preflight-passed request does not run.

function stateColor(state: ApprovalStateName): string {
  if (state === "approved") return C.green;
  if (state === "pending") return C.accent;
  if (state === "expired") return C.amber;
  return C.red; // blocked
}

function stateLabel(state: ApprovalStateName): string {
  if (state === "pending") return "Pending approval";
  if (state === "approved") return "Approved";
  if (state === "expired") return "Expired";
  return "Blocked";
}

export function ExecutionDisabledBanner() {
  return (
    <div
      data-testid="execution-disabled-banner"
      style={{
        fontFamily: C.sans, fontSize: 12, color: C.amber, background: C.amber + "12",
        border: `1px solid ${C.amber}40`, borderRadius: 8, padding: "10px 12px", marginBottom: 12,
      }}
    >
      Execution capability is <strong>disabled</strong> in PR 5A. Approval and
      preflight are recorded, but no provider write runs — even an approved,
      preflight-passed request. Simulated execution lands in PR 5B; a real,
      fully-gated provider write in PR 5C.
    </div>
  );
}

function ApprovalRow({ a }: { a: ApprovalRequest }) {
  const pf = a.preflight;
  return (
    <div
      data-testid="approval-row"
      style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8,
        background: C.panel }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{a.command_name}</span>
        <Tag color={stateColor(a.state)}>{stateLabel(a.state)}</Tag>
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 6 }}>
        {a.provider ?? "—"} · {a.target_ref ?? "—"} · tier {a.risk_tier}
        {a.approver ? ` · approved by ${a.approver}` : ""}
      </div>
      {pf && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: pf.passed ? C.green : C.amber, marginTop: 6 }}>
          preflight: {pf.passed ? "passed" : `missing ${pf.missing.join(", ")}`}
        </div>
      )}
      {a.null_reason && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 4 }}>
          {a.null_reason}
        </div>
      )}
      {/* PR 5A: executed must always be false. Surfaced so it can never silently flip. */}
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 4 }}>
        executed: {String(a.executed)}
      </div>
    </div>
  );
}

export function ApprovalsPanel({ businessId, envId }: { businessId: string; envId?: string }) {
  const [items, setItems] = useState<ApprovalRequest[] | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listApprovals(businessId, envId)
      .then((r) => { if (live) { setItems(r.approvals); setNullReason(r.null_reason); } })
      .catch(() => { if (live) { setItems([]); setNullReason("approvals_read_unavailable"); } });
    return () => { live = false; };
  }, [businessId, envId]);

  return (
    <Panel title="Approval escrow + execution preflight">
      <ExecutionDisabledBanner />
      {items === null && <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading…</div>}
      {items !== null && items.length === 0 && (
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>
          No approval requests yet{nullReason ? ` (${nullReason})` : ""}.
        </div>
      )}
      {items?.map((a) => <ApprovalRow key={a.approval_id} a={a} />)}
    </Panel>
  );
}

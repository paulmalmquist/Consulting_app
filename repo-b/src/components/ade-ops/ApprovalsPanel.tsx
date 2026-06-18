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
      One real action is enabled (PR 5C): Snowflake <strong>non-prod warehouse
      AUTO_SUSPEND</strong> only, behind approval + preflight + allowlist + rollback
      + observation window + an env flag, never in prod. SQL is generated from typed
      fields and validated; no arbitrary or user-supplied SQL. Everything else is
      simulated. Resize, tasks, dynamic tables, Databricks/GCP/AWS, and prod remain
      <strong>impossible</strong>.
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
      {/* PR 5B: executed:true is only ever a SIMULATION; the mode is shown so a
          real write can never masquerade as done. */}
      {a.executed && a.execution_mode === "simulation" && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <Tag color={C.violet}>Simulated</Tag>
          {a.observation_window_opened_at && (
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>
              observation window opened
            </span>
          )}
          {a.rolled_back && (
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>· rolled back (sim)</span>
          )}
        </div>
      )}
      {/* PR 5C: a real non-prod Snowflake auto_suspend write. Shows before→after +
          the SQL hash so the action is auditable and unambiguous. */}
      {a.executed && a.execution_mode === "nonprod" && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Tag color={C.red}>Live · non-prod</Tag>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>
              {a.action_kind ?? "—"}: {a.before_value ?? "?"} → {a.after_value ?? "?"}
            </span>
          </div>
          {a.generated_sql_hash && (
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 4 }}>
              sql {a.generated_sql_hash.slice(0, 12)}… · rollback {(a.rollback_sql_hash ?? "").slice(0, 12)}…
            </div>
          )}
        </div>
      )}
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 4 }}>
        executed: {String(a.executed)}
        {a.execution_mode ? ` · mode: ${a.execution_mode}` : ""}
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

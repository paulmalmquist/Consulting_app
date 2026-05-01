"use client";

/**
 * AuditDrawer - Authoritative State Lockdown audit surface mode.
 *
 * Per docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md (Invariant 8), every
 * audited REPE page must accept ?audit_mode=1 and render this drawer
 * inline so a human can verify lineage at a glance.
 */

import type { ReV2AuthoritativeState } from "@/lib/bos-api";
import type { LockState } from "@/hooks/useAuthoritativeState";

export interface AuditDrawerProps {
  state: ReV2AuthoritativeState | null;
  lockState: LockState;
  requestedQuarter: string;
  snapshotIdsUsed?: string[];
  dataSnapshotHash?: string | null;
  toolCalls?: unknown[];
  sqlTrace?: unknown[];
  className?: string;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AuditDrawer({
  state,
  lockState,
  requestedQuarter,
  snapshotIdsUsed,
  dataSnapshotHash,
  toolCalls,
  sqlTrace,
  className,
}: AuditDrawerProps) {
  return (
    <section
      data-testid="audit-drawer"
      className={`mt-8 rounded-lg border border-bm-border/45 bg-bm-surface/20 p-4 text-xs ${className ?? ""}`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="nv-h3 text-bm-text">Audit Drawer</h3>
        <span className="nv-metric text-[10px] text-bm-muted2">audit_mode=1</span>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <Field label="lockState" value={lockState} />
        <Field label="requested_quarter" value={requestedQuarter} />
        <Field label="state.quarter" value={state?.quarter ?? "-"} />
        <Field label="period_exact" value={String(state?.period_exact ?? "-")} />
        <Field label="state_origin" value={state?.state_origin ?? "-"} />
        <Field label="promotion_state" value={state?.promotion_state ?? "-"} />
        <Field label="trust_status" value={state?.trust_status ?? "-"} />
        <Field label="snapshot_version" value={state?.snapshot_version ?? "-"} mono />
        <Field label="audit_run_id" value={state?.audit_run_id ?? "-"} mono />
        <Field label="breakpoint_layer" value={state?.breakpoint_layer ?? "-"} />
        <Field label="null_reason" value={state?.null_reason ?? "-"} />
        {dataSnapshotHash ? <Field label="data_snapshot_hash" value={dataSnapshotHash} mono /> : null}
      </dl>

      {snapshotIdsUsed?.length ? (
        <AuditDetail title={`snapshot_ids_used (${snapshotIdsUsed.length})`} value={snapshotIdsUsed} first />
      ) : null}
      {toolCalls?.length ? <AuditDetail title={`tool_calls (${toolCalls.length})`} value={toolCalls} /> : null}
      {sqlTrace?.length ? <AuditDetail title={`sql_trace (${sqlTrace.length})`} value={sqlTrace} /> : null}

      {state?.state?.canonical_metrics ? (
        <AuditDetail title="canonical_metrics" value={state.state.canonical_metrics} first={!snapshotIdsUsed?.length} />
      ) : null}
      {state?.state?.gross_to_net_bridge ? (
        <AuditDetail title="gross_to_net_bridge" value={state.state.gross_to_net_bridge} />
      ) : null}
      {state?.null_reasons && Object.keys(state.null_reasons).length > 0 ? (
        <AuditDetail title="null_reasons" value={state.null_reasons} />
      ) : null}
      {state?.formulas && Object.keys(state.formulas).length > 0 ? (
        <AuditDetail title="formulas" value={state.formulas} />
      ) : null}
      {state?.provenance && state.provenance.length > 0 ? (
        <AuditDetail title={`provenance (${state.provenance.length})`} value={state.provenance} />
      ) : null}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="nv-eyebrow text-bm-muted2">{label}</dt>
      <dd className={`text-[11px] text-bm-text ${mono ? "nv-metric" : ""}`}>{value}</dd>
    </div>
  );
}

function AuditDetail({ title, value, first = false }: { title: string; value: unknown; first?: boolean }) {
  return (
    <details className={`${first ? "mt-4" : "mt-2"} rounded border border-bm-border/30 bg-bm-bg/60 p-2`}>
      <summary className="nv-table-header cursor-pointer text-bm-muted2">{title}</summary>
      <pre className="nv-metric mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] text-bm-muted2">
        {formatJson(value)}
      </pre>
    </details>
  );
}

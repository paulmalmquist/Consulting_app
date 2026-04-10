"use client";

/**
 * AuditDrawer — Authoritative State Lockdown audit surface mode.
 *
 * Per docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md (Invariant 8), every
 * audited REPE page must accept `?audit_mode=1` and render this drawer
 * inline so a human can verify lineage at a glance. The drawer reads
 * from the same `state` object the KPI cards use, so it cannot drift.
 */

import type { ReV2AuthoritativeState } from "@/lib/bos-api";
import type { LockState } from "@/hooks/useAuthoritativeState";

export interface AuditDrawerProps {
  state: ReV2AuthoritativeState | null;
  lockState: LockState;
  requestedQuarter: string;
  className?: string;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AuditDrawer({ state, lockState, requestedQuarter, className }: AuditDrawerProps) {
  return (
    <section
      data-testid="audit-drawer"
      className={`mt-8 rounded-lg border border-slate-300 bg-slate-50 p-4 text-xs ${className ?? ""}`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Audit Drawer</h3>
        <span className="font-mono text-[10px] text-slate-500">audit_mode=1</span>
      </header>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <Field label="lockState" value={lockState} />
        <Field label="requested_quarter" value={requestedQuarter} />
        <Field label="state.quarter" value={state?.quarter ?? "—"} />
        <Field label="period_exact" value={String(state?.period_exact ?? "—")} />
        <Field label="state_origin" value={state?.state_origin ?? "—"} />
        <Field label="promotion_state" value={state?.promotion_state ?? "—"} />
        <Field label="trust_status" value={state?.trust_status ?? "—"} />
        <Field label="snapshot_version" value={state?.snapshot_version ?? "—"} mono />
        <Field label="audit_run_id" value={state?.audit_run_id ?? "—"} mono />
        <Field label="breakpoint_layer" value={state?.breakpoint_layer ?? "—"} />
        <Field label="null_reason" value={state?.null_reason ?? "—"} />
      </dl>

      {state?.state?.canonical_metrics && (
        <details className="mt-4 rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
            canonical_metrics
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-slate-700">
            {formatJson(state.state.canonical_metrics)}
          </pre>
        </details>
      )}

      {state?.state?.gross_to_net_bridge && (
        <details className="mt-2 rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
            gross_to_net_bridge
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-slate-700">
            {formatJson(state.state.gross_to_net_bridge)}
          </pre>
        </details>
      )}

      {state?.null_reasons && Object.keys(state.null_reasons).length > 0 && (
        <details className="mt-2 rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
            null_reasons
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-slate-700">
            {formatJson(state.null_reasons)}
          </pre>
        </details>
      )}

      {state?.formulas && Object.keys(state.formulas).length > 0 && (
        <details className="mt-2 rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
            formulas
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-slate-700">
            {formatJson(state.formulas)}
          </pre>
        </details>
      )}

      {state?.provenance && state.provenance.length > 0 && (
        <details className="mt-2 rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
            provenance ({state.provenance.length})
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-slate-700">
            {formatJson(state.provenance)}
          </pre>
        </details>
      )}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`text-[11px] text-slate-800 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

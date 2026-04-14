"use client";

import { useState } from "react";
import { patchPdsExecutiveQueueItem } from "@/lib/bos-api";
import type {
  PdsExecutiveQueueItem,
  PdsExecutiveQueueItemPatch,
} from "@/types/pds";
import { toCompactCurrency } from "./utils";

const STATUS_OPTIONS = [
  "open",
  "in_review",
  "deferred",
  "approved",
  "delegated",
  "escalated",
  "closed",
] as const;

type Props = {
  rows: PdsExecutiveQueueItem[];
  envId: string;
  businessId?: string;
  onRowChange?: (row: PdsExecutiveQueueItem) => void;
};

export function InterventionQueueTable({ rows, envId, businessId, onRowChange }: Props) {
  return (
    <section className="space-y-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
          Intervention Queue
        </p>
        <h3 className="text-xl font-semibold text-bm-text">
          Assignable, priority-ranked, close-the-loop tracked
        </h3>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-bm-border/60 bg-bm-surface/15">
        <table className="min-w-full text-sm">
          <thead className="bg-bm-surface/30 text-[11px] uppercase tracking-wide text-bm-muted2">
            <tr>
              <th className="px-3 py-2 text-left">Title</th>
              <th className="px-3 py-2 text-right">Variance</th>
              <th className="px-3 py-2 text-left">Recommended</th>
              <th className="px-3 py-2 text-left">Assigned</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Due</th>
              <th className="px-3 py-2 text-right">Recovery</th>
              <th className="px-3 py-2 text-right">Priority</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <InterventionRow
                key={row.queue_item_id}
                row={row}
                envId={envId}
                businessId={businessId}
                onRowChange={onRowChange}
              />
            ))}
            {!rows.length ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-bm-muted2"
                >
                  No interventions in queue.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InterventionRow({
  row,
  envId,
  businessId,
  onRowChange,
}: {
  row: PdsExecutiveQueueItem;
  envId: string;
  businessId?: string;
  onRowChange?: (row: PdsExecutiveQueueItem) => void;
}) {
  const [current, setCurrent] = useState(row);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function applyPatch(patch: PdsExecutiveQueueItemPatch, optimistic: Partial<PdsExecutiveQueueItem>) {
    const rollback = current;
    const next = { ...current, ...optimistic };
    setCurrent(next);
    setSaving(Object.keys(patch)[0] || null);
    setError(null);
    try {
      const updated = await patchPdsExecutiveQueueItem(
        row.queue_item_id,
        patch,
        envId,
        businessId,
      );
      setCurrent(updated);
      onRowChange?.(updated);
    } catch (err) {
      setCurrent(rollback);
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <tr className="border-t border-bm-border/40">
      <td className="px-3 py-2 align-top">
        <p className="font-semibold text-bm-text">{current.title}</p>
        {current.summary ? (
          <p className="text-[11px] text-bm-muted2">{current.summary}</p>
        ) : null}
        {error ? (
          <p className="mt-1 text-[11px] text-pds-signalRed">⚠ {error}</p>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right align-top">
        <NumberCell
          value={current.variance}
          saving={saving === "variance"}
          onCommit={(v) =>
            applyPatch({ variance: v }, { variance: v })
          }
        />
      </td>
      <td className="px-3 py-2 align-top text-bm-muted2">
        {current.recommended_owner || "—"}
      </td>
      <td className="px-3 py-2 align-top">
        <input
          defaultValue={current.assigned_owner || ""}
          placeholder="assign owner"
          className="w-32 rounded border border-bm-border/60 bg-bm-surface/20 px-2 py-1 text-sm"
          onBlur={(ev) => {
            const next = ev.target.value.trim() || null;
            if (next === current.assigned_owner) return;
            applyPatch(
              { assigned_owner: next },
              { assigned_owner: next },
            );
          }}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <select
          value={current.status}
          className="rounded border border-bm-border/60 bg-bm-surface/20 px-2 py-1 text-sm"
          onChange={(ev) =>
            applyPatch(
              { status: ev.target.value },
              { status: ev.target.value },
            )
          }
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 align-top">
        <input
          type="date"
          defaultValue={current.due_at ? current.due_at.slice(0, 10) : ""}
          className="rounded border border-bm-border/60 bg-bm-surface/20 px-2 py-1 text-sm"
          onBlur={(ev) => {
            const next = ev.target.value || null;
            const nextIso = next ? `${next}T00:00:00Z` : null;
            if (nextIso === current.due_at) return;
            applyPatch(
              { due_at: nextIso },
              { due_at: nextIso },
            );
          }}
        />
      </td>
      <td className="px-3 py-2 text-right align-top">
        <NumberCell
          value={current.recovery_value}
          saving={saving === "recovery_value"}
          onCommit={(v) =>
            applyPatch({ recovery_value: v }, { recovery_value: v })
          }
        />
      </td>
      <td className="px-3 py-2 text-right align-top font-mono text-bm-muted2">
        {(current.priority_score ?? 0).toFixed(0)}
      </td>
    </tr>
  );
}

function NumberCell({
  value,
  saving,
  onCommit,
}: {
  value: number | null;
  saving: boolean;
  onCommit: (next: number | null) => void;
}) {
  return (
    <input
      defaultValue={value != null ? String(value) : ""}
      inputMode="decimal"
      className="w-28 rounded border border-bm-border/60 bg-bm-surface/20 px-2 py-1 text-right text-sm"
      onBlur={(ev) => {
        const raw = ev.target.value.trim();
        if (raw === "" && value == null) return;
        const parsed = raw === "" ? null : Number(raw);
        if (parsed !== null && Number.isNaN(parsed)) return;
        if (parsed === value) return;
        onCommit(parsed);
      }}
      disabled={saving}
    />
  );
}

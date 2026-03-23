"use client";

import React from "react";

type Props = {
  items: Array<Record<string, unknown>>;
  loading: boolean;
  hasError?: boolean;
};

export default function DecisionMemoryTab({ items, loading, hasError }: Props) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-executive-memory">
      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Decision Memory</p>
        <h2 className="text-lg font-semibold">Recommendation, Action, Outcome Log</h2>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
            <tr className="border-b border-bm-border/60">
              <th className="pb-2 pr-4 font-medium">Decision</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium">Last Action</th>
              <th className="pb-2 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="py-4 text-bm-muted2">Loading memory...</td></tr>
            ) : hasError ? (
              <tr>
                <td colSpan={4} className="py-4">
                  <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-700">
                    Could not load decision memory — service may be unavailable. Try running the full cycle or check back shortly.
                  </div>
                </td>
              </tr>
            ) : items.length ? (
              items.map((item) => (
                <tr key={String(item.queue_item_id || Math.random())} className="border-b border-bm-border/40 last:border-0">
                  <td className="py-3 pr-4 align-top">
                    <div className="font-medium">{String(item.title || item.decision_code || "Decision")}</div>
                    <div className="text-xs text-bm-muted2">{String(item.decision_code || "")}</div>
                  </td>
                  <td className="py-3 pr-4 align-top">{String(item.status || "")}</td>
                  <td className="py-3 pr-4 align-top">{String(item.action_type || "-")}</td>
                  <td className="py-3 align-top">{String(item.outcome_status || "unknown")}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4} className="py-4 text-bm-muted2">No decision memory entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

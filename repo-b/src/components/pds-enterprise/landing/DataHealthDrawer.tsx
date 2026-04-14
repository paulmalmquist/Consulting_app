"use client";

import { useEffect, useState } from "react";
import { getPdsDataHealthExceptions } from "@/lib/bos-api";
import type {
  PdsDataHealthException,
  PdsDataHealthSummary,
} from "@/types/pds";

type Props = {
  open: boolean;
  onClose: () => void;
  summary: PdsDataHealthSummary | null;
  envId: string;
  businessId?: string;
  initialFilter?: { source_table?: string; error_type?: string };
};

export function DataHealthDrawer({
  open,
  onClose,
  summary,
  envId,
  businessId,
  initialFilter,
}: Props) {
  const [rows, setRows] = useState<PdsDataHealthException[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !envId) return;
    setError(null);
    getPdsDataHealthExceptions(envId, businessId, {
      source_table: initialFilter?.source_table,
      error_type: initialFilter?.error_type,
      limit: 100,
    })
      .then(setRows)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load exceptions"),
      );
  }, [open, envId, businessId, initialFilter?.source_table, initialFilter?.error_type]);

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label="Data health breakdown"
      className="fixed right-0 top-0 z-40 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-bm-border/70 bg-bm-surface/95 backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-bm-border/60 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
            Data Health
          </p>
          <h3 className="text-lg font-semibold text-bm-text">
            Exceptions + pipeline runs
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-bm-border/60 px-2 py-1 text-xs text-bm-muted2 hover:text-bm-text"
        >
          Close
        </button>
      </div>

      <div className="space-y-4 p-4 text-sm">
        {summary ? (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
              Latest pipeline runs
            </p>
            <ul className="mt-1 space-y-1">
              {summary.pipeline_runs.map((run) => (
                <li
                  key={run.pipeline_name}
                  className="flex flex-wrap items-center gap-2 rounded border border-bm-border/50 bg-bm-surface/20 px-2 py-1 text-xs"
                >
                  <span className="font-mono text-bm-text">{run.pipeline_name}</span>
                  <span
                    className={
                      String(run.status).toLowerCase() === "success"
                        ? "text-bm-muted2"
                        : "text-pds-signalRed"
                    }
                  >
                    {run.status}
                  </span>
                  <span className="ml-auto text-bm-muted2">
                    {run.rows_failed}/{run.rows_processed} failed
                  </span>
                </li>
              ))}
              {!summary.pipeline_runs.length ? (
                <li className="text-xs text-bm-muted2">No runs recorded yet.</li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {summary && summary.by_error_type.length ? (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
              By error type
            </p>
            <ul className="mt-1 space-y-1 text-xs">
              {summary.by_error_type.map((row) => (
                <li
                  key={`${row.source_table}-${row.error_type}`}
                  className="flex items-center justify-between rounded border border-bm-border/50 bg-bm-surface/20 px-2 py-1"
                >
                  <span className="font-mono text-bm-text">{row.source_table}</span>
                  <span className="text-bm-muted2">{row.error_type}</span>
                  <span className="font-semibold text-bm-text">{row.count}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
            Sample failing rows
          </p>
          {error ? (
            <p className="mt-1 text-pds-signalRed">⚠ {error}</p>
          ) : null}
          <ul className="mt-1 space-y-1 text-xs">
            {rows.map((exc) => (
              <li
                key={exc.exception_id}
                className="rounded border border-bm-border/50 bg-bm-surface/20 px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-bm-text">{exc.source_table}</span>
                  <span className="text-bm-muted2">{exc.error_type}</span>
                </div>
                <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-bm-muted2">
                  {JSON.stringify(exc.sample_row_json, null, 2)}
                </pre>
              </li>
            ))}
            {!rows.length && !error ? (
              <li className="text-bm-muted2">No sample rows.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </aside>
  );
}

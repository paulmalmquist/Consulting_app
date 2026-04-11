"use client";

import { useMemo, useState } from "react";
import {
  runExecutionCommand,
  type ExecutionBoardColumn,
  type ExecutionCard,
  type ExecutionRankedAction,
} from "@/lib/cro-api";
import { pressureRank } from "./pipeline-insight";

export type ActiveSlice = {
  stage: string;
  industry?: string;
};

type ActionRow = {
  key: string;
  card: ExecutionCard;
  action: ExecutionRankedAction;
};

type Props = {
  slice: ActiveSlice | null;
  columns: ExecutionBoardColumn[];
  envId: string;
  businessId: string;
  onExecuted: () => void;
  onOpenDeal: (dealId: string) => void;
  onDismiss: () => void;
};

const MAX_ACTIONS = 5;

export default function PipelineActionPanel({
  slice,
  columns,
  envId,
  businessId,
  onExecuted,
  onOpenDeal,
  onDismiss,
}: Props) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );

  const resolved = useMemo(() => {
    if (!slice) return null;
    const col = columns.find((c) => c.execution_column_key === slice.stage);
    if (!col) return null;

    const pool = col.cards.filter((c) => {
      if (slice.industry) {
        const ind = (c.industry || "Other").trim() || "Other";
        if (ind !== slice.industry) return false;
      }
      return true;
    });

    const rows: ActionRow[] = [];
    pool.forEach((card) => {
      const top = card.ranked_next_actions?.[0];
      if (top) {
        rows.push({
          key: `${card.crm_opportunity_id}:${top.action_key}`,
          card,
          action: top,
        });
      }
    });

    rows.sort((a, b) => {
      const pr =
        pressureRank(b.card.execution_pressure) -
        pressureRank(a.card.execution_pressure);
      if (pr !== 0) return pr;
      return (b.card.priority_score || 0) - (a.card.priority_score || 0);
    });

    return {
      stage_label: col.execution_column_label,
      stage_key: col.execution_column_key,
      industry: slice.industry,
      rows: rows.slice(0, MAX_ACTIONS),
      totalPool: pool.length,
      dealsWithoutActions: pool.length - rows.length,
    };
  }, [slice, columns]);

  if (!slice || !resolved) return null;

  async function fire(row: ActionRow) {
    setBusy((s) => ({ ...s, [row.key]: true }));
    setError(null);
    try {
      const accountName = row.card.account_name || row.card.name || "this deal";
      await runExecutionCommand({
        env_id: envId,
        business_id: businessId,
        command: `${row.action.label} for ${accountName}`,
        confirm: true,
      });
      onExecuted();
    } catch (e) {
      setError({
        key: row.key,
        message: e instanceof Error ? e.message : "Action failed",
      });
    } finally {
      setBusy((s) => ({ ...s, [row.key]: false }));
    }
  }

  return (
    <aside className="rounded-xl border border-bm-accent/40 bg-bm-accent/5 px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-accent font-semibold">
            Send now · {resolved.stage_label}
            {resolved.industry ? ` · ${resolved.industry}` : ""}
          </p>
          <p className="text-xs text-bm-muted2 mt-0.5">
            Top {resolved.rows.length} of {resolved.totalPool} deal
            {resolved.totalPool === 1 ? "" : "s"} in this slice
            {resolved.dealsWithoutActions > 0
              ? ` · ${resolved.dealsWithoutActions} without ranked actions`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-bm-muted2 hover:text-bm-text text-sm px-2 -mt-1"
          aria-label="Dismiss action panel"
        >
          ×
        </button>
      </div>

      {resolved.rows.length === 0 ? (
        <div className="rounded-lg border border-bm-border/40 bg-bm-surface/20 px-3 py-2 text-xs text-bm-muted2">
          No ranked next actions for this slice. Open a card to define one.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {resolved.rows.map((row) => {
            const rowBusy = !!busy[row.key];
            const rowError = error?.key === row.key ? error.message : null;
            const buttonLabel = shortVerb(row.action.label);
            return (
              <li
                key={row.key}
                className="rounded-lg border border-bm-border/40 bg-bm-bg/40 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenDeal(row.card.crm_opportunity_id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-sm font-medium text-bm-text truncate">
                      {row.card.account_name || row.card.name}
                    </p>
                    <p className="text-[11px] text-bm-muted2 truncate">
                      {row.action.label}
                    </p>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <PressureBadge pressure={row.card.execution_pressure} />
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => void fire(row)}
                      className="rounded-md bg-bm-accent px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-bm-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {rowBusy ? "…" : buttonLabel}
                    </button>
                  </div>
                </div>
                {row.action.reasoning ? (
                  <p className="text-[10px] text-bm-muted2 mt-1 line-clamp-2">
                    {row.action.reasoning}
                  </p>
                ) : null}
                {rowError ? (
                  <p className="text-[10px] text-red-400 mt-1">{rowError}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[10px] text-bm-muted2">
        Fires via runExecutionCommand with confirmation. The board refreshes on
        success. Click a name to open the deal panel instead.
      </p>
    </aside>
  );
}

function shortVerb(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "Send";
  const first = trimmed.split(/\s+/)[0];
  if (first.length <= 7) return first;
  return first.slice(0, 6) + "…";
}

function PressureBadge({
  pressure,
}: {
  pressure: ExecutionCard["execution_pressure"];
}) {
  const map: Record<ExecutionCard["execution_pressure"], string> = {
    critical: "bg-red-500/20 text-red-300 border-red-500/40",
    high: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    medium: "bg-bm-surface/40 text-bm-muted2 border-bm-border/50",
    low: "bg-bm-surface/20 text-bm-muted2 border-bm-border/40",
  };
  const cls = map[pressure] || map.low;
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {pressure}
    </span>
  );
}

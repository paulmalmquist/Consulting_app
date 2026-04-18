"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  getOperatorAccountability,
  OperatorAccountabilityBoard,
  OperatorAccountabilityItem,
} from "@/lib/bos-api";

const STATUS_TONE: Record<string, string> = {
  overdue: "border-red-500/40 bg-red-500/15 text-red-400",
  unassigned: "border-red-500/40 bg-red-500/15 text-red-400",
  open: "border-bm-border/50 bg-white/5 text-bm-muted2",
  resolved: "border-bm-border/50 bg-white/5 text-bm-muted2",
};

function label(s: string): string {
  return s.replace(/_/g, " ");
}

export function AccountabilityLayer() {
  const { envId, businessId } = useDomainEnv();
  const [board, setBoard] = useState<OperatorAccountabilityBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOperatorAccountability(envId, businessId || undefined);
        if (!cancelled) setBoard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load accountability.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envId, businessId]);

  if (loading) return <p className="text-sm text-bm-muted2">Loading accountability…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!board) return null;

  const { totals } = board;

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border border-bm-border/60 bg-black/30 p-4"
        data-testid="accountability-headline"
      >
        <p className="text-sm text-bm-text">
          {totals.overdue_count + totals.unassigned_count > 0 ? (
            <>
              <span className="font-semibold text-red-400">
                {totals.unassigned_count} unassigned
              </span>{" "}
              ·{" "}
              <span className="font-semibold text-red-400">
                {totals.overdue_count} overdue
              </span>{" "}
              · {totals.stale_count} stale ({totals.total_items} total open)
            </>
          ) : (
            <>No accountability gaps — all {totals.total_items} items owned and current.</>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Open items" value={totals.total_items.toString()} />
        <KpiTile
          label="Unassigned"
          value={totals.unassigned_count.toString()}
          tone={totals.unassigned_count > 0 ? "warn" : undefined}
        />
        <KpiTile
          label="Overdue"
          value={totals.overdue_count.toString()}
          tone={totals.overdue_count > 0 ? "warn" : undefined}
        />
        <KpiTile
          label="Max escalation"
          value={`L${totals.max_escalation_level}`}
          tone={totals.max_escalation_level >= 2 ? "warn" : undefined}
        />
      </div>

      <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
          Items
        </p>
        <div className="mt-3 space-y-2">
          {board.items.map((i) => (
            <AccountabilityRow key={i.id} item={i} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
          By owner
        </p>
        <table className="mt-3 min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
              <th className="py-1.5">Owner</th>
              <th className="py-1.5">Open</th>
              <th className="py-1.5">Overdue</th>
              <th className="py-1.5">Stale</th>
              <th className="py-1.5">Max escalation</th>
            </tr>
          </thead>
          <tbody>
            {board.by_owner.map((o, i) => (
              <tr
                key={`${o.owner}-${i}`}
                className="border-t border-bm-border/40"
                data-testid={`accountability-owner-${i}`}
              >
                <td className={`py-1.5 ${o.owner === "Unassigned" ? "text-red-400 font-medium" : "text-bm-text"}`}>
                  {o.owner}
                </td>
                <td className="py-1.5 text-bm-text">{o.open_count}</td>
                <td className={`py-1.5 ${o.overdue_count > 0 ? "text-red-400" : "text-bm-text"}`}>
                  {o.overdue_count}
                </td>
                <td className={`py-1.5 ${o.stale_count > 0 ? "text-amber-300" : "text-bm-text"}`}>
                  {o.stale_count}
                </td>
                <td className={`py-1.5 ${o.max_escalation_level >= 2 ? "text-red-400" : "text-bm-text"}`}>
                  L{o.max_escalation_level}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountabilityRow({ item: i }: { item: OperatorAccountabilityItem }) {
  const displayStatus = i.stalled_no_owner ? "unassigned" : i.status;
  const isUrgent = i.stalled_no_owner || i.status === "overdue" || i.escalation_level >= 2;
  return (
    <div
      data-testid={`accountability-item-${i.id}`}
      className={`rounded-xl border p-3 ${
        isUrgent ? "border-red-500/30 bg-red-500/5" : "border-bm-border/50 bg-black/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-bm-text">
            <Link href={i.href ?? "#"} className="hover:underline">
              {i.title}
            </Link>
          </p>
          <p className="mt-0.5 text-xs text-bm-muted2">
            {i.project_name} · {label(i.category ?? "—")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            data-testid={`accountability-status-${i.id}`}
            className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${STATUS_TONE[displayStatus]}`}
          >
            {displayStatus}
          </span>
          {i.escalation_level >= 2 && (
            <span className="text-[10px] uppercase tracking-[0.12em] text-red-400">
              L{i.escalation_level}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-bm-muted2">
        <span>Owner: {i.owner ?? <span className="text-red-400">Unassigned</span>}</span>
        {i.due_date && (
          <span className={i.days_overdue > 0 ? "text-red-400" : ""}>
            Due {i.due_date}
            {i.days_overdue > 0 && ` · ${i.days_overdue}d overdue`}
          </span>
        )}
        {i.stale_update && (
          <span className="text-amber-300">No update in {i.last_update_days}d</span>
        )}
        {i.blocker_reason && <span className="text-red-300">Blocker: {i.blocker_reason}</span>}
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        tone === "warn"
          ? "border-red-500/30 bg-red-500/10"
          : "border-bm-border/60 bg-black/25"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "warn" ? "text-red-400" : "text-bm-text"}`}>
        {value}
      </p>
    </div>
  );
}

export default AccountabilityLayer;

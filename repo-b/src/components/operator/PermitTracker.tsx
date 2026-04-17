"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { OperatorUnavailableState } from "@/components/operator/OperatorUnavailableState";
import {
  getOperatorPermitBoard,
  type OperatorPermitBoard,
  type OperatorPermitRow,
} from "@/lib/bos-api";
import { fmtDate, fmtMoney } from "@/lib/format-utils";

const STAGE_LABEL: Record<string, string> = {
  pre_application: "Pre-app",
  application_submitted: "Submitted",
  first_review: "First review",
  comment_response: "Comment response",
  second_review: "Second review",
  approval: "Approval",
  issued: "Issued",
};

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  return STAGE_LABEL[stage] ?? stage.replace(/_/g, " ");
}

function PermitRow({ row }: { row: OperatorPermitRow }) {
  const impact = row.impact;
  const ignored = impact?.if_ignored?.in_30_days;
  const ttf = impact?.time_to_failure_days ?? null;
  const isUrgent = ttf != null && ttf <= 14;
  return (
    <tr>
      <td className="px-3 py-3 align-top">
        <Link
          href={row.href_project ?? "#"}
          className="font-medium text-bm-text hover:underline"
        >
          {row.title}
        </Link>
        <div className="mt-1 text-xs text-bm-muted2">
          {row.project_name}
          {row.entity_name ? ` · ${row.entity_name}` : ""}
        </div>
      </td>
      <td className="px-3 py-3 align-top text-bm-text">
        {row.href_municipality ? (
          <Link href={row.href_municipality} className="hover:underline">
            {row.municipality_name}
          </Link>
        ) : (
          row.municipality_name
        )}
        {row.municipality_friction_score != null ? (
          <div className="text-xs text-bm-muted2">
            Friction {Math.round(row.municipality_friction_score)}/100
          </div>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top text-bm-text">{stageLabel(row.current_stage)}</td>
      <td className="px-3 py-3 align-top">
        <div className="text-bm-text">
          {row.days_in_stage}d{" "}
          <span className="text-xs text-bm-muted2">
            / median {row.median_stage_days || "—"}d
          </span>
        </div>
        {row.delay_flag ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-100">
              +{row.days_over_median}d over
            </span>
            {row.over_median_pct > 0 ? (
              <span className="text-[11px] text-red-200/80">
                {row.over_median_pct}% over median
              </span>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top">
        {impact?.estimated_cost_usd ? (
          <div className="text-red-200">{fmtMoney(impact.estimated_cost_usd)}</div>
        ) : (
          <div className="text-bm-muted2">—</div>
        )}
        {isUrgent ? (
          <div className="mt-1">
            <span className="rounded-full border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-100">
              {ttf}d to failure
            </span>
          </div>
        ) : null}
        {ignored ? (
          <div
            data-testid="permit-if-ignored"
            className="mt-1 text-[11px] text-red-200/80"
          >
            If ignored 30d: +{fmtMoney(ignored.estimated_cost_usd)}
            {ignored.estimated_delay_days ? ` · +${ignored.estimated_delay_days}d` : ""}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top text-bm-muted2">
        {fmtDate(row.expected_completion || undefined)}
      </td>
    </tr>
  );
}

function PermitFunnel({ board }: { board: OperatorPermitBoard }) {
  const total = board.permits.length || 1;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-bm-muted2">
      {board.funnel.map((row) => {
        const pct = Math.max(6, Math.round((row.count / total) * 100));
        return (
          <div
            key={row.stage}
            className="flex items-center gap-2 rounded-full border border-bm-border/50 bg-black/20 px-3 py-1"
          >
            <span className="uppercase tracking-[0.14em]">{stageLabel(row.stage)}</span>
            <span className="text-bm-text">{row.count}</span>
            <span
              className="inline-block h-1 rounded-full bg-amber-300/60"
              style={{ width: `${pct * 0.6}px` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function PermitTracker() {
  const { envId, businessId } = useDomainEnv();
  const [board, setBoard] = useState<OperatorPermitBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setBoard(await getOperatorPermitBoard(envId, businessId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load permit board.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [envId, businessId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4 text-sm text-bm-muted2">
        Loading permit tracker…
      </div>
    );
  }
  if (error || !board) {
    return (
      <OperatorUnavailableState
        title="Permit tracker unavailable"
        detail={error || "No data returned."}
        onRetry={() => void load()}
      />
    );
  }

  const { totals } = board;

  return (
    <section id="permit-tracker" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            Permit Tracker
          </p>
          <h3 className="mt-1 text-lg font-semibold text-bm-text">
            {totals.delayed_count} delayed of {totals.permit_count} active
          </h3>
          <p className="mt-1 text-xs text-bm-muted2">
            {totals.total_days_over_median} days over median ·{" "}
            {fmtMoney(totals.delayed_impact_usd)} exposure from delayed permits.
          </p>
        </div>
      </div>

      <PermitFunnel board={board} />

      <div className="overflow-x-auto rounded-3xl border border-bm-border/60 bg-bm-surface/20">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
              <th className="px-3 py-2 font-medium">Permit</th>
              <th className="px-3 py-2 font-medium">Municipality</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium">Days in stage</th>
              <th className="px-3 py-2 font-medium">Impact if delayed</th>
              <th className="px-3 py-2 font-medium">Expected close</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/30">
            {board.permits.map((row) => (
              <PermitRow key={row.permit_id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default PermitTracker;

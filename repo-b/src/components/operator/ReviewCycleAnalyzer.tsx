"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { getOperatorReviewCycles, OperatorReviewCycleBoard } from "@/lib/bos-api";

function themeLabel(theme: string): string {
  return theme.replace(/_/g, " ");
}

export function ReviewCycleAnalyzer() {
  const { envId, businessId } = useDomainEnv();
  const [board, setBoard] = useState<OperatorReviewCycleBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOperatorReviewCycles(envId, businessId || undefined);
        if (!cancelled) setBoard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load review cycles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envId, businessId]);

  if (loading) return <p className="text-sm text-bm-muted2">Loading review churn…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!board) return null;

  const { totals } = board;
  const topTheme = board.themes[0];
  const topOffender = board.repeat_offenders[0];

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border border-bm-border/60 bg-black/30 p-4"
        data-testid="review-churn-headline"
      >
        <p className="text-sm text-bm-text">
          {topTheme ? (
            <>
              <span className="font-semibold text-amber-300">{themeLabel(topTheme.theme)}</span> is
              the dominant review theme — {topTheme.total_comments} comments across{" "}
              {topTheme.affected_project_count} project{topTheme.affected_project_count === 1 ? "" : "s"}
              {topOffender && (
                <>
                  . Repeat offender:{" "}
                  <span className="font-semibold text-bm-text">{topOffender.reviewer_name}</span> flagged{" "}
                  {themeLabel(topOffender.theme ?? "")} {topOffender.cycle_count}×.
                </>
              )}
            </>
          ) : (
            "No review comments recorded."
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Comments" value={totals.comment_count.toString()} />
        <KpiTile
          label="Unresolved"
          value={totals.unresolved_count.toString()}
          tone={totals.unresolved_count > 0 ? "warn" : undefined}
        />
        <KpiTile
          label="Blocking"
          value={totals.blocking_count.toString()}
          tone={totals.blocking_count > 0 ? "warn" : undefined}
        />
        <KpiTile label="Max cycle" value={totals.max_cycle_observed.toString()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Theme clusters
          </p>
          <ul className="mt-3 space-y-2">
            {board.themes.slice(0, 6).map((t) => (
              <li
                key={t.theme}
                className="flex items-center justify-between rounded-xl border border-bm-border/50 bg-black/20 px-3 py-2 text-sm"
                data-testid={`review-theme-${t.theme}`}
              >
                <div>
                  <p className="font-medium text-bm-text">{themeLabel(t.theme)}</p>
                  <p className="text-xs text-bm-muted2">
                    {t.affected_project_count} project{t.affected_project_count === 1 ? "" : "s"} ·{" "}
                    {t.unresolved_count} open
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {t.blocking_count > 0 && (
                    <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-400">
                      {t.blocking_count} blocking
                    </span>
                  )}
                  <span className="text-bm-muted2">{t.total_comments} total</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Repeat offenders
          </p>
          {board.repeat_offenders.length === 0 ? (
            <p className="mt-3 text-sm text-bm-muted2">No repeat reviewer-theme pairs.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {board.repeat_offenders.slice(0, 6).map((o, i) => (
                <li
                  key={`${o.reviewer_name}-${o.theme}-${i}`}
                  className="rounded-xl border border-bm-border/50 bg-black/20 px-3 py-2 text-sm"
                  data-testid={`review-offender-${i}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-bm-text">{o.reviewer_name}</p>
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                      {o.cycle_count}×
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-bm-muted2">
                    {o.reviewer_role} · {themeLabel(o.theme ?? "")} · {o.unresolved} open
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
          Cycle churn by project
        </p>
        <table className="mt-3 min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
              <th className="py-1.5">Project</th>
              <th className="py-1.5">Max cycle</th>
              <th className="py-1.5">Unresolved</th>
              <th className="py-1.5">Blocking</th>
            </tr>
          </thead>
          <tbody>
            {board.cycle_churn.map((r) => (
              <tr
                key={r.project_id}
                className="border-t border-bm-border/40"
                data-testid={`review-churn-${r.project_id}`}
              >
                <td className="py-1.5">
                  <Link href={r.href ?? "#"} className="text-bm-text hover:underline">
                    {r.project_name ?? r.project_id}
                  </Link>
                </td>
                <td className={`py-1.5 ${r.max_cycle >= 3 ? "text-red-400" : "text-bm-text"}`}>
                  Cycle {r.max_cycle}
                </td>
                <td className="py-1.5 text-bm-text">{r.unresolved_count}</td>
                <td className={`py-1.5 ${r.blocking_count > 0 ? "text-red-400" : "text-bm-text"}`}>
                  {r.blocking_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

export default ReviewCycleAnalyzer;

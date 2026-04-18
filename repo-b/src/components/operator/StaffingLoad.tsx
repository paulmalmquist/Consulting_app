"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { getOperatorStaffingLoad, OperatorStaffingLoadBoard, OperatorStaffRow } from "@/lib/bos-api";

export function StaffingLoad() {
  const { envId, businessId } = useDomainEnv();
  const [board, setBoard] = useState<OperatorStaffingLoadBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOperatorStaffingLoad(envId, businessId || undefined);
        if (!cancelled) setBoard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load staffing load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envId, businessId]);

  if (loading) return <p className="text-sm text-bm-muted2">Loading team capacity…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!board) return null;

  const { totals } = board;
  const topOverloaded = board.staff.find((s) => s.overloaded);

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border border-bm-border/60 bg-black/30 p-4"
        data-testid="staffing-load-headline"
      >
        <p className="text-sm text-bm-text">
          {totals.overloaded_count > 0 && topOverloaded ? (
            <>
              <span className="font-semibold text-red-400">
                {totals.overloaded_count} overloaded
              </span>{" "}
              of {totals.staff_count} team members ·{" "}
              <span className="font-semibold text-bm-text">{topOverloaded.name}</span> at{" "}
              <span className="text-red-400">{topOverloaded.allocation_total_pct}%</span> across{" "}
              {topOverloaded.project_count} projects
            </>
          ) : (
            <>All {totals.staff_count} team members within healthy load.</>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Team size" value={totals.staff_count.toString()} />
        <KpiTile
          label="Overloaded"
          value={totals.overloaded_count.toString()}
          tone={totals.overloaded_count > 0 ? "warn" : undefined}
        />
        <KpiTile
          label="Avg allocation"
          value={`${Math.round(totals.avg_allocation_pct)}%`}
        />
        <KpiTile label="Projects covered" value={totals.projects_covered.toString()} />
      </div>

      <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
          Team load
        </p>
        <div className="mt-3 space-y-3">
          {board.staff.map((s) => (
            <StaffRow key={s.staff_id} staff={s} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
          Coverage by project
        </p>
        <table className="mt-3 min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
              <th className="py-1.5">Project</th>
              <th className="py-1.5">Total allocation</th>
              <th className="py-1.5">Staff</th>
              <th className="py-1.5">Stretch</th>
            </tr>
          </thead>
          <tbody>
            {board.project_coverage.map((p) => (
              <tr
                key={p.project_id}
                className="border-t border-bm-border/40"
                data-testid={`project-coverage-${p.project_id}`}
              >
                <td className="py-1.5">
                  <Link href={p.href ?? "#"} className="text-bm-text hover:underline">
                    {p.project_name ?? p.project_id}
                  </Link>
                </td>
                <td className={`py-1.5 ${p.total_allocation_pct < 100 ? "text-amber-300" : "text-bm-text"}`}>
                  {p.total_allocation_pct}%
                </td>
                <td className="py-1.5 text-bm-text">{p.staff_count}</td>
                <td className={`py-1.5 ${p.stretch_count > 0 ? "text-amber-300" : "text-bm-muted2"}`}>
                  {p.stretch_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffRow({ staff: s }: { staff: OperatorStaffRow }) {
  const tone = s.overloaded ? "border-red-500/40 bg-red-500/10" : "border-bm-border/50 bg-black/20";
  return (
    <div className={`rounded-xl border ${tone} p-3`} data-testid={`staff-row-${s.staff_id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-bm-text">
            {s.name} <span className="text-xs text-bm-muted2">· {s.role}</span>
          </p>
          <p className="text-xs text-bm-muted2">
            {s.entity_name} · {s.seniority}
          </p>
        </div>
        <span
          data-testid={`staff-allocation-${s.staff_id}`}
          className={`rounded-full border px-2 py-0.5 text-xs ${
            s.overloaded
              ? "border-red-500/40 bg-red-500/15 text-red-400"
              : "border-bm-border/50 bg-white/5 text-bm-text"
          }`}
        >
          {s.allocation_total_pct}% · {s.hours_per_week_total}h
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.projects.map((p) => (
          <Link
            key={`${s.staff_id}-${p.project_id}`}
            href={p.href ?? "#"}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              p.stretch
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-bm-border/40 bg-white/5 text-bm-muted2 hover:bg-white/10"
            }`}
          >
            {p.project_name} · {p.allocation_pct}%
            {p.stretch && " (stretch)"}
          </Link>
        ))}
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

export default StaffingLoad;

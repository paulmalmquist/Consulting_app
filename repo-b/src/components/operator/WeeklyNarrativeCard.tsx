"use client";

import type { OperatorWeeklySummary } from "@/lib/bos-api";
import { fmtMoney } from "@/lib/format-utils";

const POSTURE_TONE: Record<string, string> = {
  defensive: "border-red-400/40 bg-red-500/10 text-red-200",
  stable: "border-slate-400/40 bg-slate-500/10 text-slate-200",
  aggressive: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
};

function posturePillClass(posture: string | undefined) {
  const key = (posture || "stable").toLowerCase();
  return POSTURE_TONE[key] ?? POSTURE_TONE.stable;
}

function formatDays(days: number | null | undefined): string | null {
  if (days == null) return null;
  return `${days > 0 ? "+" : ""}${days}d`;
}

export function WeeklyNarrativeCard({ summary }: { summary: OperatorWeeklySummary }) {
  return (
    <section
      data-testid="weekly-narrative"
      className="rounded-3xl border border-bm-border/70 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.05),transparent_42%),linear-gradient(180deg,rgba(14,20,28,0.94),rgba(10,14,20,0.95))] p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-bm-muted2">
            Week of {summary.week_of}
          </p>
          <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-amber-300/90">
            Critical path
          </p>
          <p className="mt-1 max-w-3xl text-[15px] leading-snug text-amber-100">
            {summary.critical_path}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${posturePillClass(summary.operating_posture)}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {summary.operating_posture} posture
        </span>
      </div>

      <h2 className="mt-4 max-w-4xl font-display text-[22px] leading-snug text-bm-text sm:text-2xl">
        {summary.headline}
      </h2>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            Key shifts
          </p>
          <ul className="mt-3 space-y-2">
            {summary.key_shifts.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-bm-text/90">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-bm-muted2" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            Top risks
          </p>
          <div className="mt-3 space-y-2">
            {summary.top_risks.map((risk) => {
              const days = formatDays(risk.impact_days);
              return (
                <div
                  key={risk.label}
                  className="flex flex-wrap items-center gap-2 rounded-2xl border border-bm-border/50 bg-black/30 px-3 py-2"
                >
                  <span className="text-sm text-bm-text">{risk.label}</span>
                  {risk.impact_usd != null ? (
                    <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-100">
                      {fmtMoney(risk.impact_usd)}
                    </span>
                  ) : null}
                  {days ? (
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100">
                      {days}
                    </span>
                  ) : null}
                  {risk.time_to_failure_days != null && risk.time_to_failure_days <= 14 ? (
                    <span className="rounded-full border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-100">
                      {risk.time_to_failure_days}d to failure
                    </span>
                  ) : null}
                  <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                    {risk.confidence} conf
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {summary.recommended_actions.length ? (
        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            Do this now
          </p>
          <ol className="mt-2 space-y-1 text-sm text-bm-text/90">
            {summary.recommended_actions.map((line, idx) => (
              <li key={line} className="flex gap-3">
                <span className="mt-0.5 text-xs text-bm-muted2">{idx + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

export default WeeklyNarrativeCard;

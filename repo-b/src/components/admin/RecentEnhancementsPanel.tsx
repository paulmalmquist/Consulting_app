"use client";

import { cn } from "@/lib/cn";

type Enhancement = {
  id: string;
  title: string;
  commitId: string;
  date: string;
  status: "confirmed";
};

const ENHANCEMENTS: Enhancement[] = [
  {
    id: "1",
    title: "Trading Lab bound to global theme toggle",
    commitId: "1122bf7c",
    date: "Mar 28, 2026",
    status: "confirmed",
  },
  {
    id: "2",
    title: "CRM Lane A narration fix, win/loss capture, score breakdown UI",
    commitId: "fb22b594",
    date: "Mar 27, 2026",
    status: "confirmed",
  },
  {
    id: "3",
    title: "CRM entity detail pages, pipeline links, command center CRO overview",
    commitId: "6dd7ccf8",
    date: "Mar 27, 2026",
    status: "confirmed",
  },
  {
    id: "4",
    title: "CRM transformed into action-driven deal system",
    commitId: "8ea1f898",
    date: "Mar 26, 2026",
    status: "confirmed",
  },
  {
    id: "5",
    title: "PDS Tech Adoption crash and data contract fixes",
    commitId: "6b2b51e4",
    date: "Mar 26, 2026",
    status: "confirmed",
  },
  {
    id: "6",
    title: "Meridian asset size display and investment sub-records",
    commitId: "2518efa1",
    date: "Mar 25, 2026",
    status: "confirmed",
  },
  {
    id: "7",
    title: "Winston page Suspense boundary for useSearchParams",
    commitId: "9a614b9f",
    date: "Mar 25, 2026",
    status: "confirmed",
  },
  {
    id: "8",
    title: "PDS NaN display bugs resolved, schedule page built",
    commitId: "8de5ab54",
    date: "Mar 24, 2026",
    status: "confirmed",
  },
];

export function RecentEnhancementsPanel({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "rounded-xl border border-bm-success/12 bg-[linear-gradient(180deg,hsl(var(--bm-surface)/0.82),hsl(var(--bm-surface)/0.72))] p-5 shadow-[0_18px_34px_-30px_rgba(5,9,14,0.88)]",
        className,
      )}
    >
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
          Changelog
        </p>
        <h2 className="text-lg font-semibold text-bm-text">
          Recent Enhancements
        </h2>
        <p className="text-sm leading-relaxed text-bm-muted">
          Confirmed features and fixes deployed to production.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {ENHANCEMENTS.map((e) => (
          <div
            key={e.id}
            className="rounded-xl border border-bm-success/10 bg-bm-surface/60 px-4 py-3 transition-[background-color,border-color] duration-panel hover:bg-bm-surface/80"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bm-success" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-bm-text">
                  {e.title}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[12px] text-bm-muted">
                  <code className="rounded bg-bm-surface2/60 px-1.5 py-0.5 font-mono text-[11px] text-bm-muted2">
                    {e.commitId}
                  </code>
                  <span>{e.date}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

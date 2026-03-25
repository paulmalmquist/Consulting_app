"use client";

import SectionHeader from "../shared/SectionHeader";
import { BRIEFING_CONTAINER } from "../shared/briefing-colors";
import { getMockICReview } from "../mock-data";

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/20",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  conditional: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
};

export default function ICReviewPanel() {
  const review = getMockICReview();

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader eyebrow="IC REVIEW" title="Investment Committee" />

      <div className="mt-5 space-y-4">
        {/* Status + date */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.1em] ${STATUS_STYLES[review.status]}`}
          >
            {review.status}
          </span>
          <span className="text-sm text-bm-muted2">{review.date}</span>
        </div>

        {/* Notes */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/8 dark:bg-white/[0.02]">
          <p className="text-sm leading-relaxed text-bm-text">{review.notes}</p>
        </div>

        {/* Committee */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Committee Members
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {review.members.map((m) => (
              <span
                key={m}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-bm-text dark:border-white/10 dark:bg-white/[0.03]"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * HistoryRhymesDataStateBanner — honesty strip on top of the History Rhymes surface.
 *
 * Three states, explicit and painfully honest:
 *   - "preview"  — synthetic fixture data. None of the rendered numbers are real.
 *   - "seeded"   — backend-connected to the static historical episode library.
 *                  Not a live current-market match.
 *   - "live"     — current-market analog match computed from live inputs.
 *                  RESERVED. The UI must not flip to this state until the full
 *                  state-vector + pgvector + multi-agent pipeline ships (T3.1).
 *
 * Rule (see plan Loop 1): if any rendered numeric surface on the History Rhymes
 * page is fixture-backed, the banner stays "preview" regardless of whether
 * `episodes` loaded. Promotion to "seeded" requires every surface be
 * backend-sourced. This loop does not attempt "live".
 */

export type HistoryRhymesDataState = "preview" | "seeded" | "live";

export interface HistoryRhymesDataStateBannerProps {
  state: HistoryRhymesDataState;
  /** Optional count surfaced in the seeded copy, e.g. 8 seeded episodes. */
  episodeCount?: number;
  /** Optional error context to show alongside the preview state. */
  errorNote?: string | null;
}

const COPY: Record<HistoryRhymesDataState, { eyebrow: string; headline: string; detail: string; tone: "amber" | "sky" | "emerald" }> = {
  preview: {
    eyebrow: "PREVIEW",
    headline: "Synthetic fixture data. None of the numbers below are real.",
    detail:
      "The History Rhymes intelligence layer is scaffolded but not yet wired to live market inputs. This page is showing hardcoded demo data so the shape of the product is visible.",
    tone: "amber",
  },
  seeded: {
    eyebrow: "SEEDED",
    headline: "Backend-connected to the historical episode library.",
    detail:
      "Not a live current-market match. The episode list below is sourced from the Supabase seed; the trajectory overlays, agent forecasts, and trap checks remain fixture-backed until the full pipeline ships.",
    tone: "sky",
  },
  live: {
    eyebrow: "LIVE",
    headline: "Current-market analog match computed from live inputs.",
    detail:
      "Every numeric surface is sourced from the multi-agent forecaster and pgvector analog retrieval. Confidence and Brier calibration reflect the most recent run.",
    tone: "emerald",
  },
};

const TONE_STYLES: Record<"amber" | "sky" | "emerald", { border: string; bg: string; eyebrow: string; text: string }> = {
  amber: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    eyebrow: "text-amber-200",
    text: "text-amber-50",
  },
  sky: {
    border: "border-sky-500/40",
    bg: "bg-sky-500/10",
    eyebrow: "text-sky-200",
    text: "text-sky-50",
  },
  emerald: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    eyebrow: "text-emerald-200",
    text: "text-emerald-50",
  },
};

export function HistoryRhymesDataStateBanner({
  state,
  episodeCount,
  errorNote,
}: HistoryRhymesDataStateBannerProps) {
  const copy = COPY[state];
  const tone = TONE_STYLES[copy.tone];

  const headline =
    state === "seeded" && typeof episodeCount === "number"
      ? `${copy.headline} ${episodeCount} seeded ${episodeCount === 1 ? "episode" : "episodes"}.`
      : copy.headline;

  return (
    <div
      data-testid="history-rhymes-data-state-banner"
      data-state={state}
      className={`rounded-lg border ${tone.border} ${tone.bg} px-4 py-3`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`inline-flex shrink-0 items-center rounded-full border ${tone.border} px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${tone.eyebrow}`}
        >
          {copy.eyebrow}
        </span>
        <div className={`flex-1 space-y-1 ${tone.text}`}>
          <p className="text-sm font-semibold leading-6">{headline}</p>
          <p className="text-xs leading-5 opacity-90">{copy.detail}</p>
          {errorNote ? (
            <p className="text-[11px] leading-5 opacity-75" data-testid="history-rhymes-data-state-error-note">
              Backend note: {errorNote}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default HistoryRhymesDataStateBanner;

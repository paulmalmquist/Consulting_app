export const BRIEFING_COLORS = {
  performance: "#2EB67D",
  capital: "#C8A23A",
  structure: "#1F2A44",
  label: "#6B7280",
  risk: "#F2A900",
  lineMuted: "#94A3B8",
} as const;

/** Standard container classes matching the investment-page briefing style. */
export const BRIEFING_CONTAINER =
  "rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))]";

/** Inner card classes (charts, tables). */
export const BRIEFING_CARD =
  "rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/8 dark:bg-white/[0.02]";

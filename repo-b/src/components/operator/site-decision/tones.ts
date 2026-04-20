export const RECOMMENDATION_TONE: Record<string, string> = {
  proceed: "border-emerald-400/50 bg-emerald-500/15 text-emerald-100",
  proceed_with_conditions: "border-amber-400/50 bg-amber-500/15 text-amber-100",
  hold: "border-orange-400/50 bg-orange-500/15 text-orange-100",
  reject: "border-red-400/50 bg-red-500/15 text-red-100",
};

export const RECOMMENDATION_LABEL: Record<string, string> = {
  proceed: "Proceed",
  proceed_with_conditions: "Proceed with Conditions",
  hold: "Hold",
  reject: "Reject",
};

export const SEVERITY_TONE: Record<string, string> = {
  red: "border-red-400/50 bg-red-500/10 text-red-200",
  amber: "border-amber-400/50 bg-amber-500/10 text-amber-100",
};

export const KPI_TONE: Record<string, string> = {
  green: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  amber: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  red: "border-red-400/40 bg-red-500/10 text-red-200",
  gray: "border-white/10 bg-white/5 text-bm-muted2",
};

export const STATUS_TONE: Record<string, string> = {
  on_track: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  at_risk: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  blocked: "border-red-400/40 bg-red-500/10 text-red-200",
};

"use client";

import type { ModelCard as ModelCardType } from "@/lib/historyrhymes/mlDemo";
import { DotScale } from "./mlUi";

const DIM_LABELS: Record<string, string> = {
  interpretability: "Interpretability",
  handles_nonlinearity: "Handles nonlinearity",
  handles_high_dim: "Handles high-dim",
  training_speed: "Training speed",
  robust_to_outliers: "Robust to outliers",
  needs_scaling: "Needs scaling",
};

function Row({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-amber-300" : "text-neutral-300";
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-xs ${color}`}>{value}</div>
    </div>
  );
}

export function ModelCard({ card }: { card: ModelCardType }) {
  if (!card || !card.best_for) {
    return <div className="text-xs text-neutral-500">Model card unavailable.</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
      <div>
        <Row label="Why this fits" value={card.best_for} tone="good" />
        <Row label="Recommended when" value={card.recommended_when} tone="good" />
        <Row label="Decision this informs" value={card.decision_this_informs} />
        <Row label="Preprocessing" value={card.preprocessing} />
      </div>
      <div>
        <Row label="Why this does not fit" value={card.not_for} tone="bad" />
        <Row label="Avoid when" value={card.avoid_when} tone="bad" />
        <Row label="Limitations" value={card.limitations} tone="bad" />
      </div>
      <div className="md:col-span-2 mt-1">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Fit profile (editorial, not a benchmark)</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(card.fit_score_dimensions).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>{DIM_LABELS[k] ?? k}</span>
              <DotScale value={v} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

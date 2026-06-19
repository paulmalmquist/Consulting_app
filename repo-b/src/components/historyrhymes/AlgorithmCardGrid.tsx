"use client";

import type { AlgorithmResult, FitScoreDimensions } from "@/lib/historyrhymes/mlDemo";
import type { QuestionFilter } from "./BusinessQuestionSelector";
import { DotScale, Tag, fmt } from "./mlUi";

const TASK_TONE: Record<string, "sky" | "emerald" | "violet" | "amber" | "neutral"> = {
  regression: "emerald",
  classification: "sky",
  text_classification: "violet",
  clustering: "amber",
  dim_reduction: "neutral",
};

function headline(a: AlgorithmResult): string {
  if (a.status !== "ok") return "not available";
  const m = a.metrics;
  if (a.task_type === "regression") return `R² ${fmt(m.r2 as number)}`;
  if (a.task_type === "classification") return `F1 ${fmt(m.f1 as number)}`;
  if (a.task_type === "text_classification") return `F1 ${fmt(m.f1_macro as number)}`;
  if (a.task_type === "clustering") return `Silhouette ${fmt(m.silhouette as number)}`;
  if (a.task_type === "dim_reduction") {
    const cum = m.cumulative_explained_variance as number[] | undefined;
    return cum ? `Var ${fmt(cum[cum.length - 1])}` : "—";
  }
  return "—";
}

export function AlgorithmCardGrid({
  algorithms,
  filter,
  selectedId,
  onSelect,
}: {
  algorithms: AlgorithmResult[];
  filter: QuestionFilter;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {algorithms.map((a) => {
        const fits = filter === "all" || a.task_type === filter;
        const card = a.model_card as { fit_score_dimensions?: FitScoreDimensions };
        const dims = card?.fit_score_dimensions;
        const selected = a.algorithm_id === selectedId;
        return (
          <button
            key={a.algorithm_id}
            type="button"
            data-testid="hr-ml-algo-card"
            onClick={() => onSelect(a.algorithm_id)}
            className={`text-left bg-neutral-900 border rounded-lg p-3 transition-colors ${
              selected
                ? "border-sky-500/60"
                : fits
                  ? "border-neutral-700 hover:border-neutral-500"
                  : "border-neutral-800 opacity-50 hover:opacity-80"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-neutral-100">{a.name}</span>
              <Tag tone={TASK_TONE[a.task_type ?? "neutral"] ?? "neutral"}>
                {(a.task_type ?? "").replace(/_/g, " ")}
              </Tag>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2">{a.business_question}</p>
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${a.status === "ok" ? "text-emerald-300" : "text-amber-300"}`}>
                {headline(a)}
              </span>
              {dims ? (
                <span className="flex items-center gap-1 text-[10px] text-neutral-500">
                  interp <DotScale value={dims.interpretability} />
                </span>
              ) : null}
            </div>
            {a.status !== "ok" && a.null_reason ? (
              <div className="text-[10px] text-amber-400/80 mt-1 truncate">{a.null_reason}</div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

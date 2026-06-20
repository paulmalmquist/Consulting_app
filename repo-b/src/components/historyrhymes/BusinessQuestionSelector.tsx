"use client";

import type { TaskType } from "@/lib/historyrhymes/mlDemo";

export type QuestionFilter = TaskType | "all";

const QUESTIONS: Array<{ key: QuestionFilter; label: string }> = [
  { key: "all", label: "All questions" },
  { key: "regression", label: "Predict a number" },
  { key: "classification", label: "Classify risk" },
  { key: "text_classification", label: "Classify narrative text" },
  { key: "clustering", label: "Discover hidden regimes" },
  { key: "dim_reduction", label: "Reduce dimensionality" },
];

export function BusinessQuestionSelector({
  selected,
  onSelect,
}: {
  selected: QuestionFilter;
  onSelect: (q: QuestionFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Business question">
      {QUESTIONS.map((q) => {
        const active = selected === q.key;
        return (
          <button
            key={q.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(q.key)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              active
                ? "bg-sky-500/20 text-sky-200 border-sky-500/40"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200"
            }`}
          >
            {q.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import type { CompareRow } from "@/lib/historyrhymes/mlDemo";
import { DotScale, Panel, fmt } from "./mlUi";

const DIM_LABELS: Record<string, string> = {
  interpretability: "Interpretable",
  handles_nonlinearity: "Nonlinear",
  handles_high_dim: "High-dim",
  training_speed: "Train speed",
  robust_to_outliers: "Robust",
  needs_scaling: "Needs scaling",
};

export function AlgorithmComparisonMatrix({
  dimensions,
  rows,
  onSelect,
}: {
  dimensions: string[];
  rows: CompareRow[];
  onSelect: (id: string) => void;
}) {
  return (
    <Panel title="Comparison matrix">
      <p className="text-[11px] text-neutral-500 mb-3">
        There is no universal winner. The right algorithm depends on the target, data shape,
        interpretability need, latency budget, and cost of being wrong.
      </p>
      <div className="overflow-x-auto" data-testid="hr-ml-compare-matrix">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-neutral-500 text-left">
              <th className="px-2 py-1.5 border-b border-neutral-800 font-medium">Algorithm</th>
              <th className="px-2 py-1.5 border-b border-neutral-800 font-medium">Type</th>
              {dimensions.map((d) => (
                <th key={d} className="px-2 py-1.5 border-b border-neutral-800 font-medium whitespace-nowrap">
                  {DIM_LABELS[d] ?? d}
                </th>
              ))}
              <th className="px-2 py-1.5 border-b border-neutral-800 font-medium">Headline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.algorithm_id}
                onClick={() => onSelect(r.algorithm_id)}
                className="border-b border-neutral-900 cursor-pointer hover:bg-neutral-800/50"
              >
                <td className="px-2 py-1.5 text-neutral-100 font-medium whitespace-nowrap">{r.name}</td>
                <td className="px-2 py-1.5 text-neutral-400 whitespace-nowrap">
                  {(r.task_type ?? "").replace(/_/g, " ")}
                </td>
                {dimensions.map((d) => (
                  <td key={d} className="px-2 py-1.5">
                    <DotScale value={(r.fit_score_dimensions as unknown as Record<string, number>)[d] ?? 0} />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-neutral-300 whitespace-nowrap">
                  {r.headline_metric.value != null
                    ? `${r.headline_metric.label} ${fmt(r.headline_metric.value)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

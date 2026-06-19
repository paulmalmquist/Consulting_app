"use client";

import type { AlgorithmResult } from "@/lib/historyrhymes/mlDemo";
import { StatTile, Tag, fmt } from "./mlUi";

/** Honest classification metrics + Reality Mode overlays (cost, leakage, policy, latency). */
export function HonestMetricsPanel({ result }: { result: AlgorithmResult }) {
  const m = result.metrics;
  const reality = result.reality;
  const isClassification = result.task_type === "classification";

  return (
    <div className="space-y-3">
      {isClassification ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <StatTile label="Accuracy" value={fmt(m.accuracy as number)} />
          <StatTile label="Precision" value={fmt(m.precision as number)} />
          <StatTile label="Recall" value={fmt(m.recall as number)} />
          <StatTile label="F1" value={fmt(m.f1 as number)} />
          <StatTile label="ROC-AUC" value={m.roc_auc != null ? fmt(m.roc_auc as number) : "—"} />
        </div>
      ) : null}

      {isClassification ? (
        <p className="text-[10px] text-neutral-600">
          Under class imbalance, accuracy can stay high while recall collapses — read precision/recall/F1, not accuracy.
        </p>
      ) : null}

      {reality?.cost_of_error ? (
        <div className="rounded border border-neutral-800 p-3">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Cost of error</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <span className="text-neutral-400">FP cost: <span className="text-neutral-200">{String(reality.cost_of_error.fp_cost)}</span></span>
            <span className="text-neutral-400">FN cost: <span className="text-neutral-200">{String(reality.cost_of_error.fn_cost)}</span></span>
            <span className="text-neutral-400">Total cost: <span className="text-neutral-200">{String(reality.cost_of_error.total_cost)}</span></span>
            <span className="text-neutral-400">Business score: <span className="text-emerald-300">{String(reality.cost_of_error.business_adjusted_score)}</span></span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {reality?.leakage ? <Tag tone="red">Leakage: {String(reality.leakage.status)}</Tag> : null}
        {reality?.drift ? <Tag tone="amber">Drift detected</Tag> : null}
        {reality?.freshness ? <Tag tone="amber">Stale drivers</Tag> : null}
        {reality?.latency ? (
          <Tag tone={reality.latency.eligible ? "emerald" : "red"}>
            Latency {reality.latency.estimated_ms}ms / {reality.latency.budget_ms}ms · {reality.latency.eligible ? "eligible" : "excluded"}
          </Tag>
        ) : null}
        {reality?.policy ? <Tag tone="sky">Policy: {String(reality.policy.final_action)}</Tag> : null}
        {reality?.directional_read ? <Tag tone="violet">Read: {reality.directional_read}</Tag> : null}
      </div>

      {reality?.leakage ? (
        <p className="text-[11px] text-amber-300">{String(reality.leakage.warning)}</p>
      ) : null}
      {reality?.notes && reality.notes.length > 0 ? (
        <ul className="text-[11px] text-neutral-500 list-disc pl-4">
          {reality.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

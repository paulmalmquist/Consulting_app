"use client";

import * as React from "react";
import type { Curveball, Scenario } from "@/lib/historyrhymes/mlDemo";
import { Panel } from "./mlUi";

/**
 * Reality Mode: toggles + parameters that mutate the dataset/eval contract.
 * Clean mode (no toggles) makes models look reasonable; Reality mode makes the
 * tradeoffs obvious.
 */
export function RealityModePanel({
  curveballs,
  scenario,
  onChange,
}: {
  curveballs: Curveball[];
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}) {
  const enabled = new Set(scenario.toggles);

  const toggle = (id: string) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...scenario, toggles: Array.from(next) });
  };

  const setParam = (key: keyof Scenario, value: number | string) => {
    onChange({ ...scenario, [key]: value });
  };

  const groups = React.useMemo(() => {
    const g: Record<string, Curveball[]> = {};
    for (const c of curveballs) (g[c.ui_group] ??= []).push(c);
    return g;
  }, [curveballs]);

  return (
    <Panel
      title="Reality Mode"
      right={
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500">
            {enabled.size === 0 ? "Clean demo mode" : `${enabled.size} curveball${enabled.size > 1 ? "s" : ""} active`}
          </span>
          {enabled.size > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ toggles: [] })}
              className="text-[10px] text-neutral-400 hover:text-sky-300 underline"
            >
              Reset
            </button>
          ) : null}
        </div>
      }
    >
      <p className="text-[11px] text-neutral-500 mb-3">
        The algorithm is only one decision. The real system must handle time, leakage, missingness, stale data,
        false alarms, cost of error, adversarial signals, and business constraints.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{group}</div>
            <ul className="space-y-1">
              {items.map((c) => (
                <li key={c.id}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="mt-0.5 accent-sky-500"
                      data-testid={`hr-ml-toggle-${c.id}`}
                    />
                    <span>
                      <span className="text-xs text-neutral-200">{c.label}</span>
                      <span className="block text-[10px] text-neutral-500">{c.demo_lesson}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-neutral-800">
        <NumberField label="FP cost" value={scenario.fp_cost ?? 1} onChange={(v) => setParam("fp_cost", v)} />
        <NumberField label="FN cost" value={scenario.fn_cost ?? 10} onChange={(v) => setParam("fn_cost", v)} />
        <NumberField label="Confidence ≥" value={scenario.confidence_threshold ?? 0.8} step={0.05} onChange={(v) => setParam("confidence_threshold", v)} />
        <NumberField label="Latency budget ms" value={scenario.latency_budget_ms ?? 100} step={10} onChange={(v) => setParam("latency_budget_ms", v)} />
        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Split mode</div>
          <select
            value={scenario.split_mode ?? "random"}
            onChange={(e) => setParam("split_mode", e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200"
          >
            <option value="random">Random</option>
            <option value="time">Time</option>
            <option value="episode_grouped">Episode-grouped</option>
          </select>
        </div>
      </div>
    </Panel>
  );
}

function NumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200"
      />
    </div>
  );
}

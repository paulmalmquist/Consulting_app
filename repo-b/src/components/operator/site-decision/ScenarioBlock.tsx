"use client";

import type { OperatorSiteDecisionScenarios } from "@/lib/bos-api";

function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}

function fmtMoneyM(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${(v / 1_000_000).toFixed(1)}M`;
}

function fmtDays(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}d`;
}

export function ScenarioBlock({
  scenarios,
  failCondition,
  failNullReason,
}: {
  scenarios: OperatorSiteDecisionScenarios | null;
  failCondition: string | null;
  failNullReason: string | null;
}) {
  const presets = scenarios?.presets || [];
  const active = scenarios?.active_ordinance_impact || null;

  if (!presets.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-bm-muted2">
        Scenarios not available — {failNullReason || "development scenarios not yet generated"}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-bm-muted2">
          Scenario economics
        </h3>
        {active ? (
          <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
            Active ordinance impact applied
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {presets.map((p) => {
          const isBase = p.id === "base";
          return (
            <div
              key={p.id}
              className={`rounded-xl border p-4 ${
                isBase
                  ? "border-emerald-400/40 bg-emerald-500/5"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-bm-muted2">
                  {p.label}
                </span>
                {isBase ? (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-200">
                    Base
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[10px] uppercase text-bm-muted2">IRR</div>
                  <div className="text-lg font-semibold text-bm-text">
                    {fmtPct(p.outputs?.irr_pct)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-bm-muted2">Margin</div>
                  <div className="text-lg font-semibold text-bm-text">
                    {fmtPct(p.outputs?.profit_margin_pct)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-bm-muted2">Timeline</div>
                  <div className="text-sm font-medium text-bm-text">
                    {fmtDays(p.outputs?.timeline_days)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-bm-muted2">Dev cost</div>
                  <div className="text-sm font-medium text-bm-text">
                    {fmtMoneyM(p.outputs?.total_dev_cost_usd)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/5 p-3 text-sm">
        <div className="text-[11px] uppercase tracking-[0.16em] text-red-200">
          Fail condition
        </div>
        <div className="mt-1 text-bm-text">
          {failCondition ||
            `Not available — ${failNullReason || "scenarios missing"}`}
        </div>
      </div>
    </div>
  );
}

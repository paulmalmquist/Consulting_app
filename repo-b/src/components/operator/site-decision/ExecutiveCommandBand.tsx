"use client";

import type {
  OperatorSiteDecision,
  OperatorSiteDecisionKpi,
} from "@/lib/bos-api";
import { KPI_TONE, RECOMMENDATION_LABEL, RECOMMENDATION_TONE } from "./tones";

function fmtKpiValue(kpi: OperatorSiteDecisionKpi): string {
  if (kpi.null_reason) return "—";
  if (kpi.value_pct != null && kpi.hurdle_pct != null) {
    const delta = kpi.value_pct - kpi.hurdle_pct;
    const sign = delta >= 0 ? "+" : "";
    return `${kpi.value_pct.toFixed(1)}% (${sign}${delta.toFixed(1)} vs ${kpi.hurdle_pct}%)`;
  }
  if (kpi.key === "dev_cost_vs_comps" && kpi.value_usd != null) {
    return `$${(kpi.value_usd / 1_000_000).toFixed(1)}M · median cycle ${
      kpi.comp_cycle_days_median != null ? `${Math.round(kpi.comp_cycle_days_median)}d` : "—"
    }`;
  }
  if (kpi.key === "capital_required" && kpi.value_usd != null) {
    return `$${(kpi.value_usd / 1_000_000).toFixed(1)}M @ ${Math.round(
      (kpi.assumed_debt_ratio ?? 0) * 100
    )}% debt`;
  }
  if (kpi.key === "top_downside_risk" && kpi.risk_label) {
    const bps = kpi.irr_impact_bps;
    const bpsStr = bps == null ? "—" : `${bps > 0 ? "+" : ""}${bps} bps`;
    return `${bpsStr} · ${kpi.risk_label.slice(0, 48)}${kpi.risk_label.length > 48 ? "…" : ""}`;
  }
  return "—";
}

export function ExecutiveCommandBand({
  data,
  onAction,
}: {
  data: OperatorSiteDecision;
  onAction: (action: "assumptions" | "risks" | "assign" | "comps" | "memo") => void;
}) {
  const recTone = RECOMMENDATION_TONE[data.recommendation] || RECOMMENDATION_TONE.hold;
  const recLabel = RECOMMENDATION_LABEL[data.recommendation] || data.recommendation;

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-4 sm:p-5">
      {/* Row 1 — identity */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-bm-muted2">
        <span className="text-sm font-semibold text-bm-text">{data.site.name}</span>
        {data.site.municipality_name ? (
          <>
            <span>·</span>
            <span>{data.site.municipality_name}</span>
          </>
        ) : null}
        {data.site.target_project_type ? (
          <>
            <span>·</span>
            <span>{data.site.target_project_type}</span>
          </>
        ) : null}
        {data.site.status ? (
          <>
            <span>·</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase">
              {data.site.status.replace(/_/g, " ")}
            </span>
          </>
        ) : null}
        <span className="ml-auto">
          Updated {data.recommendation_updated_at} · {data.recommendation_owner}
        </span>
      </div>

      {/* Row 2 — recommendation + conviction + fail condition */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold uppercase tracking-[0.12em] ${recTone}`}
        >
          {recLabel}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
            <span>Conviction</span>
            <span className="text-bm-text">{data.conviction}/100</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full ${
                data.conviction >= 75
                  ? "bg-emerald-400"
                  : data.conviction >= 55
                    ? "bg-amber-400"
                    : data.conviction >= 35
                      ? "bg-orange-400"
                      : "bg-red-400"
              }`}
              style={{ width: `${Math.max(2, Math.min(100, data.conviction))}%` }}
            />
          </div>
        </div>
        <div className="text-xs text-red-200 lg:text-right">
          <div className="uppercase tracking-[0.16em] text-bm-muted2">Fails if</div>
          <div className="mt-0.5 text-bm-text">
            {data.fail_condition ||
              `Not available — ${
                data.fail_condition_null_reason || "no fail condition derived"
              }`}
          </div>
        </div>
      </div>

      {/* Row 3 — 4-KPI strip */}
      <div className="mt-4 grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(220px,1fr)] gap-2 overflow-x-auto pb-1 sm:grid-cols-4 sm:grid-flow-row sm:overflow-visible">
        {data.kpis.map((kpi) => (
          <div
            key={kpi.key}
            className={`snap-start rounded-xl border p-3 ${
              KPI_TONE[kpi.tone] || KPI_TONE.gray
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.16em] opacity-80">
              {kpi.label}
            </div>
            <div className="mt-2 text-sm font-semibold">{fmtKpiValue(kpi)}</div>
            {kpi.null_reason ? (
              <div className="mt-1 text-[10px] opacity-75">{kpi.null_reason}</div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Row 4 — AI decision summary */}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-bm-text">
        {data.decision_summary}
      </div>

      {/* Row 5 — CTA row */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onAction("assumptions")}
          className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-bm-text hover:bg-white/10"
        >
          Review assumptions
        </button>
        <button
          type="button"
          onClick={() => onAction("risks")}
          className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-bm-text hover:bg-white/10"
        >
          Open risks
        </button>
        <button
          type="button"
          onClick={() => onAction("assign")}
          className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-bm-text hover:bg-white/10"
        >
          Assign diligence
        </button>
        <button
          type="button"
          onClick={() => onAction("comps")}
          className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-bm-text hover:bg-white/10"
        >
          Compare comps
        </button>
        <button
          type="button"
          onClick={() => onAction("memo")}
          className="ml-auto rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/20"
        >
          Export IC memo
        </button>
      </div>
    </section>
  );
}

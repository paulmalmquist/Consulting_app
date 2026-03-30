"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { ApiAnalogMatch } from "@/components/market/hooks/useDecisionEngine";

interface DivergenceTableProps {
  currentSignals: Record<string, unknown>;
  topMatch: ApiAnalogMatch;
}

const SIGNAL_LABELS: Record<string, string> = {
  sp500_return_1m: "S&P 500 1M Return",
  sp500_return_3m: "S&P 500 3M Return",
  sp500_return_12m: "S&P 500 12M Return",
  vix_level: "VIX Level",
  vix_term_structure: "VIX Term Structure",
  yield_curve_10y2y: "Yield Curve 10Y-2Y",
  credit_spread_hy: "HY Credit Spread",
  fed_funds_rate: "Fed Funds Rate",
  cpi_yoy: "CPI YoY",
  pmi_manufacturing: "PMI Manufacturing",
  unemployment_rate: "Unemployment Rate",
  btc_return_1m: "BTC 1M Return",
  btc_mvrv_zscore: "BTC MVRV Z-Score",
  crypto_fear_greed: "Crypto Fear/Greed",
  btc_dominance: "BTC Dominance",
  case_shiller_yoy: "Case-Shiller YoY",
  housing_starts_saar: "Housing Starts (SAAR)",
  mortgage_rate_30y: "30Y Mortgage Rate",
  cmbs_delinquency_rate: "CMBS Delinquency",
  office_vacancy_rate: "Office Vacancy",
  aaii_bull_pct: "AAII Bull %",
  aaii_bear_pct: "AAII Bear %",
  put_call_ratio: "Put/Call Ratio",
  margin_debt_yoy: "Margin Debt YoY",
};

const EXCLUDED_KEYS = new Set([
  "id", "episode_id", "signal_date", "signal_vector",
  "created_at", "updated_at",
]);

export function DivergenceTable({ currentSignals, topMatch }: DivergenceTableProps) {
  const topAnalog = topMatch.matches?.[0];

  // Build divergence rows from current signals
  const rows = Object.entries(currentSignals)
    .filter(([key, val]) => !EXCLUDED_KEYS.has(key) && val != null && typeof val === "number")
    .map(([key, val]) => {
      const current = val as number;
      const label = SIGNAL_LABELS[key] ?? key.replace(/_/g, " ");
      // We don't have per-signal analog values from the API yet, so show current only
      return { key, label, current, analogValue: null as number | null, delta: 0, absDelta: 0 };
    })
    .sort((a, b) => b.absDelta - a.absDelta);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Divergence Table — Current vs {topAnalog?.episode_name ?? "Top Analog"}
        </p>
        <Badge variant="accent">SEED</Badge>
      </div>

      {topAnalog && (
        <div className="flex gap-4 mb-3 text-xs text-bm-muted">
          <span>Rhyme: <span className="text-bm-accent font-bold">{topAnalog.rhyme_score?.toFixed(2)}</span></span>
          <span>Cosine: {topAnalog.cosine_sim?.toFixed(2)}</span>
          <span>DTW: {topAnalog.dtw_distance?.toFixed(2)}</span>
          <span>Categorical: {topAnalog.categorical_match?.toFixed(2)}</span>
        </div>
      )}

      <div className="overflow-auto max-h-80">
        <table className="w-full text-xs font-mono">
          <thead className="border-b border-bm-border/30">
            <tr>
              <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Feature</th>
              <th className="text-right py-1.5 text-[9px] text-bm-muted2 uppercase">Current</th>
              <th className="text-right py-1.5 text-[9px] text-bm-muted2 uppercase">Analog</th>
              <th className="text-right py-1.5 text-[9px] text-bm-muted2 uppercase">Delta</th>
              <th className="text-left py-1.5 text-[9px] text-bm-muted2 uppercase">Interpretation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-bm-border/20">
                <td className="py-1.5 text-bm-text">{r.label}</td>
                <td className="py-1.5 text-right text-bm-text">
                  {typeof r.current === "number" ? r.current.toFixed(2) : r.current}
                </td>
                <td className="py-1.5 text-right text-bm-muted">
                  {r.analogValue != null ? r.analogValue.toFixed(2) : "—"}
                </td>
                <td className={`py-1.5 text-right ${
                  r.delta > 0 ? "text-emerald-400" : r.delta < 0 ? "text-red-400" : "text-bm-muted2"
                }`}>
                  {r.delta !== 0 ? (r.delta > 0 ? "+" : "") + r.delta.toFixed(2) : "—"}
                </td>
                <td className="py-1.5 text-bm-muted2 text-[10px]">
                  {r.analogValue == null ? "Awaiting analog data" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-bm-muted2 mt-3 italic">
        Full divergence analysis requires episode-level signal comparison. Currently showing current state vector features.
        Analog delta will populate when episode_signals data is loaded for the matched episode.
      </p>
    </Card>
  );
}

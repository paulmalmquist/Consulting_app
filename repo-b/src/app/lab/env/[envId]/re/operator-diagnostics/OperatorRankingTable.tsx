"use client";

import type { ReV2OperatorDiagnosticsOperator } from "@/lib/bos-api";

interface Props {
  operators: ReV2OperatorDiagnosticsOperator[];
  selectedOperator: string | null;
  onSelectOperator: (opName: string | null) => void;
  onExplain: () => void;
}

function pct(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function signedPct(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function OperatorRankingTable({
  operators,
  selectedOperator,
  onSelectOperator,
  onExplain,
}: Props) {
  return (
    <div
      data-testid="operator-ranking"
      className="flex h-full flex-col rounded-lg border border-bm-border/40 bg-bm-surface/10"
    >
      <div className="flex items-center justify-between border-b border-bm-border/40 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-bm-foreground">Operator ranking</h2>
          <p className="text-[10px] text-bm-foreground-muted">
            Sorted by avg NOI margin · click a row to filter
          </p>
        </div>
        <button
          type="button"
          onClick={onExplain}
          disabled={operators.length === 0}
          className="rounded border border-bm-accent bg-bm-accent/10 px-2.5 py-1 text-xs text-bm-accent hover:bg-bm-accent/20 disabled:opacity-40"
          data-testid="explain-button"
        >
          Explain underperformance
        </button>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="sticky top-0 bg-bm-surface/60 text-[10px] uppercase tracking-wider text-bm-foreground-muted">
            <tr>
              <th className="px-3 py-2 text-left">Operator</th>
              <th className="px-2 py-2 text-right">#</th>
              <th className="px-2 py-2 text-right">NOI %</th>
              <th className="px-2 py-2 text-right">Peer Δ</th>
              <th className="px-2 py-2 text-right">Labor</th>
            </tr>
          </thead>
          <tbody>
            {operators.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-bm-foreground-muted">
                  No operators in current filter.
                </td>
              </tr>
            )}
            {operators.map((op) => {
              const isSelected = op.operator_name === selectedOperator;
              const deltaN =
                op.peer_margin_delta !== null ? Number(op.peer_margin_delta) : null;
              const tone =
                deltaN !== null && deltaN < 0
                  ? "text-amber-300"
                  : "text-bm-foreground";
              return (
                <tr
                  key={op.operator_name}
                  onClick={() =>
                    onSelectOperator(isSelected ? null : op.operator_name)
                  }
                  className={`cursor-pointer border-t border-bm-border/20 hover:bg-bm-surface/30 ${
                    isSelected ? "bg-bm-accent/10" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-bm-foreground">
                    <span className="mr-1 text-bm-foreground-muted">#{op.rank}</span>
                    {op.operator_name}
                    {op.contains_seed_sources && (
                      <span
                        className="ml-1 rounded bg-amber-500/20 px-1 text-[9px] font-semibold uppercase text-amber-300"
                        title="Contains seeded operator/acuity/labor values"
                      >
                        seed
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right text-bm-foreground-muted">
                    {op.asset_count}
                  </td>
                  <td className="px-2 py-2 text-right">{pct(op.avg_noi_margin)}</td>
                  <td className={`px-2 py-2 text-right ${tone}`}>
                    {signedPct(op.peer_margin_delta)}
                  </td>
                  <td className="px-2 py-2 text-right text-bm-foreground-muted">
                    {pct(op.avg_labor_intensity)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

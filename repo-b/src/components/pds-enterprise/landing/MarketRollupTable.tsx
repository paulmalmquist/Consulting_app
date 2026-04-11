import type { ReactNode } from "react";
import type { MarketRollupRow } from "./types";
import { toCompactCurrency } from "./utils";

export function MarketRollupTable({ rows }: { rows: MarketRollupRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-bm-border/70 bg-bm-surface/20">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-bm-surface/30 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
            <tr>
              <Th>Market</Th><Th>Aggregated exposure</Th><Th>Risk score</Th><Th>Variance</Th><Th>Trend</Th><Th>Impacted accounts</Th><Th>Next action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-bm-border/40 align-top">
                <Td className="font-medium text-bm-text">{row.name}</Td>
                <Td>{toCompactCurrency(row.aggregatedExposure)}</Td>
                <Td>{row.riskScore.toFixed(1)}</Td>
                <Td className={row.variance < 0 ? "text-pds-signalRed" : "text-pds-signalGreen"}>{toCompactCurrency(row.variance)}</Td>
                <Td>{row.trend === "up" ? "Improving" : row.trend === "down" ? "Deteriorating" : "Stable"}</Td>
                <Td>{row.impactedAccounts}</Td>
                <Td className="max-w-[240px] text-bm-muted2">{row.nextAction}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const Th = ({ children }: { children: ReactNode }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>;
const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`px-3 py-2 ${className}`}>{children}</td>;

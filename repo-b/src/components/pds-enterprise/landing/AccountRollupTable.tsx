import type { ReactNode } from "react";
import type { AccountRollupRow } from "./types";
import { statusClasses, toCompactCurrency } from "./utils";

export function AccountRollupTable({ rows }: { rows: AccountRollupRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-bm-border/70 bg-bm-surface/20">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-bm-surface/30 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
            <tr>
              <Th>Account</Th><Th>Status</Th><Th>Exposure</Th><Th>Variance</Th><Th>Trend</Th><Th>Open issues</Th><Th>Next action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-bm-border/40 align-top">
                <Td className="font-medium text-bm-text">{row.name}</Td>
                <Td><span className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${statusClasses(row.status)}`}>{row.status}</span></Td>
                <Td>{toCompactCurrency(row.exposure)}</Td>
                <Td className={row.variance < 0 ? "text-pds-signalRed" : "text-pds-signalGreen"}>{toCompactCurrency(row.variance)}</Td>
                <Td>{trendText(row.trend)}</Td>
                <Td>{row.openIssuesCount}</Td>
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
const trendText = (trend: "up" | "down" | "flat") => (trend === "up" ? "Improving" : trend === "down" ? "Deteriorating" : "Stable");


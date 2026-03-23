"use client";

import { ragFromVariance, ragColor } from "@/lib/pds-thresholds";
import { formatCurrency, formatPercent } from "@/components/pds-enterprise/pdsEnterprise";

type VarianceRow = {
  period: string;
  base_revenue: number | null;
  compare_revenue: number | null;
  variance_amount: number | null;
  variance_pct: number | null;
};

type Props = {
  data: VarianceRow[];
  baseLabel: string;
  compareLabel: string;
};

export function VarianceTable({ data, baseLabel, compareLabel }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700 text-zinc-400">
            <th className="py-2 text-left font-medium">Period</th>
            <th className="py-2 text-right font-medium">{baseLabel}</th>
            <th className="py-2 text-right font-medium">{compareLabel}</th>
            <th className="py-2 text-right font-medium">Variance $</th>
            <th className="py-2 text-right font-medium">Variance %</th>
            <th className="py-2 text-center font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const rag = row.variance_pct != null ? ragFromVariance(row.variance_pct) : "unknown";
            return (
              <tr key={i} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                <td className="py-2 text-zinc-300">{row.period}</td>
                <td className="py-2 text-right text-zinc-300">
                  {row.base_revenue != null ? formatCurrency(row.base_revenue) : "—"}
                </td>
                <td className="py-2 text-right text-zinc-300">
                  {row.compare_revenue != null ? formatCurrency(row.compare_revenue) : "—"}
                </td>
                <td className={`py-2 text-right ${(row.variance_amount ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {row.variance_amount != null ? formatCurrency(row.variance_amount) : "—"}
                </td>
                <td className={`py-2 text-right ${(row.variance_pct ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {row.variance_pct != null ? formatPercent(row.variance_pct / 100) : "—"}
                </td>
                <td className="py-2 text-center">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${ragColor(rag)}`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

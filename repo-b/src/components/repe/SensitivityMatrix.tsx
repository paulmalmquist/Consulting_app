"use client";

import type { SensitivityMatrixResponse } from "@/lib/bos-api";

function colorFor(value: number | null, base: number | null) {
  if (value == null || base == null) return "bg-bm-surface/30";
  if (value > base) return "bg-emerald-500/20 text-emerald-300";
  if (value < base) return "bg-red-500/20 text-red-300";
  return "bg-bm-accent/20 text-bm-text";
}

export function SensitivityMatrix({ matrix }: { matrix: SensitivityMatrixResponse }) {
  return (
    <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/25 p-4">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Sensitivity Table</p>
        <h4 className="text-base font-semibold text-bm-text">{matrix.metric_name}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-bm-muted2">NOI \\ Cap</th>
              {matrix.col_headers.map((header) => (
                <th key={header} className="px-2 py-2 text-right text-bm-muted2">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, rowIndex) => (
              <tr key={`${matrix.row_headers[rowIndex]}-${rowIndex}`}>
                <td className="px-2 py-2 text-bm-muted2">{matrix.row_headers[rowIndex]}</td>
                {row.map((cell, colIndex) => (
                  <td
                    key={`${rowIndex}-${colIndex}`}
                    className={`px-2 py-2 text-right font-medium ${colorFor(cell, matrix.base_value)} rounded`}
                  >
                    {cell == null ? "—" : cell.toFixed(3)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

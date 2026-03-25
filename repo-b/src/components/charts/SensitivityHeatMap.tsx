"use client";

import { useMemo } from "react";

export type HeatMapCell = {
  row_value: number;
  col_value: number;
  value: number;
};

type SensitivityHeatMapProps = {
  cells: HeatMapCell[];
  rowValues: number[];
  colValues: number[];
  rowLabel: string;
  colLabel: string;
  valueLabel?: string;
  formatRowHeader?: (v: number) => string;
  formatColHeader?: (v: number) => string;
  formatCell?: (v: number) => string;
  baseRowValue?: number;
  baseColValue?: number;
};

function defaultPctFmt(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function irrColor(irr: number): string {
  if (irr < 0.06) return "bg-red-600 text-white";
  if (irr < 0.08) return "bg-red-400 text-white";
  if (irr < 0.10) return "bg-amber-500 text-white";
  if (irr < 0.12) return "bg-amber-300 text-black";
  if (irr < 0.15) return "bg-green-400 text-black";
  return "bg-green-600 text-white";
}

export function SensitivityHeatMap({
  cells,
  rowValues,
  colValues,
  rowLabel,
  colLabel,
  valueLabel = "IRR",
  formatRowHeader = defaultPctFmt,
  formatColHeader = defaultPctFmt,
  formatCell = defaultPctFmt,
  baseRowValue,
  baseColValue,
}: SensitivityHeatMapProps) {
  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cells) {
      map.set(`${c.row_value}|${c.col_value}`, c.value);
    }
    return map;
  }, [cells]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left text-bm-muted2 border-b border-bm-border/40">
              <span className="block text-[10px]">{rowLabel} ↓</span>
              <span className="block text-[10px]">{colLabel} →</span>
            </th>
            {colValues.map((cv) => (
              <th
                key={cv}
                className={`px-2 py-2 text-center border-b border-bm-border/40 ${
                  baseColValue != null && Math.abs(cv - baseColValue) < 0.0001
                    ? "font-bold text-bm-accent"
                    : "text-bm-muted2"
                }`}
              >
                {formatColHeader(cv)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowValues.map((rv) => (
            <tr key={rv}>
              <td
                className={`px-2 py-2 border-b border-bm-border/30 ${
                  baseRowValue != null && Math.abs(rv - baseRowValue) < 0.0001
                    ? "font-bold text-bm-accent"
                    : "text-bm-muted2"
                }`}
              >
                {formatRowHeader(rv)}
              </td>
              {colValues.map((cv) => {
                const val = cellMap.get(`${rv}|${cv}`);
                const isBase =
                  baseRowValue != null &&
                  baseColValue != null &&
                  Math.abs(rv - baseRowValue) < 0.0001 &&
                  Math.abs(cv - baseColValue) < 0.0001;
                return (
                  <td
                    key={cv}
                    className={`px-2 py-2 text-center border-b border-bm-border/30 font-mono text-xs ${
                      val != null ? irrColor(val) : "text-bm-muted2"
                    } ${isBase ? "ring-2 ring-bm-accent ring-inset" : ""}`}
                    title={`${rowLabel}: ${formatRowHeader(rv)} | ${colLabel}: ${formatColHeader(cv)} | ${valueLabel}: ${val != null ? formatCell(val) : "—"}`}
                  >
                    {val != null ? formatCell(val) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

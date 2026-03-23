"use client";

import React, { useMemo, useState } from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

type TableBlock = Extract<AssistantResponseBlock, { type: "table" }>;

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    if (value !== Math.floor(value)) return value.toFixed(2);
    return value.toLocaleString();
  }
  return String(value);
}

function exportCsv(block: TableBlock) {
  const header = block.columns.join(",");
  const rows = block.rows.map((row) =>
    block.columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${block.export_name || "export"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatTableBlock({ block }: { block: TableBlock }) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    if (!sortCol) return block.rows;
    return [...block.rows].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [block.rows, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  return (
    <div className="my-2 rounded-lg border border-bm-border/30 bg-bm-surface/20">
      {(block.title || block.export_name) && (
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          {block.title && <p className="text-sm font-semibold text-bm-text">{block.title}</p>}
          {block.export_name && (
            <button
              type="button"
              onClick={() => exportCsv(block)}
              className="text-[11px] text-bm-muted hover:text-bm-text transition-colors"
            >
              Export CSV
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-bm-border/20">
              {block.ranked && (
                <th className="px-4 py-2 text-left text-[11px] font-medium text-bm-muted uppercase tracking-wider w-10">
                  #
                </th>
              )}
              {block.columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="px-4 py-2 text-left text-[11px] font-medium text-bm-muted uppercase tracking-wider cursor-pointer hover:text-bm-text transition-colors select-none"
                >
                  {col}
                  {sortCol === col && (
                    <span className="ml-1">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-bm-border/10 hover:bg-bm-surface/30 transition-colors"
              >
                {block.ranked && (
                  <td className="px-4 py-2 text-bm-muted font-mono">{idx + 1}</td>
                )}
                {block.columns.map((col) => (
                  <td key={col} className="px-4 py-2 text-bm-text">
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sortedRows.length === 0 && (
        <p className="px-4 py-4 text-sm text-bm-muted text-center">No data</p>
      )}
    </div>
  );
}

"use client";

import { C, EmptyState, ScrollTable, Tag } from "../primitives";
import { SOURCE_KIND_LABEL, SOURCE_KIND_TAG, type SourceKind } from "./sourceKind";
import { ExportToCsvButton, ExportToExcelButton } from "./ExportButtons";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// The rows behind a drilled metric, with an honest source-kind header, provenance, and
// CSV/XLSX export of the same filter context shown. When the kind is `unavailable` (or
// there are no rows) it renders the fail-closed empty state with the null_reason and
// disables export — never an empty/fake file.
export function SourceRowsTable({
  kind,
  columns,
  rows,
  rowCount,
  asOf,
  filterContext,
  nullReason,
  sourceLabel,
  exportName = "telemetry-export",
  xlsxUrl,
  maxPreview = 50,
}: {
  kind: SourceKind;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount?: number;
  asOf?: string | null;
  filterContext?: string;
  nullReason?: string | null;
  sourceLabel?: string;
  exportName?: string;
  xlsxUrl?: string | null;
  maxPreview?: number;
}) {
  const isUnavailable = kind === "unavailable" || rows.length === 0;
  const kindColor = kind === "live-rows" ? C.green : kind === "unavailable" ? C.red : C.amber;
  const total = rowCount ?? rows.length;
  const shown = rows.slice(0, maxPreview);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
        <Tag color={kindColor}>{SOURCE_KIND_TAG[kind]}</Tag>
        <span>{SOURCE_KIND_LABEL[kind]}</span>
        {sourceLabel && <span>· source {sourceLabel}</span>}
        {!isUnavailable && <span>· {total} rows</span>}
        {asOf && <span>· as of {asOf}</span>}
        {filterContext && <span>· {filterContext}</span>}
      </div>

      {isUnavailable ? (
        <EmptyState
          label={SOURCE_KIND_LABEL.unavailable}
          hint="No row-level data for this metric in the current scope."
          nullReason={nullReason ?? undefined}
        />
      ) : (
        <ScrollTable minWidth={Math.max(640, columns.length * 130)}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} style={{ textAlign: "left", color: C.dim, fontWeight: 600, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.panel }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c} style={{ color: C.text, padding: "5px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                      {cell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}

      {!isUnavailable && total > shown.length && (
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
          Showing {shown.length} of {total}. Export for the full set.
        </span>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <ExportToCsvButton
          filename={exportName}
          columns={columns}
          rows={rows}
          disabled={isUnavailable}
          disabledReason={isUnavailable ? nullReason ?? "Row-level data unavailable" : null}
        />
        <ExportToExcelButton
          url={isUnavailable ? null : xlsxUrl ?? null}
          disabledReason={
            isUnavailable
              ? nullReason ?? "Row-level data unavailable"
              : "Server export not configured for this source"
          }
        />
      </div>
    </div>
  );
}

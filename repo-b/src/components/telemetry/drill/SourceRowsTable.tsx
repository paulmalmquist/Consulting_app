"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { C, EmptyState, ScrollTable, Tag } from "../primitives";
import { SOURCE_KIND_LABEL, SOURCE_KIND_TAG, type SourceKind } from "./sourceKind";
import { ExportToCsvButton, ExportToExcelButton } from "./ExportButtons";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

type SortDir = "asc" | "desc";
type ColFilter = { text: string; selected: Set<string> | null }; // selected=null => all values pass

// Compare two display strings: numeric when both parse, else case-insensitive locale.
function compareCells(a: string, b: string): number {
  const na = Number(a), nb = Number(b);
  const bothNum = a !== "—" && b !== "—" && !Number.isNaN(na) && !Number.isNaN(nb);
  if (bothNum) return na - nb;
  if (a === "—") return 1;            // blanks sort last
  if (b === "—") return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

// Excel-style per-column filter popover: a contains-text box + a distinct-value checklist.
function ColumnFilter({
  column, values, filter, onChange, onClose,
}: {
  column: string;
  values: string[];                 // distinct display values for this column (over the OTHER-filtered rows)
  filter: ColFilter;
  onChange: (f: ColFilter) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const shown = useMemo(() => {
    const q = filter.text.trim().toLowerCase();
    return q ? values.filter((v) => v.toLowerCase().includes(q)) : values;
  }, [values, filter.text]);
  const selected = filter.selected;
  const allChecked = selected === null || shown.every((v) => selected.has(v));

  const toggle = (v: string) => {
    const next = new Set(selected ?? values);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange({ ...filter, selected: next.size === values.length ? null : next });
  };
  const setAll = (on: boolean) => {
    if (on) onChange({ ...filter, selected: null });
    else onChange({ ...filter, selected: new Set() });
  };

  return (
    <div ref={ref} style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, marginTop: 4,
      minWidth: 200, maxWidth: 280, background: C.panelHi, border: `1px solid ${C.borderHi}`,
      borderRadius: 8, padding: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.45)" }}>
      <input
        autoFocus
        value={filter.text}
        onChange={(e) => onChange({ ...filter, text: e.target.value })}
        placeholder={`Filter ${column}…`}
        aria-label={`Filter ${column}`}
        style={{ width: "100%", boxSizing: "border-box", background: C.bg, color: C.text,
          border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px",
          fontFamily: C.mono, fontSize: 11, marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 6, fontFamily: C.mono, fontSize: 10 }}>
        <button type="button" onClick={() => setAll(true)}
          style={{ background: "transparent", border: "none", color: C.cyan, cursor: "pointer", padding: 0 }}>
          Select all
        </button>
        <button type="button" onClick={() => setAll(false)}
          style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", padding: 0 }}>
          Clear
        </button>
      </div>
      <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {shown.length === 0 && <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>No matching values</span>}
        {shown.map((v) => {
          const checked = selected === null ? true : selected.has(v);
          return (
            <label key={v} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
              fontFamily: C.mono, fontSize: 10.5, color: C.dim }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(v)} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
            </label>
          );
        })}
      </div>
      {!allChecked && (
        <div style={{ marginTop: 6, fontFamily: C.mono, fontSize: 9.5, color: C.amber }}>
          Filtered — export reflects this selection
        </div>
      )}
    </div>
  );
}

// The rows behind a drilled metric, with an honest source-kind header, provenance, and CSV/XLSX export.
// Each column header is Excel-like: click the label to sort, click the funnel to filter (contains-text +
// distinct-value checklist). Filtering/sorting are client-side over the returned rows; CSV export and the
// row counts always reflect the *active filter* so what you see is what you export. When the kind is
// `unavailable` (or no rows) it fails closed with the null_reason and disables export.
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
  const [filters, setFilters] = useState<Record<string, ColFilter>>({});
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: string; dir: SortDir } | null>(null);

  const isUnavailable = kind === "unavailable" || rows.length === 0;
  const kindColor = kind === "live-rows" ? C.green : kind === "unavailable" ? C.red : C.amber;

  // A row passes if it satisfies every column's text + checklist filter.
  const rowPasses = (row: Record<string, unknown>, exceptCol?: string) =>
    columns.every((col) => {
      if (col === exceptCol) return true;
      const f = filters[col];
      if (!f) return true;
      const disp = cell(row[col]);
      if (f.text.trim() && !disp.toLowerCase().includes(f.text.trim().toLowerCase())) return false;
      if (f.selected && !f.selected.has(disp)) return false;
      return true;
    });

  const filtered = useMemo(() => {
    let out = rows.filter((r) => rowPasses(r));
    if (sort) {
      const { col, dir } = sort;
      out = [...out].sort((a, b) => {
        const c = compareCells(cell(a[col]), cell(b[col]));
        return dir === "asc" ? c : -c;
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, filters, sort]);

  // Distinct values for a column's checklist are computed over rows passing the OTHER columns' filters
  // (Excel behavior: a column's options narrow as you filter elsewhere).
  const distinctFor = (col: string): string[] => {
    const seen = new Set<string>();
    for (const r of rows) if (rowPasses(r, col)) seen.add(cell(r[col]));
    return Array.from(seen).sort((a, b) => compareCells(a, b));
  };

  const colIsFiltered = (c: string) => {
    const f = filters[c];
    return !!f && (f.text.trim() !== "" || f.selected !== null);
  };
  const activeFilterCount = columns.filter(colIsFiltered).length;

  const total = rowCount ?? rows.length;
  const filteredTotal = filtered.length;
  const shown = filtered.slice(0, maxPreview);

  const clearAll = () => { setFilters({}); setSort(null); setOpenCol(null); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
        <Tag color={kindColor}>{SOURCE_KIND_TAG[kind]}</Tag>
        <span>{SOURCE_KIND_LABEL[kind]}</span>
        {sourceLabel && <span>· source {sourceLabel}</span>}
        {!isUnavailable && (
          <span>· {activeFilterCount > 0 ? `${filteredTotal} of ${total} rows (filtered)` : `${total} rows`}</span>
        )}
        {asOf && <span>· as of {asOf}</span>}
        {filterContext && <span>· {filterContext}</span>}
        {activeFilterCount > 0 && (
          <button type="button" onClick={clearAll}
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.cyan,
              borderRadius: 6, padding: "1px 8px", cursor: "pointer", fontFamily: C.mono, fontSize: 10 }}>
            Clear filters
          </button>
        )}
      </div>

      {isUnavailable ? (
        <EmptyState
          label={SOURCE_KIND_LABEL.unavailable}
          hint="No row-level data for this metric in the current scope."
          nullReason={nullReason ?? undefined}
        />
      ) : (
        <ScrollTable minWidth={Math.max(640, columns.length * 150)}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
            <thead>
              <tr>
                {columns.map((c) => {
                  const f = filters[c];
                  const isFiltered = !!f && (f.text.trim() !== "" || f.selected !== undefined && f.selected !== null);
                  const sorted = sort?.col === c ? sort.dir : null;
                  return (
                    <th key={c} style={{ textAlign: "left", color: C.dim, fontWeight: 600, padding: "6px 10px",
                      borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.panel,
                      whiteSpace: "nowrap" }}>
                      <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <button type="button"
                          onClick={() => setSort((s) =>
                            s?.col === c ? (s.dir === "asc" ? { col: c, dir: "desc" } : null) : { col: c, dir: "asc" })}
                          title="Sort"
                          style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer",
                            fontFamily: C.mono, fontSize: 11, fontWeight: 600, padding: 0 }}>
                          {c}{sorted === "asc" ? " ▲" : sorted === "desc" ? " ▼" : ""}
                        </button>
                        <button type="button"
                          onClick={() => setOpenCol((o) => (o === c ? null : c))}
                          aria-label={`Filter ${c}`} title="Filter"
                          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0,
                            color: isFiltered ? C.cyan : C.faint, fontSize: 10 }}>
                          ⏷
                        </button>
                        {openCol === c && (
                          <ColumnFilter
                            column={c}
                            values={distinctFor(c)}
                            filter={f ?? { text: "", selected: null }}
                            onChange={(nf) => setFilters((prev) => ({ ...prev, [c]: nf }))}
                            onClose={() => setOpenCol(null)}
                          />
                        )}
                      </span>
                    </th>
                  );
                })}
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
              {shown.length === 0 && (
                <tr><td colSpan={columns.length} style={{ padding: "10px", color: C.faint, fontFamily: C.mono, fontSize: 11 }}>
                  No rows match the active filters.
                </td></tr>
              )}
            </tbody>
          </table>
        </ScrollTable>
      )}

      {!isUnavailable && filteredTotal > shown.length && (
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
          Showing {shown.length} of {filteredTotal}{activeFilterCount > 0 ? " filtered" : ""}. Export for the full set.
        </span>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <ExportToCsvButton
          filename={activeFilterCount > 0 ? `${exportName}_filtered` : exportName}
          columns={columns}
          rows={filtered}
          label={activeFilterCount > 0 ? `Export CSV (${filteredTotal} filtered)` : "Export CSV"}
          disabled={isUnavailable}
          disabledReason={isUnavailable ? nullReason ?? "Row-level data unavailable" : null}
        />
        <ExportToExcelButton
          url={isUnavailable || activeFilterCount > 0 ? null : xlsxUrl ?? null}
          disabledReason={
            isUnavailable
              ? nullReason ?? "Row-level data unavailable"
              : activeFilterCount > 0
                ? "Server XLSX returns the unfiltered set — use Export CSV for the filtered view"
                : "Server export not configured for this source"
          }
        />
      </div>
    </div>
  );
}

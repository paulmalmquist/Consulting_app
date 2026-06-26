// Pure CSV helpers (Phase 8 / PR 8A). Lifted from the winston ChatTableBlock pattern
// into a reusable, testable module. No React, no fabrication: object/array cells are
// JSON-stringified (the same value, made spreadsheet-safe); null/undefined → "".

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c])).join(",")).join("\n");
  return body ? `${header}\n${body}` : header;
}

export function downloadCsv(
  filename: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): void {
  const csv = toCsv(columns, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getIngestTableRows, listIngestTables, IngestTable } from "@/lib/bos-api";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import IngestMetricsHelper from "@/components/ingest/IngestMetricsHelper";

export default function IngestTableViewer({
  businessId,
  tableKey,
}: {
  businessId: string;
  tableKey: string;
}) {
  const [table, setTable] = useState<IngestTable | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterText, setFilterText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tables, rowPayload] = await Promise.all([
        listIngestTables({ business_id: businessId }),
        getIngestTableRows(tableKey, {
          business_id: businessId,
          limit: 100,
          offset: 0,
        }),
      ]);

      setTable(tables.find((item) => item.table_key === tableKey) || null);
      setRows(rowPayload.rows);
      setTotalRows(rowPayload.total_rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load ingested table");
    } finally {
      setLoading(false);
    }
  }, [businessId, tableKey]);

  useEffect(() => {
    load();
  }, [load]);

  const displayColumns = useMemo(() => {
    if (table?.columns?.length) return table.columns;
    if (rows[0]) return Object.keys(rows[0]);
    return [];
  }, [table?.columns, rows]);

  const clientFilteredRows = useMemo(() => {
    if (!filterText.trim()) return rows;
    const query = filterText.trim().toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [rows, filterText]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <CardTitle className="text-base">{table?.name || tableKey}</CardTitle>
          <p className="text-xs text-bm-muted2">
            {table?.kind || "table"} • {totalRows.toLocaleString()} rows
          </p>

          <div className="flex items-center gap-2">
            <Input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="Filter rows"
            />
            <Button size="sm" variant="secondary" onClick={load}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle className="text-sm uppercase tracking-[0.14em] text-bm-muted2">Rows</CardTitle>
          {loading ? (
            <div className="h-36 rounded-lg border border-bm-border/70 bg-bm-surface/40 animate-pulse mt-3" />
          ) : error ? (
            <p className="text-sm text-bm-danger mt-3">{error}</p>
          ) : (
            <div className="mt-3 overflow-auto rounded-lg border border-bm-border/70">
              <table className="w-full text-xs min-w-[680px]">
                <thead className="bg-bm-surface/60">
                  <tr>
                    {displayColumns.map((column) => (
                      <th key={column} className="text-left px-3 py-2">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientFilteredRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-2 text-bm-muted2" colSpan={Math.max(displayColumns.length, 1)}>
                        No rows available.
                      </td>
                    </tr>
                  ) : (
                    clientFilteredRows.map((row, idx) => (
                      <tr key={idx} className="border-t border-bm-border/60">
                        {displayColumns.map((column) => (
                          <td key={column} className="px-3 py-2">
                            {row[column] == null ? "" : String(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <IngestMetricsHelper
        businessId={businessId}
        fixedTableKey={tableKey}
        title="Create metrics from this ingested table"
      />
    </div>
  );
}

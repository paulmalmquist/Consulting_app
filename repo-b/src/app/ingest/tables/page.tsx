"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBusinessContext } from "@/lib/business-context";
import { listIngestTables, IngestTable } from "@/lib/bos-api";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";

export default function IngestTablesPage() {
  const { businessId } = useBusinessContext();
  const [tables, setTables] = useState<IngestTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    setError("");

    listIngestTables({ business_id: businessId })
      .then(setTables)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load tables"))
      .finally(() => setLoading(false));
  }, [businessId]);

  if (!businessId) {
    return <p className="text-sm text-bm-muted2">Select or create a business first.</p>;
  }

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-bold">Ingested Tables</h1>
      <p className="text-sm text-bm-muted">Canonical and custom tables produced by ingestion runs.</p>

      <Card>
        <CardContent>
          <CardTitle className="text-sm uppercase tracking-[0.14em] text-bm-muted2">Tables</CardTitle>
          {loading ? (
            <div className="space-y-2 mt-3">
              <div className="h-14 rounded-lg border border-bm-border/70 bg-bm-surface/40 animate-pulse" />
              <div className="h-14 rounded-lg border border-bm-border/70 bg-bm-surface/40 animate-pulse" />
            </div>
          ) : error ? (
            <p className="text-sm text-bm-danger mt-3">{error}</p>
          ) : tables.length === 0 ? (
            <p className="text-sm text-bm-muted2 mt-3">No tables available yet.</p>
          ) : (
            <div className="space-y-2 mt-3">
              {tables.map((table) => (
                <Link
                  key={table.table_key}
                  href={`/ingest/tables/${table.table_key}`}
                  className="block rounded-lg border border-bm-border/70 bg-bm-bg/15 px-4 py-3 hover:bg-bm-surface/40 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{table.name}</p>
                      <p className="text-xs text-bm-muted2">
                        {table.kind} • {table.row_count.toLocaleString()} rows
                      </p>
                    </div>
                    <p className="text-xs text-bm-muted2">{table.table_key}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

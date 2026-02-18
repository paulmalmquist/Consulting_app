"use client";

import { useEffect, useState } from "react";
import { getDocRegisterReport } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function DocumentRegisterReportPage() {
  const { businessId } = useBusinessContext();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!businessId) return;
    getDocRegisterReport(businessId).then((r) => setRows(r.rows || [])).catch(() => setRows([]));
  }, [businessId]);

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold">R3 Document Register Report</h1>
      {rows.length === 0 ? <p className="text-sm text-bm-muted2">No documents yet.</p> : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={String(row.document_id)} className="bm-glass rounded-lg p-3" data-testid="report-r3-row">
              <p className="font-medium">{String(row.title)}</p>
              <p className="text-xs text-bm-muted2">Versions: {String(row.version_count)} · Status: {String(row.status)}</p>
              <a href={String(row.deep_link || "/documents")} className="text-xs text-bm-accent" data-testid="report-r3-link">Open Documents</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

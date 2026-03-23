"use client";

import { useEffect, useState } from "react";
import { getExecutionLedgerReport } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function ExecutionLedgerReportPage() {
  const { businessId } = useBusinessContext();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!businessId) return;
    getExecutionLedgerReport(businessId).then((r) => setRows(r.rows || [])).catch(() => setRows([]));
  }, [businessId]);

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold">R5 Execution Ledger Report</h1>
      {rows.length === 0 ? <p className="text-sm text-bm-muted2">No executions yet.</p> : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={String(row.execution_id)} className="bm-glass rounded-lg p-3" data-testid="report-r5-row">
              <p className="font-medium">{String(row.capability_label || row.execution_id)}</p>
              <p className="text-xs text-bm-muted2">Dept: {String(row.department_label || "-")} · Status: {String(row.status)}</p>
              <a href={String(row.deep_link || "/app")} className="text-xs text-bm-accent" data-testid="report-r5-link">Open Capability</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

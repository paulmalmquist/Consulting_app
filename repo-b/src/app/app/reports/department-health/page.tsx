"use client";

import { useEffect, useState } from "react";
import { getDepartmentHealthReport } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function DepartmentHealthReportPage() {
  const { businessId } = useBusinessContext();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!businessId) return;
    getDepartmentHealthReport(businessId).then((r) => setRows(r.rows || [])).catch(() => setRows([]));
  }, [businessId]);

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold">R2 Department Health Report</h1>
      {rows.length === 0 ? <p className="text-sm text-bm-muted2">No departments enabled yet.</p> : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={String(row.department_id)} className="bm-glass rounded-lg p-3" data-testid="report-r2-row">
              <p className="font-medium">{String(row.label)}</p>
              <p className="text-xs text-bm-muted2">Capabilities: {String(row.enabled_capabilities)} · Docs: {String(row.documents_count)} · Runs: {String(row.executions_count)}</p>
              <a href={String(row.deep_link || "/app")} className="text-xs text-bm-accent" data-testid="report-r2-link">Open Department</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

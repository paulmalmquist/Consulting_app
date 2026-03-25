"use client";

import { useEffect, useState } from "react";
import { getDocComplianceReport } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function DocumentComplianceReportPage() {
  const { businessId } = useBusinessContext();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!businessId) return;
    getDocComplianceReport(businessId).then((r) => setRows(r.rows || [])).catch(() => setRows([]));
  }, [businessId]);

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold">R4 Document Compliance Report</h1>
      {rows.length === 0 ? <p className="text-sm text-bm-muted2">No compliance rows yet.</p> : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={String(row.document_id)} className="bm-glass rounded-lg p-3" data-testid="report-r4-row">
              <p className="font-medium">{String(row.title)}</p>
              <p className="text-xs text-bm-muted2">Severity: {String(row.severity)} · Missing ACL: {String(row.missing_acl)}</p>
              <a href={String(row.deep_link || "/documents")} className="text-xs text-bm-accent" data-testid="report-r4-link">Review Document</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

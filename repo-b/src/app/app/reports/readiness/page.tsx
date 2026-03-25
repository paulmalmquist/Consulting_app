"use client";

import { useEffect, useState } from "react";
import { getReadinessReport } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function ReadinessReportPage() {
  const { businessId } = useBusinessContext();
  const [data, setData] = useState<{ score: Record<string, unknown>; rows: Array<Record<string, unknown>> } | null>(null);

  useEffect(() => {
    if (!businessId) return;
    getReadinessReport(businessId).then(setData).catch(() => setData({ score: {}, rows: [] }));
  }, [businessId]);

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold">R7 Readiness / Coverage Report</h1>
      {!data || data.rows.length === 0 ? <p className="text-sm text-bm-muted2">No readiness rows yet.</p> : (
        <div className="space-y-2">
          {data.rows.map((row, idx) => (
            <div key={idx} className="bm-glass rounded-lg p-3" data-testid="report-r7-row">
              <p className="font-medium">{String(row.area)}</p>
              <p className="text-xs text-bm-muted2">Value: {String(row.value)} · Status: {String(row.status)}</p>
              <a href={String(row.deep_link || "/app")} className="text-xs text-bm-accent" data-testid="report-r7-link">Open</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getBusinessOverviewReport } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function BusinessOverviewReportPage() {
  const { businessId } = useBusinessContext();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    getBusinessOverviewReport(businessId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [businessId]);

  const business = (data?.business as Record<string, unknown>) || {};

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">R1 Business Overview Report</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!data && !error && <p className="text-sm text-bm-muted2">No data yet.</p>}
      {data && (
        <div className="bm-glass rounded-xl p-4" data-testid="report-r1-card">
          <p data-testid="report-r1-name">{String(business.name || "")}</p>
          <p className="text-sm text-bm-muted2">Departments: {String(business.departments_enabled || 0)} · Capabilities: {String(business.capabilities_enabled || 0)}</p>
          <p className="text-sm text-bm-muted2">Documents: {String(business.documents_count || 0)} · Executions: {String(business.executions_count || 0)}</p>
          <div className="mt-3">
            <a href="/app" className="text-sm text-bm-accent" data-testid="report-r1-link-app">Open App</a>
          </div>
        </div>
      )}
    </div>
  );
}

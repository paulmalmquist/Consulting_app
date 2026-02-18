"use client";

import { useEffect, useState } from "react";
import { listReports, runReport, type Report } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function DashboardsPage() {
  const { businessId } = useBusinessContext();
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    listReports(businessId)
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboards"));
  }, [businessId]);

  async function run(reportId: string) {
    if (!businessId) return;
    setError(null);
    setStatus("Running dashboard report...");
    try {
      const out = await runReport(reportId, { business_id: businessId, refresh: true });
      setStatus(`Dashboard refreshed (${out.report_run_id.slice(0, 8)})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run dashboard");
      setStatus("");
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Dashboards</p>
        <h1 className="text-2xl font-bold">Saved Report Dashboards</h1>
      </div>

      {error && <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm">{error}</div>}
      {status && <div className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-3 text-sm">{status}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((report) => (
          <div key={report.report_id} className="bm-glass rounded-xl p-4 space-y-2">
            <h2 className="text-lg font-semibold">{report.label}</h2>
            <p className="text-xs text-bm-muted2">{report.key}</p>
            <button
              onClick={() => run(report.report_id)}
              className="rounded bg-bm-accent px-3 py-1.5 text-sm font-semibold text-white"
            >
              Refresh
            </button>
          </div>
        ))}
        {reports.length === 0 && (
          <div className="rounded-xl border border-bm-border p-6 text-sm text-bm-muted2">
            No saved reports yet. Create one in Reports.
          </div>
        )}
      </div>
    </div>
  );
}

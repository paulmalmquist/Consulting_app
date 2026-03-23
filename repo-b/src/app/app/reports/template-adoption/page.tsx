"use client";

import { useEffect, useState } from "react";
import { getTemplateAdoptionReport, simulateTemplateDrift } from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function TemplateAdoptionReportPage() {
  const { businessId } = useBusinessContext();
  const [data, setData] = useState<{
    template_key: string | null;
    drift: {
      has_drift: boolean;
      missing_departments: string[];
      extra_departments: string[];
      missing_capabilities: string[];
      extra_capabilities: string[];
    };
    deep_link: string;
  } | null>(null);

  async function refresh() {
    if (!businessId) return;
    const out = await getTemplateAdoptionReport(businessId);
    setData(out);
  }

  useEffect(() => {
    refresh().catch(() => setData(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function onSimulateDrift() {
    if (!businessId) return;
    await simulateTemplateDrift(businessId);
    await refresh();
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold">R6 Template Adoption Report</h1>
      {!data ? <p className="text-sm text-bm-muted2">No template data for this business.</p> : (
        <div className="bm-glass rounded-lg p-4" data-testid="report-r6-card">
          <p className="font-medium">Template: {data.template_key || "Custom / none"}</p>
          <p className="text-xs text-bm-muted2" data-testid="report-r6-drift-flag">Drift: {String(data.drift.has_drift)}</p>
          <p className="text-xs text-bm-muted2">Missing caps: {data.drift.missing_capabilities.join(", ") || "none"}</p>
          <a href={data.deep_link} className="text-xs text-bm-accent" data-testid="report-r6-link">Open Setup</a>
          <div className="mt-3">
            <button
              onClick={onSimulateDrift}
              className="rounded bg-bm-accent px-3 py-1.5 text-xs font-semibold text-white"
              data-testid="report-r6-simulate-drift"
            >
              Simulate Drift
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

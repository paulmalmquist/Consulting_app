"use client";
import React from "react";

import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import CapabilityUnavailable from "@/components/common/CapabilityUnavailable";

const REPORTS = [
  {
    key: "matter-health",
    title: "Matter Health Report",
    description: "Open matters by type, risk level, and cycle time. Aging analysis for matters exceeding SLA.",
  },
  {
    key: "spend-analysis",
    title: "Spend Analysis",
    description: "Outside counsel YTD spend by firm, matter, and practice area. Budget vs. actual breakdown.",
  },
  {
    key: "contract-expiration",
    title: "Contract Expiration Calendar",
    description: "Contracts expiring within 30, 60, and 90 days. Renewal risk and auto-renew flag summary.",
  },
  {
    key: "regulatory-deadlines",
    title: "Regulatory Deadline Report",
    description: "Upcoming regulatory filing obligations by agency and owner. Overdue item escalation.",
  },
  {
    key: "litigation-exposure",
    title: "Litigation Exposure Summary",
    description: "Open case exposure by jurisdiction and matter. Reserve adequacy vs. exposure estimate.",
  },
];

export default function LegalReportsPage() {
  const { envId } = useDomainEnv();

  return (
    <section className="space-y-5" data-testid="legal-reports">
      <div>
        <h2 className="text-2xl font-semibold">Reports</h2>
        <p className="text-sm text-bm-muted2">Legal performance reports, spend analysis, and compliance summaries.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((report) => (
          <div
            key={report.key}
            className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 flex flex-col gap-2 opacity-80"
          >
            <p className="text-sm font-semibold">{report.title}</p>
            <p className="text-xs text-bm-muted2 flex-1">{report.description}</p>
            <button
              disabled
              className="mt-2 w-full rounded-lg border border-bm-border/50 px-3 py-2 text-xs text-bm-muted2 cursor-not-allowed"
              aria-describedby="legal-reports-unavailable"
            >
              Not available in current environment
            </button>
          </div>
        ))}
      </div>

      <div id="legal-reports-unavailable">
        <CapabilityUnavailable
          capabilityKey="legal.reports"
          title="Legal Reports"
          moduleLabel="Legal Ops Command"
          note="The report catalog above shows what this module will produce once the Legal Ops Command capability is enabled for this environment."
        />
      </div>
    </section>
  );
}

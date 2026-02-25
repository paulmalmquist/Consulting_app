"use client";

import Link from "next/link";
import { useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const MODULES = [
  "Overview",
  "Tenants",
  "Leases & Revenue",
  "A/R",
  "Compliance",
  "Work Orders",
  "Vendors",
  "CapEx",
  "Attachments",
] as const;

export default function MedicalPropertyPage({ params }: { params: { propertyId: string } }) {
  const { envId } = useDomainEnv();
  const [module, setModule] = useState<(typeof MODULES)[number]>("Overview");

  return (
    <section className="space-y-4" data-testid="medical-property-workspace">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Property Workspace</p>
          <h2 className="text-2xl font-semibold">Property {params.propertyId.slice(0, 8)}</h2>
        </div>
        <Link href={`/lab/env/${envId}/medical`} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Back to Backoffice
        </Link>
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {MODULES.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setModule(item)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                item === module ? "border-bm-accent/60 bg-bm-accent/10" : "border-bm-border/70 hover:bg-bm-surface/40"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
        {module === "Overview" ? "Occupancy, rent roll quality, delinquency, and top compliance signals." : null}
        {module === "Tenants" ? "Tenant CRM with specialty mix, COI/license expirations, and risk flags." : null}
        {module === "Leases & Revenue" ? "Lease terms, escalators, renewals, and revenue controls." : null}
        {module === "A/R" ? "Aging, delinquency workflow, and payment plan tracking." : null}
        {module === "Compliance" ? "Healthcare-specific compliance calendar and open violations." : null}
        {module === "Work Orders" ? "Critical-use workflow, SLA, and downtime impact tracking." : null}
        {module === "Vendors" ? "Contract terms, insurance expirations, and performance scoring." : null}
        {module === "CapEx" ? "5-year replacement schedule and risk-adjusted capex plan." : null}
        {module === "Attachments" ? "Property-attached documents and evidence repository." : null}
      </div>
    </section>
  );
}

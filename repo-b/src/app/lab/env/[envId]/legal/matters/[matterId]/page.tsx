"use client";

import Link from "next/link";
import { useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const MODULES = [
  "Overview",
  "Counterparties",
  "Contracts",
  "Obligations",
  "Deadlines",
  "Approvals",
  "Spend",
  "Litigation",
  "Audit",
  "Attachments",
] as const;

export default function LegalMatterPage({ params }: { params: { matterId: string } }) {
  const { envId } = useDomainEnv();
  const [module, setModule] = useState<(typeof MODULES)[number]>("Overview");

  return (
    <section className="space-y-4" data-testid="legal-matter-workspace">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Matter Workspace</p>
          <h2 className="text-2xl font-semibold">Matter {params.matterId.slice(0, 8)}</h2>
        </div>
        <Link href={`/lab/env/${envId}/legal`} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Back to Command
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
        {module === "Overview" ? "Matter status, risk level, owners, and key dates." : null}
        {module === "Counterparties" ? "Entity profiles, signatories, and prior dispute context." : null}
        {module === "Contracts" ? "Redline lifecycle, clause extraction, and execution status." : null}
        {module === "Obligations" ? "Obligations queue with owner, due date, and completion state." : null}
        {module === "Deadlines" ? "Upcoming filing/notice deadlines with escalation workflow." : null}
        {module === "Approvals" ? "Approval matrix and signature authority controls." : null}
        {module === "Spend" ? "Outside counsel invoices and budget-vs-actual controls." : null}
        {module === "Litigation" ? "Exposure, reserves, counsel, and motion timeline." : null}
        {module === "Audit" ? "Immutable timeline of matter actions and approvals." : null}
        {module === "Attachments" ? "Entity-attached documents scoped to this matter." : null}
      </div>
    </section>
  );
}

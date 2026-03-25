"use client";

import Link from "next/link";
import { useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const MODULES = [
  "Overview",
  "Underwriting",
  "Committee",
  "Covenants",
  "Watchlist",
  "Workout",
] as const;

export default function CreditCasePage({ params }: { params: { caseId: string } }) {
  const { envId } = useDomainEnv();
  const [module, setModule] = useState<(typeof MODULES)[number]>("Overview");

  return (
    <section className="space-y-4" data-testid="credit-case-workspace">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Credit Case Workspace</p>
          <h2 className="text-2xl font-semibold">Case {params.caseId.slice(0, 8)}</h2>
        </div>
        <Link href={`/lab/env/${envId}/credit`} className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Back to Hub
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
        {module === "Overview" ? "Pipeline status, owner, exposure, and pending actions." : null}
        {module === "Underwriting" ? "Model runs, assumptions, scorecards, and recommendation trace." : null}
        {module === "Committee" ? "Approval packet, votes, conditional approvals, and sign-off trail." : null}
        {module === "Covenants" ? "Test cadence, headroom, and breach detection outcomes." : null}
        {module === "Watchlist" ? "Early warning indicators, triage notes, and mitigation plans." : null}
        {module === "Workout" ? "Restructure strategy, recovery estimate, and legal workflow status." : null}
      </div>
    </section>
  );
}

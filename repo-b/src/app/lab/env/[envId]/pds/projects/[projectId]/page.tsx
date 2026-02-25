"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { runPdsReportPack, runPdsSnapshot } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const MODULES = [
  "Overview",
  "Budget & Forecast",
  "Schedule",
  "Change Orders",
  "Risks",
  "Vendors",
  "Field Intelligence",
  "Surveys",
  "Reporting",
] as const;

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function PdsProjectWarRoomPage({ params }: { params: { projectId: string; envId: string } }) {
  const { envId, businessId } = useDomainEnv();
  const [activeModule, setActiveModule] = useState<(typeof MODULES)[number]>("Overview");
  const [period, setPeriod] = useState(currentPeriod());
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectId = params.projectId;

  async function onRunSnapshot() {
    setStatus("Running project snapshot...");
    setError(null);
    try {
      const run = await runPdsSnapshot({
        env_id: envId,
        business_id: businessId || undefined,
        period,
        project_id: projectId,
      });
      setStatus(`Snapshot complete · run ${run.run_id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Snapshot failed");
    }
  }

  async function onRunReport() {
    setStatus("Building report pack...");
    setError(null);
    try {
      const run = await runPdsReportPack({
        env_id: envId,
        business_id: businessId || undefined,
        period,
      });
      setStatus(`Report pack complete · run ${run.run_id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Report pack failed");
    }
  }

  const moduleContent = useMemo(() => {
    if (activeModule === "Overview") {
      return (
        <div className="space-y-2">
          <p className="text-sm text-bm-muted2">Weekly deltas, next milestones, blockers, and budget burn summary render here.</p>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li>Next milestone and slip reason tracking</li>
            <li>Open blockers and pending approvals</li>
            <li>Budget burn versus forecast</li>
          </ul>
        </div>
      );
    }

    if (activeModule === "Budget & Forecast") {
      return <p className="text-sm text-bm-muted2">Budget lines, revisions, commitments, invoices/payments, contingency ledger, and cashflow curve.</p>;
    }

    if (activeModule === "Schedule") {
      return <p className="text-sm text-bm-muted2">Milestone baseline vs current vs actual with structured slip reasons and critical flags.</p>;
    }

    if (activeModule === "Change Orders") {
      return <p className="text-sm text-bm-muted2">CO log, approval workflow, budget/schedule impact, and cumulative CO exposure.</p>;
    }

    if (activeModule === "Risks") {
      return <p className="text-sm text-bm-muted2">Probability x impact exposure, mitigation owners, and top portfolio risk rollups.</p>;
    }

    if (activeModule === "Vendors") {
      return <p className="text-sm text-bm-muted2">Vendor performance, survey scores, disputes, and punch speed KPIs.</p>;
    }

    if (activeModule === "Field Intelligence") {
      return <p className="text-sm text-bm-muted2">Weekly site reports, photos, inspections, incidents, and punch items.</p>;
    }

    if (activeModule === "Surveys") {
      return <p className="text-sm text-bm-muted2">Contractor and tenant surveys feeding vendor scorecards and trend analysis.</p>;
    }

    return <p className="text-sm text-bm-muted2">One-click monthly report packs, lender draw package references, and deterministic narratives.</p>;
  }, [activeModule]);

  return (
    <section className="space-y-4" data-testid="pds-war-room">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Project War Room</p>
          <h2 className="text-2xl font-semibold">Project {projectId.slice(0, 8)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-bm-border bg-bm-surface px-2.5 py-2 text-sm"
          />
          <button
            type="button"
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            onClick={() => void onRunSnapshot()}
          >
            Run Snapshot
          </button>
          <button
            type="button"
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            onClick={() => void onRunReport()}
          >
            Run Report Pack
          </button>
          <Link
            href={`/lab/env/${envId}/pds`}
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
          >
            Back to Portfolio
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max" data-testid="pds-war-room-modules">
          {MODULES.map((module) => (
            <button
              type="button"
              key={module}
              onClick={() => setActiveModule(module)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                module === activeModule
                  ? "border-bm-accent/60 bg-bm-accent/10"
                  : "border-bm-border/70 hover:bg-bm-surface/40"
              }`}
            >
              {module}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-war-room-module-content">
        {moduleContent}
      </div>

      {status ? <p className="text-xs text-bm-muted2">{status}</p> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </section>
  );
}

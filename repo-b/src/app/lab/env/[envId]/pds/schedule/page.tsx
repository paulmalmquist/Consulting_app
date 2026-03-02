"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPdsPortfolioDashboard } from "@/lib/bos-api";
import type { PdsPortfolioDashboard } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US");
}

export default function PdsPortfolioSchedulePage() {
  const { envId, businessId } = useDomainEnv();
  const [period, setPeriod] = useState(currentPeriod());
  const [dashboard, setDashboard] = useState<PdsPortfolioDashboard | null>(null);

  useEffect(() => {
    void getPdsPortfolioDashboard(envId, period, businessId || undefined).then(setDashboard).catch(() => setDashboard(null));
  }, [businessId, envId, period]);

  return (
    <section className="space-y-4" data-testid="pds-portfolio-schedule">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">PDS Delivery</p>
          <h2 className="text-2xl font-semibold">Portfolio Schedule</h2>
        </div>
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-bm-border bg-bm-surface px-2.5 py-2 text-sm"
        />
      </div>
      <div className="grid gap-3">
        {(dashboard?.projects || []).map((project) => (
          <Link
            key={project.project_id}
            href={`/lab/env/${envId}/pds/projects/${project.project_id}`}
            className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">{project.name}</div>
                <div className="text-xs text-bm-muted2">{project.schedule_health.replace(/_/g, " ")} · Next milestone {formatDate(project.next_milestone_date)}</div>
              </div>
              <div className="text-sm text-bm-muted2">{project.total_slip_days} slip days</div>
            </div>
          </Link>
        ))}
        {!dashboard?.projects.length ? <p className="text-sm text-bm-muted2">No schedule data available yet.</p> : null}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getPdsPortfolioDashboard } from "@/lib/bos-api";
import type { PdsPortfolioDashboard } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PdsFinancialsPage() {
  const { envId, businessId } = useDomainEnv();
  const [period, setPeriod] = useState(currentPeriod());
  const [dashboard, setDashboard] = useState<PdsPortfolioDashboard | null>(null);

  useEffect(() => {
    void getPdsPortfolioDashboard(envId, period, businessId || undefined).then(setDashboard).catch(() => setDashboard(null));
  }, [businessId, envId, period]);

  return (
    <section className="space-y-4" data-testid="pds-financials-page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">PDS Delivery</p>
          <h2 className="text-2xl font-semibold">Financials</h2>
        </div>
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-bm-border bg-bm-surface px-2.5 py-2 text-sm"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Approved</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(dashboard?.kpis.approved_budget)}</div>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Committed</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(dashboard?.kpis.committed)}</div>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Spent</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(dashboard?.kpis.spent)}</div>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <div className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Variance</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(dashboard?.kpis.variance)}</div>
        </div>
      </div>
      <div className="grid gap-3">
        {(dashboard?.projects || []).map((project) => (
          <div key={project.project_id} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">{project.name}</div>
                <div className="text-xs text-bm-muted2">{project.project_code || "No code"}</div>
              </div>
              <div className="text-sm">Variance {formatMoney(project.budget_variance)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

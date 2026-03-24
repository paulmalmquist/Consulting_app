"use client";

import React, { useEffect, useState } from "react";
import {
  getPdsCommandCenter,
  type PdsV2CommandCenter,
  type PdsV2Horizon,
  type PdsV2Lens,
  type PdsV2RolePreset,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { PdsLensToolbar } from "@/components/pds-enterprise/PdsLensToolbar";
import { PdsRevenueKpiStrip } from "@/components/pds-enterprise/PdsRevenueKpiStrip";
import { PdsRevenueVsPlanChart } from "@/components/pds-enterprise/PdsRevenueVsPlanChart";
import { PdsRevenueWaterfall } from "@/components/pds-enterprise/PdsRevenueWaterfall";
import { PdsRevenueMixChart } from "@/components/pds-enterprise/PdsRevenueMixChart";
import { PdsRevenueRiskPanel } from "@/components/pds-enterprise/PdsRevenueRiskPanel";
import { PdsMarketLeaderboard } from "@/components/pds-enterprise/PdsMarketLeaderboard";

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mt-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">{label}</p>
      <h3 className="text-base font-semibold text-bm-text">{title}</h3>
    </div>
  );
}

export default function PdsRevenuePage() {
  const { envId, businessId } = useDomainEnv();
  const [lens, setLens] = useState<PdsV2Lens>("market");
  const [horizon, setHorizon] = useState<PdsV2Horizon>("YTD");
  const [rolePreset, setRolePreset] = useState<PdsV2RolePreset>("executive");
  const [commandCenter, setCommandCenter] = useState<PdsV2CommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cc = await getPdsCommandCenter(envId, {
          business_id: businessId || undefined,
          lens,
          horizon,
          role_preset: rolePreset,
        });
        if (cancelled) return;
        setCommandCenter(cc);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load revenue data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [envId, businessId, lens, horizon, rolePreset]);

  /* --- State 1: Loading (no prior data) --- */
  if (loading && !commandCenter) {
    return (
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
        Loading revenue command center...
      </div>
    );
  }

  /* --- State 2: Error (no prior data) --- */
  if (error && !commandCenter) {
    return (
      <div className="rounded-2xl border border-pds-signalRed/30 bg-pds-signalRed/10 p-4">
        <p className="font-medium text-pds-signalRed">Unable to load revenue data</p>
        <p className="mt-1 text-sm text-pds-signalRed/80">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            getPdsCommandCenter(envId, {
              business_id: businessId || undefined,
              lens,
              horizon,
              role_preset: rolePreset,
            })
              .then(setCommandCenter)
              .catch((e) => setError(e instanceof Error ? e.message : "Retry failed"))
              .finally(() => setLoading(false));
          }}
          className="mt-3 rounded-lg bg-pds-accent px-4 py-2 text-sm font-medium text-pds-bg transition hover:bg-pds-accent/90"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!commandCenter) return null;

  const rows = commandCenter.performance_table?.rows ?? [];

  /* --- State 3: Empty (loaded but no data) --- */
  if (rows.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader />
        <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pds-accent/10">
            <svg className="h-6 w-6 text-pds-accentText" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-bm-text">No revenue data yet</h2>
          <p className="mt-2 text-sm text-bm-muted2 max-w-md mx-auto">
            Revenue tracking requires fee data from projects in this environment.
            Ensure projects have fee plans and actuals recorded to populate this dashboard.
          </p>
        </div>
      </div>
    );
  }

  /* --- State 4: Loaded dashboard --- */
  return (
    <div className="space-y-5">
      <PageHeader />

      {/* Lens / Horizon / Role controls */}
      <PdsLensToolbar
        lens={lens}
        horizon={horizon}
        rolePreset={rolePreset}
        generatedAt={commandCenter.generated_at}
        onLensChange={setLens}
        onHorizonChange={setHorizon}
        onRolePresetChange={setRolePreset}
      />

      {/* Loading overlay for refetches */}
      {loading && (
        <div className="rounded-xl border border-pds-accent/20 bg-pds-accent/5 px-3 py-2 text-xs text-pds-accentText">
          Refreshing revenue data...
        </div>
      )}

      {/* 1. Revenue Health KPI Strip */}
      <PdsRevenueKpiStrip rows={rows} metrics={commandCenter.metrics_strip ?? []} />

      {/* 2. Revenue vs Plan Chart */}
      <SectionHeader label="Revenue Analysis" title="Actual vs Plan by Entity" />
      <PdsRevenueVsPlanChart rows={rows} />

      {/* 3. Variance Waterfall + Revenue Mix (side by side) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PdsRevenueWaterfall rows={rows} />
        <PdsRevenueMixChart rows={rows} lens={lens} />
      </div>

      {/* 4. Revenue Risk Panel */}
      <PdsRevenueRiskPanel commandCenter={commandCenter} />

      {/* 5. Detail Table */}
      <SectionHeader label="Detail" title="Full Revenue Breakdown" />
      <PdsMarketLeaderboard rows={rows} />

      {/* Stale-data error banner */}
      {error && (
        <div className="rounded-xl border border-pds-signalOrange/30 bg-pds-signalOrange/10 px-3 py-2 text-sm text-pds-signalOrange">
          {error}
        </div>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <section className="rounded-xl border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-accent)/0.08),transparent_40%)] bg-bm-surface/[0.92] px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-bm-text">Revenue &amp; CI</h2>
        <span className="rounded-full border border-pds-accent/20 px-2 py-0.5 text-[10px] font-medium text-pds-accentText">
          PDS Enterprise OS
        </span>
      </div>
      <p className="text-xs text-bm-muted2 mt-0.5">
        Fee revenue, variance analysis, and revenue risk on one surface.
      </p>
    </section>
  );
}

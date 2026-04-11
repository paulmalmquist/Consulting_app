"use client";

import { useEffect, useMemo, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { getPdsCommandCenter, type PdsV2CommandCenter } from "@/lib/bos-api";
import { AccountRollupTable } from "./AccountRollupTable";
import { GlobalSearchAndFilterBar } from "./GlobalSearchAndFilterBar";
import { LandingHeroPulse } from "./LandingHeroPulse";
import { MarketRollupTable } from "./MarketRollupTable";
import { OperatingPostureBadgeStrip } from "./OperatingPostureBadgeStrip";
import { PrioritizedActionList } from "./PrioritizedActionList";
import { RiskSummaryPanel } from "./RiskSummaryPanel";
import { RollupToggleBar } from "./RollupToggleBar";
import { deriveLandingModels } from "./utils";

export function PdsExecutiveLandingPage() {
  const { envId, businessId } = useDomainEnv();
  const [commandCenter, setCommandCenter] = useState<PdsV2CommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollupView, setRollupView] = useState<"account" | "market">("account");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "stable" | "watching" | "pressured" | "critical">("all");
  const [industryFilter, setIndustryFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPdsCommandCenter(envId, {
      business_id: businessId || undefined,
      lens: "market",
      horizon: "Forecast",
      role_preset: "executive",
    })
      .then((payload) => {
        if (cancelled) return;
        setCommandCenter(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load operating snapshot.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [envId, businessId]);

  const models = useMemo(() => (commandCenter ? deriveLandingModels(commandCenter) : null), [commandCenter]);

  const accountRows = useMemo(() => {
    if (!models) return [];
    return models.accountRollups.filter((row) => {
      const text = `${row.name} ${row.nextAction}`.toLowerCase();
      const matchesSearch = !search || text.includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesIndustry = industryFilter === "all" || text.includes(industryFilter);
      return matchesSearch && matchesStatus && matchesIndustry;
    });
  }, [models, search, statusFilter, industryFilter]);

  const marketRows = useMemo(() => {
    if (!models) return [];
    return models.marketRollups.filter((row) => {
      const text = `${row.name} ${row.nextAction}`.toLowerCase();
      const matchesSearch = !search || text.includes(search.toLowerCase());
      const matchesIndustry = industryFilter === "all" || text.includes(industryFilter);
      return matchesSearch && matchesIndustry;
    });
  }, [models, search, industryFilter]);

  if (loading && !commandCenter) {
    return <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">Loading executive operating surface...</div>;
  }

  if (error && !commandCenter) {
    return <div className="rounded-2xl border border-pds-signalRed/30 bg-pds-signalRed/10 p-4 text-sm text-pds-signalRed">{error}</div>;
  }

  if (!models) return null;

  return (
    <div className="space-y-4">
      <LandingHeroPulse
        metrics={models.hero}
        onMetricClick={(key) => {
          if (key === "atRisk") {
            setStatusFilter("critical");
            setRollupView("account");
          }
          if (key === "variance") {
            setRollupView("market");
          }
        }}
      />

      <GlobalSearchAndFilterBar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        industry={industryFilter}
        onIndustryChange={setIndustryFilter}
      />

      <RiskSummaryPanel summary={models.riskSummary} />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Rollups</p>
            <h3 className="text-xl font-semibold text-bm-text">Where pressure is coming from</h3>
          </div>
          <RollupToggleBar value={rollupView} onChange={setRollupView} />
        </div>
        {rollupView === "account" ? <AccountRollupTable rows={accountRows} /> : <MarketRollupTable rows={marketRows} />}
      </section>

      <OperatingPostureBadgeStrip posture={models.hero.posture} />

      <PrioritizedActionList items={models.prioritizedActions.filter((item) => !search || `${item.name} ${item.issueSummary}`.toLowerCase().includes(search.toLowerCase()))} />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  getPdsCommandCenter,
  getPdsDataHealthSummary,
  getPdsExecutiveOverview,
  getPdsExecutiveQueueMetrics,
  listPdsExecutiveQueue,
  type PdsV2CommandCenter,
} from "@/lib/bos-api";
import type {
  PdsDataHealthSummary,
  PdsExecutiveOverview,
  PdsExecutiveQueueItem,
  PdsExecutiveQueueMetrics,
  PdsMetricResult,
} from "@/types/pds";
import { AccountRollupTable } from "./AccountRollupTable";
import { CloseLoopStrip } from "./CloseLoopStrip";
import { DataHealthBar } from "./DataHealthBar";
import { DataHealthDrawer } from "./DataHealthDrawer";
import { GlobalSearchAndFilterBar } from "./GlobalSearchAndFilterBar";
import { GrainToggleBar, type PdsGrain } from "./GrainToggleBar";
import { InterventionQueueTable } from "./InterventionQueueTable";
import { LandingHeroPulse } from "./LandingHeroPulse";
import { MarketRollupTable } from "./MarketRollupTable";
import { MetricDefinitionPanel } from "./MetricDefinitionPanel";
import { OperatingPostureBadgeStrip } from "./OperatingPostureBadgeStrip";
import { RiskSummaryPanel } from "./RiskSummaryPanel";
import { RollupToggleBar } from "./RollupToggleBar";
import { SuppressedDataChip } from "./SuppressedDataChip";
import { TopFiveActionsStrip } from "./TopFiveActionsStrip";
import { deriveLandingModels } from "./utils";

const HERO_METRIC_KEYS: Array<
  { key: "totalExposure" | "variance" | "directional" | "atRisk"; metric: string; label: string }
> = [
  { key: "totalExposure", metric: "total_managed", label: "Total managed" },
  { key: "variance", metric: "net_variance", label: "Net variance" },
  { key: "directional", metric: "directional_delta", label: "Directional" },
  { key: "atRisk", metric: "accounts_at_risk", label: "Accounts at risk" },
];

export function PdsExecutiveLandingPage() {
  const { envId, businessId } = useDomainEnv();
  const [commandCenter, setCommandCenter] = useState<PdsV2CommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollupView, setRollupView] = useState<"account" | "market">("account");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "stable" | "watching" | "pressured" | "critical">("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [queueRows, setQueueRows] = useState<PdsExecutiveQueueItem[]>([]);
  const [queueMetrics, setQueueMetrics] = useState<PdsExecutiveQueueMetrics | null>(null);
  const [grain, setGrain] = useState<PdsGrain>("portfolio");
  const [overview, setOverview] = useState<PdsExecutiveOverview | null>(null);
  const [dataHealth, setDataHealth] = useState<PdsDataHealthSummary | null>(null);
  const [openDrawer, setOpenDrawer] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    if (!envId) return;
    try {
      const [rows, metrics] = await Promise.all([
        listPdsExecutiveQueue(envId, businessId || undefined, { limit: 100 }),
        getPdsExecutiveQueueMetrics(envId, businessId || undefined),
      ]);
      setQueueRows(rows as PdsExecutiveQueueItem[]);
      setQueueMetrics(metrics);
    } catch (err) {
      // Queue is additive to the existing command-center surface; never block render.
      // eslint-disable-next-line no-console
      console.warn("PDS queue fetch failed:", err);
    }
  }, [envId, businessId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Governed overview + data health — additive to the existing command-center payload.
  useEffect(() => {
    if (!envId) return;
    getPdsExecutiveOverview(envId, businessId || undefined, grain)
      .then(setOverview)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("PDS overview fetch failed:", err);
      });
  }, [envId, businessId, grain]);

  useEffect(() => {
    if (!envId) return;
    getPdsDataHealthSummary(envId, businessId || undefined)
      .then(setDataHealth)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("PDS data health fetch failed:", err);
      });
  }, [envId, businessId]);

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

  const selectedMetricResult: PdsMetricResult | null = selectedMetric
    ? overview?.metrics?.[selectedMetric] ?? null
    : null;

  const totalSuppressed = overview
    ? Object.values(overview.metrics || {}).reduce(
        (sum, m) => sum + (m?.suppressed_count || 0),
        0,
      )
    : 0;

  return (
    <div className="space-y-4">
      <DataHealthBar
        summary={dataHealth}
        onOpenDrawer={() => setOpenDrawer(true)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
            Grain
          </p>
          <p className="text-xs text-bm-muted2">
            Every governed metric re-resolves when grain changes; receipts carry
            the grain they were computed at.
          </p>
        </div>
        <GrainToggleBar value={grain} onChange={setGrain} />
      </div>

      {totalSuppressed ? (
        <div className="flex flex-wrap items-center gap-2">
          <SuppressedDataChip
            metric={{
              suppressed_count: totalSuppressed,
              suppression_reasons: Array.from(
                new Set(
                  Object.values(overview?.metrics || {}).flatMap(
                    (m) => m?.suppression_reasons || [],
                  ),
                ),
              ),
            }}
            onClick={() => setOpenDrawer(true)}
          />
        </div>
      ) : null}

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
          const match = HERO_METRIC_KEYS.find((m) => m.key === key);
          if (match) setSelectedMetric(match.metric);
        }}
      />

      {overview ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-bm-muted2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            Definition
          </span>
          {HERO_METRIC_KEYS.map((m) => (
            <button
              key={m.metric}
              type="button"
              onClick={() => setSelectedMetric(m.metric)}
              className="rounded-full border border-bm-border/60 bg-bm-surface/20 px-2 py-0.5 hover:text-bm-text"
            >
              {m.label} — definition
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedMetric("posture")}
            className="rounded-full border border-bm-border/60 bg-bm-surface/20 px-2 py-0.5 hover:text-bm-text"
          >
            Posture — definition
          </button>
        </div>
      ) : null}

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

      <CloseLoopStrip metrics={queueMetrics} />

      <TopFiveActionsStrip items={queueMetrics?.top_five_actions ?? []} />

      <InterventionQueueTable
        rows={queueRows}
        envId={envId}
        businessId={businessId || undefined}
        onRowChange={(updated) => {
          setQueueRows((prev) =>
            prev.map((row) =>
              row.queue_item_id === updated.queue_item_id ? updated : row,
            ),
          );
          loadQueue();
        }}
      />

      <MetricDefinitionPanel
        metricName={selectedMetric}
        metric={selectedMetricResult}
        onClose={() => setSelectedMetric(null)}
      />

      <DataHealthDrawer
        open={openDrawer}
        onClose={() => setOpenDrawer(false)}
        summary={dataHealth}
        envId={envId}
        businessId={businessId || undefined}
      />
    </div>
  );
}

"use client";

import React from "react";
import { useEffect, useState } from "react";
import {
  createOpportunityRun,
  getOpportunityDashboard,
  getOpportunityRecommendationDetail,
  listOpportunityRecommendations,
  listOpportunityRuns,
  listOpportunitySignals,
  type OpportunityDashboard,
  type OpportunityModelRun,
  type OpportunityRecommendation,
  type OpportunityRecommendationDetail,
  type OpportunitySignal,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import RecommendationDetailPanel from "@/components/opportunity-engine/RecommendationDetailPanel";
import SignalCards from "@/components/opportunity-engine/SignalCards";

type Filters = {
  businessLine: string;
  sector: string;
  geography: string;
  asOfDate: string;
};

function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return `${(value * 100).toFixed(1)}%`;
}

function fmtDate(value?: string | null): string {
  if (!value) return "\u2014";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function OpportunityEngineWorkspace() {
  const { envId, businessId } = useDomainEnv();
  const [filters, setFilters] = useState<Filters>({
    businessLine: "",
    sector: "",
    geography: "",
    asOfDate: "",
  });
  const [dashboard, setDashboard] = useState<OpportunityDashboard | null>(null);
  const [recommendations, setRecommendations] = useState<OpportunityRecommendation[]>([]);
  const [signals, setSignals] = useState<OpportunitySignal[]>([]);
  const [runs, setRuns] = useState<OpportunityModelRun[]>([]);
  const [selectedRecommendation, setSelectedRecommendation] = useState<OpportunityRecommendationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!envId || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const params = {
        env_id: envId,
        business_id: businessId,
        business_line: filters.businessLine || undefined,
        sector: filters.sector || undefined,
        geography: filters.geography || undefined,
        as_of_date: filters.asOfDate || undefined,
      };
      const [dashboardData, recommendationRows, signalRows, runRows] = await Promise.all([
        getOpportunityDashboard(params),
        listOpportunityRecommendations({ ...params, limit: 20 }),
        listOpportunitySignals({ env_id: envId, business_id: businessId, geography: filters.geography || undefined, limit: 6 }),
        listOpportunityRuns({ env_id: envId, business_id: businessId, limit: 8 }),
      ]);
      setDashboard(dashboardData);
      setRecommendations(recommendationRows);
      setSignals(signalRows);
      setRuns(runRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Opportunity Engine.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, filters.businessLine, filters.sector, filters.geography, filters.asOfDate]);

  async function openRecommendation(recommendation: OpportunityRecommendation) {
    if (!envId || !businessId) return;
    setDetailLoading(true);
    try {
      const detail = await getOpportunityRecommendationDetail(recommendation.recommendation_id, {
        env_id: envId,
        business_id: businessId,
      });
      setSelectedRecommendation(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recommendation detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function runEngine() {
    if (!envId || !businessId) return;
    setRunning(true);
    setError(null);
    try {
      await createOpportunityRun({
        env_id: envId,
        business_id: businessId,
        mode: "fixture",
        run_type: "manual",
        business_lines: ["consulting", "pds", "re_investment", "market_intel"],
        triggered_by: "opportunity-engine-ui",
        as_of_date: filters.asOfDate || undefined,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Opportunity Engine run.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-5" data-testid="opportunity-engine-workspace">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Opportunity Engine</p>
          <h2 className="mt-1 text-2xl font-semibold text-bm-text">Ranked project and market recommendations</h2>
          <p className="mt-2 max-w-3xl text-sm text-bm-muted">
            Practical ranking and signal engine for consulting, PDS, real estate, and prediction-market research inputs.
          </p>
        </div>
        <Button type="button" onClick={() => void runEngine()} disabled={running} data-testid="opportunity-run-button">
          {running ? "Running..." : "Run Opportunity Engine"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1.1fr,1fr,1fr,1fr,auto]">
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Business Line</span>
          <select
            value={filters.businessLine}
            onChange={(event) => setFilters((current) => ({ ...current, businessLine: event.target.value }))}
            className="w-full rounded-lg border border-bm-border/70 bg-bm-bg px-3 py-2 text-sm"
          >
            <option value="">All business lines</option>
            <option value="consulting">Consulting</option>
            <option value="pds">PDS</option>
            <option value="re_investment">RE Investment</option>
            <option value="market_intel">Market Intel</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Sector</span>
          <input
            value={filters.sector}
            onChange={(event) => setFilters((current) => ({ ...current, sector: event.target.value }))}
            className="w-full rounded-lg border border-bm-border/70 bg-bm-bg px-3 py-2 text-sm"
            placeholder="construction, healthcare, macro"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Geography</span>
          <input
            value={filters.geography}
            onChange={(event) => setFilters((current) => ({ ...current, geography: event.target.value }))}
            className="w-full rounded-lg border border-bm-border/70 bg-bm-bg px-3 py-2 text-sm"
            placeholder="Dallas, Sun Belt, United States"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-[0.12em] text-bm-muted2">As Of Date</span>
          <input
            type="date"
            value={filters.asOfDate}
            onChange={(event) => setFilters((current) => ({ ...current, asOfDate: event.target.value }))}
            className="w-full rounded-lg border border-bm-border/70 bg-bm-bg px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFilters({ businessLine: "", sector: "", geography: "", asOfDate: "" })}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-bm-border/70 bg-bm-surface/20">
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Latest Run</p>
            <p className="mt-1 text-lg font-semibold">{dashboard?.latest_run?.status || (loading ? "Loading..." : "No runs")}</p>
            <p className="mt-1 text-xs text-bm-muted2">{fmtDate(dashboard?.latest_run?.finished_at || dashboard?.latest_run?.started_at)}</p>
          </CardContent>
        </Card>
        <Card className="border border-bm-border/70 bg-bm-surface/20">
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Recommendations</p>
            <p className="mt-1 text-lg font-semibold">{recommendations.length}</p>
            <p className="mt-1 text-xs text-bm-muted2">Visible after current filters</p>
          </CardContent>
        </Card>
        <Card className="border border-bm-border/70 bg-bm-surface/20">
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Signals</p>
            <p className="mt-1 text-lg font-semibold">{signals.length}</p>
            <p className="mt-1 text-xs text-bm-muted2">Market signals linked into ranking</p>
          </CardContent>
        </Card>
        <Card className="border border-bm-border/70 bg-bm-surface/20">
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Business Lines</p>
            <p className="mt-1 text-lg font-semibold">{Object.keys(dashboard?.recommendation_counts || {}).length}</p>
            <p className="mt-1 text-xs text-bm-muted2">Represented in the current result set</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
        <Card className="border border-bm-border/70 bg-bm-surface/20">
          <CardContent>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Top Recommendations</h3>
                <p className="mt-1 text-xs text-bm-muted">Operational actions, screens, and research projects ranked by current opportunity score.</p>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-bm-muted2">Loading ranked recommendations...</div>
            ) : !recommendations.length ? (
              <div className="rounded-xl border border-dashed border-bm-border/70 px-4 py-6 text-sm text-bm-muted2">
                No recommendations match the current filters.
              </div>
            ) : (
              <div className="space-y-3">
                {recommendations.map((recommendation) => (
                  <button
                    key={recommendation.recommendation_id}
                    type="button"
                    onClick={() => void openRecommendation(recommendation)}
                    className="w-full rounded-xl border border-bm-border/70 bg-bm-bg px-4 py-3 text-left transition hover:bg-bm-surface/35"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-bm-border/70 px-2 py-1 text-[11px] text-bm-muted2">
                            #{recommendation.rank_position ?? "\u2014"}
                          </span>
                          <h4 className="text-sm font-semibold text-bm-text">{recommendation.title}</h4>
                          <span className="rounded-full bg-bm-surface/40 px-2 py-1 text-[11px] text-bm-muted2">
                            {recommendation.business_line}
                          </span>
                        </div>
                        {recommendation.summary ? (
                          <p className="text-sm text-bm-muted">{recommendation.summary}</p>
                        ) : null}
                        {recommendation.driver_summary ? (
                          <p className="text-xs text-bm-muted2">Drivers: {recommendation.driver_summary}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-bm-text">
                          {recommendation.score?.toFixed(1) ?? "\u2014"}
                        </p>
                        <p className="text-xs text-bm-muted2">{fmtPct(recommendation.probability)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-bm-border/70 bg-bm-surface/20">
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Signal Cards</h3>
              <p className="mt-1 text-xs text-bm-muted">Read-only Kalshi and Polymarket inputs canonicalized into business themes.</p>
            </div>
            <SignalCards signals={signals} />
          </CardContent>
        </Card>
      </div>

      <Card className="border border-bm-border/70 bg-bm-surface/20">
        <CardContent>
          <div className="mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Run History</h3>
            <p className="mt-1 text-xs text-bm-muted">Model runs, modes, and deterministic audit trail snapshots.</p>
          </div>
          {runs.length ? (
            <div className="space-y-2" data-testid="opportunity-run-history">
              {runs.map((run) => (
                <div key={run.run_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bm-border/70 bg-bm-bg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-bm-text">{run.mode} · {run.status}</p>
                    <p className="text-xs text-bm-muted2">{fmtDate(run.finished_at || run.started_at)}</p>
                  </div>
                  <div className="text-xs text-bm-muted2">
                    {run.business_lines.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-bm-muted2">No Opportunity Engine runs have been recorded yet.</div>
          )}
        </CardContent>
      </Card>

      <RecommendationDetailPanel
        detail={selectedRecommendation}
        open={Boolean(selectedRecommendation) || detailLoading}
        loading={detailLoading}
        onClose={() => setSelectedRecommendation(null)}
      />
    </section>
  );
}

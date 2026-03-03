"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  fetchClients,
  fetchLoops,
  fetchLoopSummary,
  type Client,
  type LoopRecord,
  type LoopSummary,
} from "@/lib/cro-api";

function fmtCurrency(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Loop Intelligence is currently unavailable.";
  }
  return err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "") || "Loop Intelligence is currently unavailable.";
}

export default function ConsultingLoopsPage({
  params,
}: {
  params: { envId: string };
}) {
  const { businessId, error: contextError, loading: contextLoading, ready } = useConsultingEnv();
  const searchParams = useSearchParams();
  const [loops, setLoops] = useState<LoopRecord[]>([]);
  const [summary, setSummary] = useState<LoopSummary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState(searchParams.get("client_id") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [domainFilter, setDomainFilter] = useState(searchParams.get("domain") ?? "");

  useEffect(() => {
    if (!ready) return;
    if (!businessId) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setDataError(null);

    Promise.all([
      fetchLoopSummary(params.envId, businessId, {
        client_id: clientFilter || undefined,
        status: statusFilter || undefined,
        domain: domainFilter || undefined,
      }),
      fetchLoops(params.envId, businessId, {
        client_id: clientFilter || undefined,
        status: statusFilter || undefined,
        domain: domainFilter || undefined,
      }),
      fetchClients(params.envId, businessId).catch(() => []),
    ])
      .then(([summaryResult, loopsResult, clientsResult]) => {
        if (!active) return;
        setSummary(summaryResult);
        setLoops(loopsResult);
        setClients(clientsResult);
      })
      .catch((err) => {
        if (!active) return;
        setSummary(null);
        setLoops([]);
        setDataError(formatError(err));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [businessId, clientFilter, domainFilter, params.envId, ready, statusFilter]);

  // Only show banner for real errors (5xx / config), not 404 / empty data
  const is5xxError = dataError && (dataError.includes("500") || dataError.includes("503") || dataError.includes("unavailable"));
  const bannerMessage = contextError || (is5xxError ? dataError : null);
  const isEmptyEnv = !dataError && loops.length === 0 && !loading;
  const topDriver = summary?.top_5_by_cost?.[0] ?? null;
  const isLoading = contextLoading || (ready && loading);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="loop-index-loading">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="loop-index-page">
      {bannerMessage ? (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <CardTitle>Loop Intelligence</CardTitle>
          <p className="text-sm text-bm-muted mt-2">
            Track recurring operational loops, quantify annualized cost, and document interventions.
          </p>
        </div>
        <Link
          href={`/lab/env/${params.envId}/consulting/loops/new`}
          className="inline-flex items-center rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
        >
          Add Loop
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total Annual Loop Cost</p>
            <p className="mt-1 text-2xl font-semibold">{fmtCurrency(summary?.total_annual_cost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Loops</p>
            <p className="mt-1 text-2xl font-semibold">{summary?.loop_count ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Avg Maturity Stage</p>
            <p className="mt-1 text-2xl font-semibold">
              {Number(summary?.avg_maturity_stage ?? 0).toFixed(1)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Top Cost Driver</p>
            <p className="mt-1 text-sm font-semibold">{topDriver?.name || "—"}</p>
            <p className="mt-1 text-xs text-bm-muted2">{fmtCurrency(topDriver?.annual_estimated_cost)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Client</span>
              <select
                value={clientFilter}
                onChange={(event) => setClientFilter(event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2"
                aria-label="Client Filter"
              >
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2"
                aria-label="Status Filter"
              >
                <option value="">All statuses</option>
                <option value="observed">Observed</option>
                <option value="simplifying">Simplifying</option>
                <option value="automating">Automating</option>
                <option value="stabilized">Stabilized</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Domain</span>
              <input
                value={domainFilter}
                onChange={(event) => setDomainFilter(event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                aria-label="Domain Filter"
                placeholder="reporting"
              />
            </label>
          </div>

          {loops.length === 0 && isEmptyEnv && !clientFilter && !statusFilter && !domainFilter ? (
            <div className="rounded-lg border border-bm-border/70 px-6 py-12 text-center">
              <h3 className="text-lg font-medium text-bm-text">No loops recorded yet</h3>
              <p className="mt-2 text-sm text-bm-muted2">
                Add your first operational loop to start tracking recurring workflow costs.
              </p>
              <Link
                href={`/lab/env/${params.envId}/consulting/loops/new`}
                className="mt-4 inline-flex items-center rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
              >
                Add Your First Loop
              </Link>
            </div>
          ) : loops.length === 0 ? (
            <div className="rounded-lg border border-bm-border/70 px-4 py-6 text-center text-sm text-bm-muted2">
              No loops match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-bm-muted2">
                  <tr className="border-b border-bm-border/60">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Domain</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Frequency / Year</th>
                    <th className="pb-3 pr-4 font-medium">Maturity Stage</th>
                    <th className="pb-3 pr-4 font-medium">Readiness Score</th>
                    <th className="pb-3 font-medium">Annual Estimated Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {loops.map((loop) => (
                    <tr key={loop.id} className="border-b border-bm-border/40 last:border-b-0">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/lab/env/${params.envId}/consulting/loops/${loop.id}`}
                          className="font-medium text-bm-text hover:text-bm-accent"
                        >
                          {loop.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{loop.process_domain}</td>
                      <td className="py-3 pr-4">{loop.status}</td>
                      <td className="py-3 pr-4">{Number(loop.frequency_per_year).toFixed(0)}</td>
                      <td className="py-3 pr-4">{loop.control_maturity_stage}</td>
                      <td className="py-3 pr-4">{loop.automation_readiness_score}</td>
                      <td className="py-3 font-medium">{fmtCurrency(loop.annual_estimated_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { Environment } from "@/components/EnvProvider";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { EnvironmentCard, EnvironmentStats } from "./EnvironmentCard";
import { EnvironmentStatus, statusFromFlags } from "./constants";

type SortKey = "name" | "created" | "industry" | "status";

const FILTERS: Array<{ key: "active" | "archived" | "failed"; label: string }> = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "failed", label: "Failed" },
];

export function EnvironmentList({
  environments,
  onOpen,
  onSettings,
  onArchive,
}: {
  environments: Environment[];
  onOpen: (envId: string) => void;
  onSettings: (envId: string) => void;
  onArchive: (envId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("created");
  const [activeFilters, setActiveFilters] = useState<Array<"active" | "archived" | "failed">>(["active"]);
  const [stats, setStats] = useState<Record<string, EnvironmentStats>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = environments.filter((env) => {
      const status = statusFromFlags(env.is_active);
      const filterHit = activeFilters.includes(status as "active" | "archived") || (status === "failed" && activeFilters.includes("failed"));
      if (!filterHit) return false;
      if (!q) return true;
      return [
        env.client_name,
        env.schema_name,
        env.env_id,
        env.industry_type || env.industry,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return base.sort((a, b) => {
      if (sortBy === "name") return a.client_name.localeCompare(b.client_name);
      if (sortBy === "industry") return (a.industry_type || a.industry).localeCompare(b.industry_type || b.industry);
      if (sortBy === "status") return statusFromFlags(a.is_active).localeCompare(statusFromFlags(b.is_active));
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd - ad;
    });
  }, [environments, query, sortBy, activeFilters]);

  useEffect(() => {
    const visible = filtered.slice(0, 24).map((env) => env.env_id);
    const missing = visible.filter((id) => !stats[id]);
    if (missing.length === 0) return;
    let cancelled = false;

    Promise.all(
      missing.map(async (envId) => {
        try {
          const metric = await apiFetch<{
            uploads_count?: number;
            tickets_count?: number;
          }>("/v1/metrics", { params: { env_id: envId } });
          return [
            envId,
            {
              documents_count: metric.uploads_count,
              executions_count: metric.tickets_count,
            } satisfies EnvironmentStats,
          ] as const;
        } catch {
          return [envId, {} satisfies EnvironmentStats] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setStats((prev) => {
        const next = { ...prev };
        for (const [id, value] of entries) next[id] = value;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [filtered, stats]);

  const toggleFilter = (filter: "active" | "archived" | "failed") => {
    setActiveFilters((prev) => {
      if (prev.includes(filter)) {
        const next = prev.filter((item) => item !== filter);
        return next.length ? next : [filter];
      }
      return [...prev, filter];
    });
  };

  if (environments.length === 0) {
    return (
      <Card>
        <CardContent className="min-h-[420px] flex items-center justify-center">
          <div className="text-center max-w-sm space-y-4" data-testid="env-empty-state">
            <div className="mx-auto h-16 w-16 rounded-2xl border border-bm-borderStrong/80 bg-bm-surface/30 flex items-center justify-center text-3xl">
              ⚙
            </div>
            <h3 className="text-xl font-semibold">No environments provisioned yet</h3>
            <p className="text-sm text-bm-muted2">
              Provision your first client environment to initialize an isolated schema and operational telemetry.
            </p>
            <Button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              Provision First Environment
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <CardTitle className="text-2xl">Environment Control Tower</CardTitle>
          <CardDescription>
            Search, sort, and monitor isolated client environments with operational context.
          </CardDescription>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, schema, industry, environment id"
            data-testid="env-search"
          />
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} data-testid="env-sort">
            <option value="created">Sort: Created</option>
            <option value="name">Sort: Name</option>
            <option value="industry">Sort: Industry</option>
            <option value="status">Sort: Status</option>
          </Select>
        </section>

        <section className="flex flex-wrap gap-2" data-testid="env-filters">
          {FILTERS.map((filter) => {
            const active = activeFilters.includes(filter.key);
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => toggleFilter(filter.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-bm-accent/70 bg-bm-accent/15 text-bm-text"
                    : "border-bm-border/70 bg-bm-surface/25 text-bm-muted2 hover:text-bm-text"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </section>

        <section className="space-y-3" data-testid="env-list">
          {filtered.map((env) => {
            const status: EnvironmentStatus = statusFromFlags(env.is_active);
            return (
              <EnvironmentCard
                key={env.env_id}
                env={env}
                status={status}
                stats={{
                  ...(stats[env.env_id] || {}),
                  last_activity: env.created_at,
                }}
                onOpen={onOpen}
                onSettings={onSettings}
                onArchive={onArchive}
              />
            );
          })}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 px-4 py-8 text-center">
              <p className="text-sm text-bm-muted2">No environments match current filters.</p>
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

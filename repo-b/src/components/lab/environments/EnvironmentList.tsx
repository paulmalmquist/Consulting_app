"use client";

import React, { useMemo, useState } from "react";
import { Database } from "lucide-react";
import type { Environment } from "@/components/EnvProvider";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EnvironmentCard, type EnvironmentStats } from "./EnvironmentCard";
import { EnvironmentStatus, statusFromFlags, humanIndustry } from "./constants";

type SortKey = "name" | "created" | "last_activity";

const FILTERS: Array<{ key: "active" | "archived" | "failed"; label: string }> = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "failed", label: "Failed" },
];

export function EnvironmentList({
  environments,
  onOpen,
  onSettings,
  onDelete,
  variant = "default",
}: {
  environments: Environment[];
  onOpen: (envId: string) => void;
  onSettings: (envId: string) => void;
  onDelete: (envId: string) => void;
  variant?: "default" | "controlTower";
}) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("created");
  const [activeFilters, setActiveFilters] = useState<Array<"active" | "archived" | "failed">>(["active"]);
  const [sectorFilter, setSectorFilter] = useState<string>("all");

  const dedupedEnvironments = useMemo(() => {
    const before = environments.length;
    const byId = new Map<string, Environment>();
    for (const env of environments) {
      if (!byId.has(env.env_id)) byId.set(env.env_id, env);
    }
    const values = [...byId.values()];
    if (values.length < before) {
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          action: "env_list.deduped",
          count_before: before,
          count_after: values.length,
        })
      );
    }
    return values;
  }, [environments]);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const env of dedupedEnvironments) {
      const raw = env.industry_type || env.industry || "";
      if (raw) set.add(raw);
    }
    return [...set].sort((a, b) => humanIndustry(a).localeCompare(humanIndustry(b)));
  }, [dedupedEnvironments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = dedupedEnvironments.filter((env) => {
      const status = statusFromFlags(env.is_active);
      const filterHit =
        activeFilters.includes(status as "active" | "archived") ||
        (status === "failed" && activeFilters.includes("failed"));
      if (!filterHit) return false;
      if (sectorFilter !== "all") {
        const envIndustry = env.industry_type || env.industry || "";
        if (envIndustry !== sectorFilter) return false;
      }
      if (!q) return true;
      return [env.client_name, env.schema_name, env.industry_type || env.industry]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return base.sort((a, b) => {
      if (sortBy === "name") return a.client_name.localeCompare(b.client_name);
      if (sortBy === "last_activity") {
        const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bd - ad;
      }
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd - ad;
    });
  }, [dedupedEnvironments, query, sortBy, activeFilters, sectorFilter]);

  const toggleFilter = (filter: "active" | "archived" | "failed") => {
    setActiveFilters((prev) => {
      if (prev.includes(filter)) {
        const next = prev.filter((item) => item !== filter);
        return next.length ? next : [filter];
      }
      return [...prev, filter];
    });
  };

  if (dedupedEnvironments.length === 0) {
    return (
      <div className={cn(
        "rounded-lg border p-6",
        variant === "controlTower"
          ? "border-bm-border/10 bg-bm-surface/76"
          : "border-bm-border/20 bg-bm-surface/40"
      )}>
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="max-w-sm text-center" data-testid="env-empty-state">
            <Database className="mx-auto h-8 w-8 text-bm-muted" strokeWidth={1} />
            <h3 className="mt-4 text-base font-semibold text-bm-text">No environments provisioned yet</h3>
            <p className="mt-2 text-sm text-bm-muted2">
              Provision your first client environment to initialize an isolated schema and operational telemetry.
            </p>
            <Button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="mt-4 h-auto rounded-md px-3 py-1.5 text-sm shadow-none transition-colors duration-100 hover:translate-y-0 hover:shadow-none"
            >
              Provision First Environment
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "controlTower") {
    return (
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Environments</p>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-bm-text">Environment Queue</h2>
              <p className="text-sm leading-relaxed text-bm-muted">
                Scan live status, open active workspaces, and manage environment operations with low-noise controls.
              </p>
            </div>
            <p className="text-sm text-bm-muted2">
              {filtered.length} shown of {dedupedEnvironments.length}
            </p>
          </div>
        </div>

        <section className="rounded-xl border border-bm-border/10 bg-bm-surface/76 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search environments, schemas, or industries..."
                data-testid="env-search"
                className="h-10 border-bm-border/14 bg-bm-surface/92 px-3.5 text-sm placeholder:text-bm-muted2 focus-visible:border-bm-accent/45 focus-visible:shadow-none"
              />
              <Select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                data-testid="env-sector-filter"
                className="h-10 w-full cursor-pointer appearance-none border-bm-border/14 bg-bm-surface/92 px-3.5 text-sm focus-visible:border-bm-accent/45 focus-visible:shadow-none"
              >
                <option value="all">Sector: All</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>{humanIndustry(s)}</option>
                ))}
              </Select>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                data-testid="env-sort"
                className="h-10 w-full cursor-pointer appearance-none border-bm-border/14 bg-bm-surface/92 px-3.5 text-sm focus-visible:border-bm-accent/45 focus-visible:shadow-none"
              >
                <option value="created">Sort: Created</option>
                <option value="name">Sort: Name</option>
                <option value="last_activity">Sort: Last Activity</option>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2" data-testid="env-filters">
              {FILTERS.map((filter) => {
                const active = activeFilters.includes(filter.key);
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => toggleFilter(filter.key)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-[background-color,border-color,color] duration-panel",
                      active
                        ? "border-bm-accent/22 bg-bm-surface/96 text-bm-text"
                        : "border-bm-border/12 bg-bm-surface/60 text-bm-muted hover:border-bm-border/24 hover:text-bm-text"
                    )}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-bm-border/10 bg-bm-surface/82 shadow-[0_18px_34px_-32px_rgba(5,9,14,0.95)]">
          <div className="hidden border-b border-bm-border/8 bg-bm-surface/92 px-5 py-3 md:block">
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)_auto] gap-4 font-mono text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
              <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3">
                <span>STATUS</span>
                <span>ENVIRONMENT</span>
              </div>
              <span>METADATA</span>
              <div className="flex items-center justify-end gap-8">
                <span>LAST ACTIVE</span>
                <span className="w-[116px] text-right">ACTIONS</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col" data-testid="env-list">
            {filtered.map((env, index) => {
              const status: EnvironmentStatus = statusFromFlags(env.is_active);
              return (
                <EnvironmentCard
                  key={env.env_id}
                  env={env}
                  status={status}
                  stats={{ last_activity: env.created_at } satisfies EnvironmentStats}
                  onOpen={onOpen}
                  onSettings={onSettings}
                  onDelete={onDelete}
                  variant="controlTower"
                  rowIndex={index}
                />
              );
            })}
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-bm-muted2">No environments match current filters.</p>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Environments</p>
        <p className="text-sm text-bm-muted2">
          Search, sort, and monitor isolated client environments with operational context.
        </p>
      </div>

      <section className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search environments, schemas, or commands..."
          data-testid="env-search"
          className="h-8 max-w-xs border-bm-border/30 bg-bm-surface/40 px-3 text-xs placeholder:text-bm-muted2 focus-visible:border-bm-accent/60 focus-visible:shadow-none"
        />
        <Select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          data-testid="env-sector-filter"
          className="h-8 w-auto min-w-[150px] cursor-pointer appearance-none border-bm-border/30 bg-bm-surface/40 px-2 text-xs focus-visible:border-bm-accent/60 focus-visible:shadow-none"
        >
          <option value="all">Sector: All</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{humanIndustry(s)}</option>
          ))}
        </Select>
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          data-testid="env-sort"
          className="h-8 w-auto min-w-[140px] cursor-pointer appearance-none border-bm-border/30 bg-bm-surface/40 px-2 text-xs focus-visible:border-bm-accent/60 focus-visible:shadow-none"
        >
          <option value="created">Sort: Created</option>
          <option value="name">Sort: Name</option>
          <option value="last_activity">Sort: Last Activity</option>
        </Select>

        <div className="flex flex-wrap items-center gap-2" data-testid="env-filters">
          {FILTERS.map((filter) => {
            const active = activeFilters.includes(filter.key);
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => toggleFilter(filter.key)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors duration-100 ${
                  active
                    ? "border-bm-accent/50 bg-bm-accent/10 text-bm-accent"
                    : "border-bm-border/30 text-bm-muted hover:bg-bm-surface/20 hover:text-bm-text"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-bm-border/20 bg-bm-surface/20">
        <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-bm-border/30 bg-bm-surface/20 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          <span>STATUS</span>
          <span className="min-w-[180px]">ENVIRONMENT</span>
          <span className="flex-1" />
          <span>LAST ACTIVE</span>
          <span>ACTIONS</span>
        </div>
        <div className="flex flex-col" data-testid="env-list">
          {filtered.map((env, index) => {
            const status: EnvironmentStatus = statusFromFlags(env.is_active);
            return (
              <EnvironmentCard
                key={env.env_id}
                env={env}
                status={status}
                stats={{ last_activity: env.created_at } satisfies EnvironmentStats}
                onOpen={onOpen}
                onSettings={onSettings}
                onDelete={onDelete}
                rowIndex={index}
              />
            );
          })}
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-bm-muted2">No environments match current filters.</p>
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}

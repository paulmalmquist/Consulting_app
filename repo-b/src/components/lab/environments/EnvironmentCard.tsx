"use client";

import React from "react";
import { Archive, ArrowRightCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Environment } from "@/components/EnvProvider";
import { EnvironmentStatus, formatDate, humanIndustry } from "./constants";
import { getIndustryIcon, getStatusBadge } from "./visuals";

type EnvironmentStats = {
  last_activity?: string;
};

export function EnvironmentCard({
  env,
  status,
  stats,
  onOpen,
  onSettings,
  onArchive,
}: {
  env: Environment;
  status: EnvironmentStatus;
  stats?: EnvironmentStats;
  onOpen: (envId: string) => void;
  onSettings: (envId: string) => void;
  onArchive: (envId: string) => void;
}) {
  const industry = env.industry_type || env.industry;
  const industryVisual = getIndustryIcon(industry);
  const IndustryIcon = industryVisual.icon;
  const statusBadge = getStatusBadge(status);
  const lastActivity = stats?.last_activity || env.created_at;

  return (
    <article
      className="rounded-2xl border border-bm-borderStrong/70 bg-bm-surface/30 shadow-bm-card/40 p-4 md:p-5 space-y-4"
      data-testid={`env-card-${env.env_id}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <div
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bm-border/70 bg-bm-surface/40 text-bm-muted2"
              title={`Industry: ${industryVisual.label}`}
            >
              <IndustryIcon size={18} data-testid={industryVisual.testId} />
            </div>
            <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-bm-text leading-tight">{env.client_name}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-bm-border/70 px-2.5 py-1 text-xs text-bm-muted2">
              {humanIndustry(industry)}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${statusBadge.pillClass}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`} />
              {statusBadge.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" size="sm" onClick={() => onOpen(env.env_id)} data-testid={`env-open-${env.env_id}`}>
            <span className="inline-flex items-center gap-1"><ArrowRightCircle size={14} />Open</span>
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onSettings(env.env_id)} data-testid={`env-settings-${env.env_id}`}>
            <span className="inline-flex items-center gap-1"><Settings size={14} />Settings</span>
          </Button>
          {status !== "archived" ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => onArchive(env.env_id)}
              data-testid={`env-archive-${env.env_id}`}
            >
              <span className="inline-flex items-center gap-1"><Archive size={14} />Archive</span>
            </Button>
          ) : null}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/25 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Schema</p>
          <p className="font-mono text-xs text-bm-text mt-1 truncate" title={env.schema_name || "—"}>
            {env.schema_name || "—"}
          </p>
        </div>
        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/25 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Created</p>
          <p className="text-bm-text mt-1">{formatDate(env.created_at)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/25 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Last Activity</p>
          <p className="text-bm-text mt-1">{formatDate(lastActivity)}</p>
        </div>
      </section>
    </article>
  );
}

export type { EnvironmentStats };

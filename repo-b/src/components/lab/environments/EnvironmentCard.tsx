"use client";

import { Button } from "@/components/ui/Button";
import type { Environment } from "@/components/EnvProvider";
import { EnvironmentStatus, formatDate, humanIndustry, statusLabel } from "./constants";

type EnvironmentStats = {
  documents_count?: number;
  executions_count?: number;
  last_activity?: string;
};

const statusClasses: Record<EnvironmentStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  provisioning: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  failed: "bg-red-500/15 text-red-300 border-red-400/30",
  archived: "bg-slate-500/15 text-slate-300 border-slate-400/30",
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
  return (
    <article
      className="rounded-2xl border border-bm-borderStrong/70 bg-bm-surface/30 shadow-bm-card/40 p-4 md:p-5 space-y-4"
      data-testid={`env-card-${env.env_id}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-bm-text leading-tight">{env.client_name}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-bm-border/70 px-2.5 py-1 text-xs text-bm-muted2">
              {humanIndustry(env.industry_type || env.industry)}
            </span>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${statusClasses[status]}`}>
              {statusLabel[status]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" size="sm" onClick={() => onOpen(env.env_id)} data-testid={`env-open-${env.env_id}`}>
            Open
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onSettings(env.env_id)} data-testid={`env-settings-${env.env_id}`}>
            Settings
          </Button>
          {status !== "archived" ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => onArchive(env.env_id)}
              data-testid={`env-archive-${env.env_id}`}
            >
              Archive
            </Button>
          ) : null}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/25 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Schema</p>
          <p className="font-mono text-xs text-bm-text mt-1 truncate">{env.schema_name || "—"}</p>
        </div>
        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/25 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Created</p>
          <p className="text-bm-text mt-1">{formatDate(env.created_at)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/25 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Last Activity</p>
          <p className="text-bm-text mt-1">{formatDate(stats?.last_activity || env.created_at)}</p>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Documents</p>
          <p className="text-lg font-semibold mt-1">{stats?.documents_count ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Executions</p>
          <p className="text-lg font-semibold mt-1">{stats?.executions_count ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 px-3 py-2 col-span-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Environment ID</p>
          <p className="text-xs font-mono text-bm-muted mt-1 truncate">{env.env_id}</p>
        </div>
      </section>
    </article>
  );
}

export type { EnvironmentStats };

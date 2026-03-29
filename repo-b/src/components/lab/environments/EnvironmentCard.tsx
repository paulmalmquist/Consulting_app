"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { ArrowRight, MoreHorizontal, Settings, Trash2 } from "lucide-react";
import type { Environment } from "@/components/EnvProvider";
import { Badge } from "@/components/ui/Badge";
import { EnvironmentStatus } from "./constants";
import { getIndustryIcon, getStatusBadge, getHealthLabel } from "./visuals";

type EnvironmentStats = {
  last_activity?: string;
};

export function EnvironmentCard({
  env,
  status,
  stats,
  onOpen,
  onSettings,
  onDelete,
  variant = "default",
  rowIndex = 0,
}: {
  env: Environment;
  status: EnvironmentStatus;
  stats?: EnvironmentStats;
  onOpen: (envId: string) => void;
  onSettings: (envId: string) => void;
  onDelete: (envId: string) => void;
  variant?: "default" | "controlTower";
  rowIndex?: number;
}) {
  const [mobileActionsOpen, setMobileActionsOpen] = React.useState(false);
  const industry = env.industry_type || env.industry;
  const industryVisual = getIndustryIcon(industry);
  const IndustryIcon = industryVisual.icon;
  const lastActivity = stats?.last_activity || env.created_at;
  const statusVisual = getStatusBadge(status);
  const healthLabel = getHealthLabel(status);
  const compactIndustry =
    industry === "real_estate" || industry === "real_estate_pe" || industry === "repe"
      ? "repe"
      : industry === "credit_risk_hub"
      ? "credit"
      : industry === "visual_resume" || industry === "resume"
      ? "resume"
      : (industry || "general").replace(/_/g, "-");

  if (variant === "controlTower") {
    return (
      <article
        className={cn(
          "group grid cursor-pointer gap-4 px-5 py-5 text-left transition-[background-color,box-shadow,transform] duration-panel focus-within:bg-bm-surface/92 hover:-translate-y-[1px] hover:shadow-[0_18px_28px_-30px_rgba(5,9,14,0.95)]",
          "md:grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)_auto] md:items-center",
          rowIndex % 2 === 0 ? "bg-bm-surface/84" : "bg-bm-surface/72"
        )}
        data-testid={`env-card-${env.env_id}`}
        onClick={() => onOpen(env.env_id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(env.env_id);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] font-medium",
                statusVisual.pillClass
              )}
            >
              {healthLabel}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold text-bm-text">{env.client_name}</h3>
              <p className="mt-1 text-sm text-bm-muted md:hidden">
                {compactIndustry} · {formatEnvId(env.env_id)} · {formatMetaDate(env.created_at)}
              </p>
            </div>
          </div>
        </div>

        <div className="hidden min-w-0 items-center gap-2.5 text-sm text-bm-muted md:flex">
          <IndustryIcon
            className="h-4 w-4 shrink-0 text-bm-muted2"
            data-testid={industryVisual.testId}
            strokeWidth={1.5}
          />
          <Badge variant="default" className="shrink-0 border-bm-border/14 bg-bm-surface2/55 px-1.5 py-0 text-[9px] text-bm-muted">
            {compactIndustry}
          </Badge>
          <span className="truncate font-mono text-[12px] text-bm-muted">Env {formatEnvId(env.env_id)}</span>
          <span aria-hidden className="text-bm-muted2">•</span>
          <span className="truncate text-bm-muted">{formatMetaDate(env.created_at)}</span>
        </div>

        <div className="flex items-center justify-between gap-4 md:justify-end">
          <div className="min-w-0 md:text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Last Active</p>
            <p className="text-sm font-medium text-bm-text">{formatRelative(lastActivity)}</p>
          </div>

          <div
            className="hidden shrink-0 items-center gap-2 md:flex"
            data-testid={`env-actions-${env.env_id}`}
          >
            <button
              type="button"
              className="rounded-md border border-transparent bg-bm-surface2/55 p-2 text-bm-muted transition-[background-color,color,transform] duration-panel hover:scale-[1.03] hover:bg-bm-surface2/85 hover:text-bm-text"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(env.env_id);
              }}
              aria-label={`Open ${env.client_name}`}
              data-testid={`env-open-${env.env_id}`}
            >
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
            <button
              type="button"
              className="rounded-md border border-transparent bg-bm-surface2/55 p-2 text-bm-muted transition-[background-color,color,transform] duration-panel hover:scale-[1.03] hover:bg-bm-surface2/85 hover:text-bm-text"
              onClick={(event) => {
                event.stopPropagation();
                onSettings(env.env_id);
              }}
              aria-label={`Settings for ${env.client_name}`}
              data-testid={`env-settings-${env.env_id}`}
            >
              <Settings className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
            <button
              type="button"
              className="rounded-md border border-transparent bg-bm-surface2/45 p-2 text-bm-muted/80 transition-[background-color,color,transform] duration-panel hover:scale-[1.03] hover:bg-bm-surface2/85 hover:text-bm-danger"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(env.env_id);
              }}
              aria-label={`Delete ${env.client_name}`}
              data-testid={`env-delete-${env.env_id}`}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </div>

          <div className="relative md:hidden" data-testid={`env-actions-${env.env_id}`}>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-bm-border/60 bg-bm-surface2/45 text-bm-muted"
              aria-label={`Environment actions for ${env.client_name}`}
              onClick={(event) => {
                event.stopPropagation();
                setMobileActionsOpen((current) => !current);
              }}
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
            </button>
            {mobileActionsOpen ? (
              <div
                className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-40 rounded-2xl border border-bm-border/70 bg-bm-bg/95 p-2 shadow-[0_18px_30px_-24px_rgba(5,9,14,0.95)]"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-bm-text hover:bg-bm-surface/30"
                  onClick={() => {
                    setMobileActionsOpen(false);
                    onOpen(env.env_id);
                  }}
                >
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Open
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-bm-text hover:bg-bm-surface/30"
                  onClick={() => {
                    setMobileActionsOpen(false);
                    onSettings(env.env_id);
                  }}
                >
                  <Settings className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Settings
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-bm-danger hover:bg-bm-danger/10"
                  onClick={() => {
                    setMobileActionsOpen(false);
                    onDelete(env.env_id);
                  }}
                  data-testid={`env-delete-${env.env_id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className="flex cursor-pointer items-center gap-4 border-b border-bm-border/15 bg-transparent px-4 py-3 text-left transition-colors duration-100 hover:bg-bm-surface/15 focus-within:bg-bm-surface/15"
      data-testid={`env-card-${env.env_id}`}
      onClick={() => onOpen(env.env_id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(env.env_id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.06em] font-medium ${statusVisual.pillClass}`}>
        {healthLabel}
      </span>
      <IndustryIcon
        className="h-4 w-4 shrink-0 text-bm-muted"
        data-testid={industryVisual.testId}
        strokeWidth={1.5}
      />

      <div className="min-w-[180px]">
        <h3 className="text-sm font-medium text-bm-text">{env.client_name}</h3>
      </div>

      <div className="min-w-0 flex items-center gap-2 overflow-hidden font-mono text-xs text-bm-muted">
        <Badge variant="default" className="text-[10px] shrink-0">{compactIndustry}</Badge>
        <span aria-hidden>&middot;</span>
        <span className="truncate">{env.schema_name || "—"}</span>
        <span aria-hidden>&middot;</span>
        <span className="truncate">{formatMetaDate(env.created_at)}</span>
      </div>

      <div className="flex-1" />

      <span className="shrink-0 font-mono text-xs text-bm-muted2 tabular-nums">
        {formatRelative(lastActivity)}
      </span>

      <div
        className="flex shrink-0 items-center gap-1"
        data-testid={`env-actions-${env.env_id}`}
      >
        <button
          type="button"
          className="rounded p-1.5 text-bm-muted transition-colors duration-100 hover:bg-bm-surface/30 hover:text-bm-text"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(env.env_id);
          }}
          aria-label={`Open ${env.client_name}`}
          data-testid={`env-open-${env.env_id}`}
        >
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-bm-muted transition-colors duration-100 hover:bg-bm-surface/30 hover:text-bm-text"
          onClick={(event) => {
            event.stopPropagation();
            onSettings(env.env_id);
          }}
          aria-label={`Settings for ${env.client_name}`}
          data-testid={`env-settings-${env.env_id}`}
        >
          <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-bm-muted/60 transition-colors duration-100 hover:bg-bm-surface/30 hover:text-bm-danger"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(env.env_id);
          }}
          aria-label={`Delete ${env.client_name}`}
          data-testid={`env-delete-${env.env_id}`}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </article>
  );
}

function formatMetaDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function formatEnvId(value?: string): string {
  if (!value) return "—";
  return value.length > 8 ? value.slice(0, 8) : value;
}

function formatRelative(value?: string): string {
  if (!value) return "never";
  const date = new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return "never";

  const diffMs = Date.now() - time;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 0)}m ago`;

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(diffMs / 86_400_000);
  if (days < 30) return `${days}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export type { EnvironmentStats };

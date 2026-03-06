"use client";

import React from "react";
import { ArrowRight, Settings, Trash2 } from "lucide-react";
import type { Environment } from "@/components/EnvProvider";
import { EnvironmentStatus } from "./constants";
import { getIndustryIcon } from "./visuals";

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
}: {
  env: Environment;
  status: EnvironmentStatus;
  stats?: EnvironmentStats;
  onOpen: (envId: string) => void;
  onSettings: (envId: string) => void;
  onDelete: (envId: string) => void;
}) {
  const industry = env.industry_type || env.industry;
  const industryVisual = getIndustryIcon(industry);
  const IndustryIcon = industryVisual.icon;
  const lastActivity = stats?.last_activity || env.created_at;
  const statusDotClass =
    status === "active"
      ? "bg-bm-success"
      : status === "failed"
      ? "bg-bm-danger"
      : status === "provisioning"
      ? "animate-pulse bg-bm-warning"
      : "bg-bm-muted2";
  const compactIndustry =
    industry === "real_estate" || industry === "real_estate_pe" || industry === "repe"
      ? "repe"
      : industry === "credit_risk_hub"
      ? "credit"
      : (industry || "general").replace(/_/g, "-");

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
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass}`} />
      <IndustryIcon
        className="h-4 w-4 shrink-0 text-bm-muted"
        data-testid={industryVisual.testId}
        strokeWidth={1.5}
      />

      <div className="min-w-[180px]">
        <h3 className="text-sm font-medium text-bm-text">{env.client_name}</h3>
      </div>

      <div className="min-w-0 flex items-center gap-2 overflow-hidden font-mono text-xs text-bm-muted">
        <span className="truncate">{compactIndustry}</span>
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

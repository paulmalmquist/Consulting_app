"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { apiFetch } from "@/lib/api";
import type { Environment } from "@/components/EnvProvider";
import { Industry, formatDate, humanIndustry, industries } from "./constants";

export function EnvironmentSettingsModal({
  open,
  env,
  stats,
  saving,
  onOpenChange,
  onSave,
  onArchiveToggle,
}: {
  open: boolean;
  env: Environment | null;
  stats?: {
    documents_count?: number;
    executions_count?: number;
    last_activity?: string;
  };
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { industry: Industry; notes: string; isActive: boolean }) => Promise<void>;
  onArchiveToggle: (payload: { isActive: boolean }) => Promise<void>;
}) {
  const [industry, setIndustry] = useState<Industry>("healthcare");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [advancedStats, setAdvancedStats] = useState<{ documents_count?: number; executions_count?: number }>({});

  useEffect(() => {
    if (!env) return;
    const next = (env.industry_type || env.industry || "healthcare") as Industry;
    setIndustry(industries.includes(next) ? next : "healthcare");
    setNotes(env.notes || "");
  }, [env]);

  useEffect(() => {
    if (!env) return;
    let cancelled = false;
    apiFetch<{ uploads_count?: number; tickets_count?: number }>("/v1/metrics", { params: { env_id: env.env_id } })
      .then((metric) => {
        if (cancelled) return;
        setAdvancedStats({
          documents_count: metric.uploads_count,
          executions_count: metric.tickets_count,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setAdvancedStats({});
      });
    return () => {
      cancelled = true;
    };
  }, [env]);

  const subtitle = useMemo(() => {
    if (!env) return "";
    return `${env.client_name} · ${humanIndustry(env.industry_type || env.industry)}`;
  }, [env]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Environment Settings"
      description={subtitle}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onSave({ industry, notes, isActive: Boolean(env?.is_active) })}
            disabled={!env || saving}
            data-testid="env-settings-save"
          >
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Industry</label>
          <Select className="mt-2" value={industry} onChange={(e) => setIndustry(e.target.value as Industry)}>
            {industries.map((option) => (
              <option key={option} value={option}>{humanIndustry(option)}</option>
            ))}
          </Select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Notes</label>
          <Textarea className="mt-2" rows={4} placeholder="Operational notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 space-y-3">
          <p className="text-sm font-semibold">Environment ID</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded border border-bm-border/60 bg-bm-surface/20 px-2 py-1 text-xs font-mono text-bm-muted">
              {env?.env_id || "—"}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!env}
              onClick={async () => {
                if (!env) return;
                await navigator.clipboard.writeText(env.env_id);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
              data-testid="env-settings-copy-id"
            >
              {copied ? "Copied" : "Copy ID"}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-bm-muted2">
            <div>Schema: <span className="text-bm-text">{env?.schema_name || "—"}</span></div>
            <div>Created: <span className="text-bm-text">{formatDate(env?.created_at)}</span></div>
            <div>Last Activity: <span className="text-bm-text">{formatDate(stats?.last_activity || env?.created_at)}</span></div>
          </div>
        </div>

        <details className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Advanced</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-bm-muted2">
            <div>Documents: <span className="text-bm-text">{advancedStats.documents_count ?? stats?.documents_count ?? "—"}</span></div>
            <div>Executions: <span className="text-bm-text">{advancedStats.executions_count ?? stats?.executions_count ?? "—"}</span></div>
          </div>
        </details>

        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Lifecycle</p>
            <p className="text-xs text-bm-muted2">
              {env?.is_active ? "Archive this environment to hide it from active operations." : "Restore this archived environment."}
            </p>
          </div>
          <Button
            type="button"
            variant={env?.is_active ? "destructive" : "secondary"}
            size="sm"
            disabled={!env || saving}
            onClick={() => onArchiveToggle({ isActive: !Boolean(env?.is_active) })}
            data-testid="env-settings-archive-toggle"
          >
            {env?.is_active ? "Archive" : "Restore"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

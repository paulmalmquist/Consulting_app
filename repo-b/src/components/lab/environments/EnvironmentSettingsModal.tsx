"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { Environment } from "@/components/EnvProvider";
import { Industry, humanIndustry, industries } from "./constants";

export function EnvironmentSettingsModal({
  open,
  env,
  saving,
  onOpenChange,
  onSave,
  onArchiveToggle,
}: {
  open: boolean;
  env: Environment | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { industry: Industry; notes: string; isActive: boolean }) => Promise<void>;
  onArchiveToggle: (payload: { isActive: boolean }) => Promise<void>;
}) {
  const [industry, setIndustry] = useState<Industry>("healthcare");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!env) return;
    const next = (env.industry_type || env.industry || "healthcare") as Industry;
    setIndustry(industries.includes(next) ? next : "healthcare");
    setNotes(env.notes || "");
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

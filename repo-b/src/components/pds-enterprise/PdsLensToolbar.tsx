"use client";
import React from "react";

import type { PdsV2Horizon, PdsV2Lens, PdsV2RolePreset } from "@/lib/bos-api";
import { PDS_HORIZONS, PDS_LENSES, PDS_ROLE_PRESETS } from "@/components/pds-enterprise/pdsEnterprise";

type Props = {
  lens: PdsV2Lens;
  horizon: PdsV2Horizon;
  rolePreset: PdsV2RolePreset;
  generatedAt?: string;
  onLensChange: (lens: PdsV2Lens) => void;
  onHorizonChange: (horizon: PdsV2Horizon) => void;
  onRolePresetChange: (rolePreset: PdsV2RolePreset) => void;
};

export function PdsLensToolbar({
  lens,
  horizon,
  rolePreset,
  generatedAt,
  onLensChange,
  onHorizonChange,
  onRolePresetChange,
}: Props) {
  return (
    <section className="rounded-[22px] border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-lens-toolbar">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] xl:items-end">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Scope</p>
          <div className="inline-flex flex-wrap rounded-xl border border-bm-border/70 bg-bm-surface/15 p-1">
            {PDS_LENSES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onLensChange(item.key)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  lens === item.key
                    ? "border border-pds-accent/40 bg-pds-accent/20 text-pds-accentText shadow-sm"
                    : "border border-transparent text-bm-muted2 hover:bg-bm-surface/40 hover:text-bm-text"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Time</p>
          <div className="inline-flex rounded-lg border border-bm-border/50 bg-bm-surface/15 p-0.5">
            {PDS_HORIZONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onHorizonChange(item.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  horizon === item.key
                    ? "border border-pds-accent/30 bg-pds-accent/15 text-pds-accentText"
                    : "border border-transparent text-bm-muted2 hover:text-bm-text"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Lens</p>
          <select
            id="pds-role-preset"
            value={rolePreset}
            onChange={(event) => onRolePresetChange(event.target.value as PdsV2RolePreset)}
            className="w-full rounded-lg border border-bm-border/50 bg-bm-surface/15 px-3 py-2 text-xs font-medium text-bm-text outline-none"
            aria-label="Role Preset"
          >
            {PDS_ROLE_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-bm-border/60 bg-bm-surface/15 px-3 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bm-muted2">Refresh</p>
          <p className="mt-1 text-xs text-bm-text">
            {generatedAt ? new Date(generatedAt).toLocaleString() : "Latest snapshot"}
          </p>
        </div>
      </div>
    </section>
  );
}

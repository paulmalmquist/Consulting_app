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
    <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" data-testid="pds-lens-toolbar">
      {/* Primary segmented control — Operating Lens */}
      <div className="inline-flex rounded-xl border border-bm-border/70 bg-bm-surface/20 p-1">
        {PDS_LENSES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onLensChange(item.key)}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
              lens === item.key
                ? "bg-pds-gold/20 text-pds-goldText shadow-sm border border-pds-gold/40"
                : "border border-transparent text-bm-muted2 hover:text-bm-text hover:bg-bm-surface/40"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Secondary controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Horizon pills */}
        <div className="inline-flex rounded-lg border border-bm-border/50 bg-bm-surface/15 p-0.5">
          {PDS_HORIZONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onHorizonChange(item.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                horizon === item.key
                  ? "bg-pds-gold/15 text-pds-goldText border border-pds-gold/30"
                  : "border border-transparent text-bm-muted2 hover:text-bm-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Role preset */}
        <select
          id="pds-role-preset"
          value={rolePreset}
          onChange={(event) => onRolePresetChange(event.target.value as PdsV2RolePreset)}
          className="rounded-lg border border-bm-border/50 bg-bm-surface/15 px-3 py-1.5 text-xs font-medium text-bm-text outline-none"
          aria-label="Role Preset"
        >
          {PDS_ROLE_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </select>

        {/* Timestamp */}
        <span className="text-[11px] text-bm-muted2">
          {generatedAt ? `Updated ${new Date(generatedAt).toLocaleString()}` : "Latest snapshot"}
        </span>
      </div>
    </section>
  );
}

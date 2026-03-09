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

function buttonClass(active: boolean): string {
  return active
    ? "border-[#e8bf68]/60 bg-[#e8bf68]/15 text-[#f5d89b]"
    : "border-bm-border/70 bg-bm-surface/25 text-bm-text hover:bg-bm-surface/40";
}

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
    <section className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-bm-muted2">Management Lens</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PDS_LENSES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onLensChange(item.key)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${buttonClass(lens === item.key)}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-bm-muted2">Date Horizon</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PDS_HORIZONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onHorizonChange(item.key)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${buttonClass(horizon === item.key)}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <label className="text-xs uppercase tracking-[0.16em] text-bm-muted2" htmlFor="pds-role-preset">
            Role Preset
          </label>
          <select
            id="pds-role-preset"
            value={rolePreset}
            onChange={(event) => onRolePresetChange(event.target.value as PdsV2RolePreset)}
            className="rounded-2xl border border-bm-border/70 bg-[#0f1820] px-4 py-2 text-sm text-bm-text outline-none"
          >
            {PDS_ROLE_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-bm-muted2">
            {generatedAt ? `Updated ${new Date(generatedAt).toLocaleString()}` : "Using latest snapshot package"}
          </p>
        </div>
      </div>
    </section>
  );
}

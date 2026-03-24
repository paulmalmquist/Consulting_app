"use client";
import React from "react";

import type { PdsV2Briefing } from "@/lib/bos-api";

function BriefingSection({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</p>
      <div className="mt-1.5 space-y-1.5">
        {lines.map((line) => (
          <p key={line} className="text-sm text-bm-text">{line}</p>
        ))}
      </div>
    </div>
  );
}

export function PdsExecutiveBriefingPanel({ briefing }: { briefing: PdsV2Briefing }) {
  return (
    <section className="rounded-lg border border-slate-700/30 bg-[radial-gradient(circle_at_top_left,hsl(217_91%_60%/0.06),transparent_50%)] p-5" data-testid="pds-executive-briefing-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-blue-400">Exec Briefing</p>
          <h3 className="text-xl font-semibold text-bm-text">{briefing.headline}</h3>
        </div>
        <p className="text-sm text-slate-400">
          {briefing.role_preset.replace(/_/g, " ")} · {briefing.horizon}
        </p>
      </div>

      <div className="mt-4 space-y-4">
        <BriefingSection
          title="Top Variance Drivers"
          lines={briefing.summary_lines.slice(0, 2)}
        />
        <BriefingSection
          title="Immediate Intervention Items"
          lines={briefing.summary_lines.slice(2, 4)}
        />
        <BriefingSection
          title="Forecast Risk Signals"
          lines={briefing.summary_lines.slice(4)}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {briefing.recommended_actions.map((action) => (
          <button
            key={action}
            type="button"
            className="rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-300 transition hover:bg-blue-500/20"
          >
            {action}
          </button>
        ))}
      </div>
    </section>
  );
}

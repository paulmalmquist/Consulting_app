"use client";
import React from "react";

import type { PdsV2Briefing } from "@/lib/bos-api";

export function PdsExecutiveBriefingPanel({ briefing }: { briefing: PdsV2Briefing }) {
  return (
    <section className="rounded-3xl border border-[#e8bf68]/30 bg-[radial-gradient(circle_at_top_left,rgba(232,191,104,0.18),transparent_58%),linear-gradient(160deg,#171208,#101922)] p-5" data-testid="pds-executive-briefing-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#c3a15f]">AI Executive Briefing</p>
          <h3 className="text-xl font-semibold text-[#f6e0a8]">{briefing.headline}</h3>
        </div>
        <p className="text-sm text-[#dbc89d]/80">
          {briefing.role_preset.replace(/_/g, " ")} · {briefing.horizon}
        </p>
      </div>
      <div className="mt-4 space-y-3 text-sm text-[#efe2bb]">
        {briefing.summary_lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="mt-5 grid gap-3">
        {briefing.recommended_actions.map((action) => (
          <div key={action} className="rounded-2xl border border-[#e8bf68]/20 bg-black/10 px-4 py-3 text-sm text-[#f7ebc9]">
            {action}
          </div>
        ))}
      </div>
    </section>
  );
}

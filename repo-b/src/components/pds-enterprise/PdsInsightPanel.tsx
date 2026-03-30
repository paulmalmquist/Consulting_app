"use client";

import React from "react";

import type { PdsV2InsightPanel } from "@/lib/bos-api";
import { reasonLabel } from "@/components/pds-enterprise/pdsEnterprise";

const STATUS_STYLES: Record<string, string> = {
  critical: "border-pds-signalRed/30 bg-pds-signalRed/10",
  warning: "border-pds-signalOrange/30 bg-pds-signalOrange/10",
  watch: "border-pds-signalYellow/30 bg-pds-signalYellow/10",
  neutral: "border-bm-border/60 bg-bm-surface/20",
};

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bm-muted2">{label}</p>
      <p className="mt-1 text-sm leading-5 text-bm-text">{value}</p>
    </div>
  );
}

export function PdsInsightPanel({ panel }: { panel: PdsV2InsightPanel }) {
  return (
    <section className={`rounded-[22px] border p-4 ${STATUS_STYLES[panel.status] || STATUS_STYLES.neutral}`} data-testid="pds-insight-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-pds-accentText">{panel.title}</p>
          <h3 className="mt-1 text-lg font-semibold text-bm-text">{panel.focus_label || "Portfolio focus"}</h3>
        </div>
        {panel.owner ? (
          <div className="rounded-full border border-bm-border/60 px-2.5 py-1 text-[11px] text-bm-muted2">
            Owner: {panel.owner}
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <InsightRow label="What" value={panel.what} />
        <InsightRow label="Why" value={panel.why} />
        <InsightRow label="Consequence" value={panel.consequence} />
        <InsightRow label="Action" value={panel.action} />
      </div>

      {panel.reason_codes.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {panel.reason_codes.map((reason) => (
            <span key={reason} className="rounded-full border border-bm-border/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              {reasonLabel(reason)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

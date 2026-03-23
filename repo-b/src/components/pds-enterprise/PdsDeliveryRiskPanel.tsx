"use client";
import React from "react";

import Link from "next/link";
import type { PdsV2DeliveryRiskItem } from "@/lib/bos-api";
import { reasonLabel } from "@/components/pds-enterprise/pdsEnterprise";

const SEVERITY_BORDER: Record<string, string> = {
  red: "border-l-pds-signalRed/60",
  orange: "border-l-pds-signalOrange/50",
};

const SEVERITY_DOT: Record<string, string> = {
  red: "bg-pds-signalRed",
  orange: "bg-pds-signalOrange",
};

export function PdsDeliveryRiskPanel({ items }: { items: PdsV2DeliveryRiskItem[] }) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-delivery-risk-panel">
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <article
              key={item.project_id}
              className={`rounded-xl border border-bm-border/50 border-l-2 ${SEVERITY_BORDER[item.severity] || "border-l-bm-border/60"} bg-pds-card/30 p-3`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[item.severity] || "bg-bm-muted2"}`} />
                    <Link href={item.href} className="text-sm font-semibold text-bm-text hover:text-pds-goldText hover:underline">
                      {item.project_name}
                    </Link>
                  </div>
                  <p className="mt-0.5 ml-4 text-xs text-bm-muted2">
                    {[item.account_name, item.market_name].filter(Boolean).join(" \u00B7 ")}
                  </p>
                </div>
                <p className="text-xs text-bm-muted2">Owner: {item.recommended_owner || "Operations lead"}</p>
              </div>
              {item.issue_summary && (
                <p className="mt-2 ml-4 text-xs text-bm-muted2">{item.issue_summary}</p>
              )}
              <div className="mt-2 ml-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {item.reason_codes.map((reason) => (
                    <span key={`${item.project_id}-${reason}`} className="rounded-md bg-bm-surface/40 px-2 py-0.5 text-[10px] text-bm-muted2">
                      {reasonLabel(reason)}
                    </span>
                  ))}
                </div>
                {item.recommended_action && (
                  <span className="text-[11px] font-medium text-pds-signalGreen">{item.recommended_action}</span>
                )}
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-xl border border-bm-border/60 bg-pds-card/30 p-4 text-sm text-bm-muted2">
            No projects requiring intervention.
          </p>
        )}
      </div>
    </section>
  );
}

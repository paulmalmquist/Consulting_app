"use client";
import React from "react";

import Link from "next/link";
import type { PdsV2DeliveryRiskItem } from "@/lib/bos-api";
import { healthBadgeClasses, reasonLabel } from "@/components/pds-enterprise/pdsEnterprise";

export function PdsDeliveryRiskPanel({ items }: { items: PdsV2DeliveryRiskItem[] }) {
  return (
    <section className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-delivery-risk-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-bm-muted2">Delivery Risk</p>
          <h3 className="text-xl font-semibold">Projects Requiring Intervention</h3>
        </div>
        <p className="text-sm text-bm-muted2">Intervene where schedule, commercial exposure, or closeout pressure is building.</p>
      </div>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item) => (
            <article key={item.project_id} className="rounded-2xl border border-bm-border/60 bg-[#101922] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={item.href} className="text-base font-semibold text-bm-text hover:underline">
                      {item.project_name}
                    </Link>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${healthBadgeClasses(item.severity)}`}>
                      {item.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-bm-muted2">
                    {[item.account_name, item.market_name].filter(Boolean).join(" · ") || "Portfolio delivery watch"}
                  </p>
                </div>
                <div className="text-right text-sm text-bm-muted2">
                  <p>Owner: {item.recommended_owner || "Operations lead"}</p>
                  <p className="mt-1">{item.issue_summary}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-bm-muted2">
                {item.reason_codes.map((reason) => (
                  <span key={`${item.project_id}-${reason}`} className="rounded-full bg-bm-surface/40 px-2 py-1">
                    {reasonLabel(reason)}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-bm-text">{item.recommended_action}</p>
                <Link href={item.href} className="rounded-full border border-bm-border/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] hover:bg-bm-surface/40">
                  Open Project
                </Link>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-bm-border/60 bg-[#101922] p-4 text-sm text-bm-muted2">
            No projects are currently in orange or red intervention status.
          </p>
        )}
      </div>
    </section>
  );
}

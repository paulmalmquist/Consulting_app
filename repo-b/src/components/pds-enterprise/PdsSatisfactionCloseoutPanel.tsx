"use client";
import React from "react";

import Link from "next/link";
import type { PdsV2CloseoutItem, PdsV2SatisfactionItem } from "@/lib/bos-api";
import { formatDate, formatNumber, reasonLabel } from "@/components/pds-enterprise/pdsEnterprise";

export function PdsSatisfactionCloseoutPanel({
  satisfaction,
  closeout,
}: {
  satisfaction: PdsV2SatisfactionItem[];
  closeout: PdsV2CloseoutItem[];
}) {
  return (
    <section className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-satisfaction-closeout-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-bm-muted2">Client Outcomes</p>
          <h3 className="text-xl font-semibold">Client Satisfaction and Closeout Discipline</h3>
        </div>
        <p className="text-sm text-bm-muted2">Protect repeat work, finish projects cleanly, and close the loop on final billing and lessons learned.</p>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          {satisfaction.map((item) => (
            <article key={item.account_id} className="rounded-2xl border border-bm-border/60 bg-[#101922] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{item.account_name}</h4>
                  <p className="text-sm text-bm-muted2">{item.client_name || "Strategic account"}</p>
                </div>
                <div className="text-right text-xs text-bm-muted2">
                  <p>Score {formatNumber(item.average_score, 1)}</p>
                  <p>Trend {formatNumber(item.trend_delta, 1)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-bm-muted2">
                {item.reason_codes.length ? item.reason_codes.map((reason) => (
                  <span key={`${item.account_id}-${reason}`} className="rounded-full bg-bm-surface/40 px-2 py-1">
                    {reasonLabel(reason)}
                  </span>
                )) : <span className="rounded-full bg-bm-surface/40 px-2 py-1">Stable</span>}
              </div>
            </article>
          ))}
        </div>
        <div className="space-y-3">
          {closeout.map((item) => (
            <article key={item.project_id} className="rounded-2xl border border-bm-border/60 bg-[#101922] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={item.href} className="font-semibold text-bm-text hover:underline">
                    {item.project_name}
                  </Link>
                  <p className="text-sm text-bm-muted2">
                    Target {formatDate(item.closeout_target_date)} · {item.blocker_count} blockers
                  </p>
                </div>
                <div className="text-right text-xs text-bm-muted2">
                  <p>{item.final_billing_status}</p>
                  <p>{item.survey_status}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-bm-muted2">
                {item.reason_codes.length ? item.reason_codes.map((reason) => (
                  <span key={`${item.project_id}-${reason}`} className="rounded-full bg-bm-surface/40 px-2 py-1">
                    {reasonLabel(reason)}
                  </span>
                )) : <span className="rounded-full bg-bm-surface/40 px-2 py-1">Clean closeout</span>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

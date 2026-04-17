"use client";

import Link from "next/link";
import { AlertTriangle, Building2, MapPin } from "lucide-react";
import type { OperatorSiteOrdinanceStrip as StripData } from "@/lib/bos-api";
import { fmtMoney } from "@/lib/format-utils";

const SEVERITY_TONE: Record<string, string> = {
  blocking: "border-red-400/40 bg-red-500/10 text-red-200",
  delaying: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  cost_impact: "border-orange-400/40 bg-orange-500/10 text-orange-100",
};

const RISK_TONE: Record<string, string> = {
  high_risk: "border-red-400/40 bg-red-500/10 text-red-200",
  borderline: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  clean: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
};

function fmtFeasibility(score: number | null | undefined): string {
  if (score == null) return "—";
  return `${Math.round(score * 100)}%`;
}

export function SiteOrdinanceStrip({ data }: { data: StripData }) {
  return (
    <section
      data-testid="site-ordinance-strip"
      className="rounded-3xl border border-bm-border/70 bg-bm-surface/25 p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
              Ordinance changes
            </p>
            <span className="text-xs text-bm-muted2">last 30 days</span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-bm-text">
            What municipalities changed
          </h3>
          <div className="mt-3 space-y-2">
            {data.ordinance_changes.length === 0 ? (
              <p className="text-sm text-bm-muted2">
                No ordinance changes impacting active sites this month.
              </p>
            ) : (
              data.ordinance_changes.map((event) => {
                const card = (
                  <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-bm-text">
                          {event.municipality_name}
                        </p>
                        <p className="mt-1 text-xs text-bm-muted2">
                          Effective {event.effective_date ?? "—"}
                        </p>
                      </div>
                      {event.severity ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${SEVERITY_TONE[event.severity] ?? "border-bm-border/60 bg-bm-surface/30 text-bm-muted2"}`}
                        >
                          {event.severity.replace("_", " ")}
                        </span>
                      ) : null}
                    </div>
                    {event.summary ? (
                      <p className="mt-2 text-sm text-bm-muted2">{event.summary}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {event.impact?.estimated_cost_usd ? (
                        <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-red-100">
                          {fmtMoney(event.impact.estimated_cost_usd)}
                        </span>
                      ) : null}
                      <span className="text-bm-muted2">
                        {event.affected_site_count} sites ·{" "}
                        {event.affected_project_count} projects
                      </span>
                    </div>
                  </div>
                );
                return event.href ? (
                  <Link
                    key={event.id}
                    href={event.href}
                    className="block transition hover:opacity-90"
                  >
                    {card}
                  </Link>
                ) : (
                  <div key={event.id}>{card}</div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
              Sites at risk
            </p>
            <span className="text-xs text-bm-muted2">top 3 under diligence</span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-bm-text">
            Sites with known feasibility blockers
          </h3>
          <div className="mt-3 space-y-2">
            {data.sites.length === 0 ? (
              <p className="text-sm text-bm-muted2">
                No sites under feasibility review.
              </p>
            ) : (
              data.sites.map((site) => (
                <Link
                  key={site.id}
                  href={site.href ?? "#"}
                  className="block rounded-2xl border border-bm-border/60 bg-black/25 p-3 transition hover:bg-black/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-bm-text">{site.name}</p>
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-bm-muted2">
                        <MapPin size={11} />
                        {site.municipality_name}
                      </p>
                    </div>
                    {site.risk_level ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${RISK_TONE[site.risk_level] ?? "border-bm-border/60 bg-bm-surface/30 text-bm-muted2"}`}
                      >
                        {site.risk_level.replace("_", " ")}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 text-bm-muted2">
                      Feasibility {fmtFeasibility(site.feasibility_score)}
                    </span>
                    {site.buildable_units_low != null && site.buildable_units_high != null ? (
                      <span className="text-bm-muted2">
                        {site.buildable_units_low}–{site.buildable_units_high} units
                      </span>
                    ) : null}
                    {site.confidence ? (
                      <span className="uppercase tracking-[0.14em] text-bm-muted2">
                        {site.confidence} conf
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {data.municipalities.length ? (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-bm-border/40 pt-4">
          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            <Building2 size={12} />
            Municipality friction
          </span>
          {data.municipalities.map((muni) => (
            <Link
              key={muni.id}
              href={muni.href ?? "#"}
              className="inline-flex items-center gap-2 rounded-full border border-bm-border/60 bg-black/25 px-3 py-1 text-xs text-bm-text hover:bg-black/40"
            >
              <AlertTriangle size={11} className="text-amber-200" />
              <span>{muni.name}</span>
              <span className="text-bm-muted2">
                {muni.friction_score != null
                  ? Math.round(muni.friction_score)
                  : "—"}
                /100
              </span>
              <span className="text-bm-muted2">
                · {muni.median_approval_days ?? "—"}d median
              </span>
              {muni.recent_changes_30d ? (
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-100">
                  {muni.recent_changes_30d} changes 30d
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default SiteOrdinanceStrip;

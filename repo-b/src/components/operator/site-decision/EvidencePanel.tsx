"use client";

import type {
  OperatorSiteDecisionEvidence,
  OperatorSiteDecisionSite,
} from "@/lib/bos-api";

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-white/10 bg-black/30 p-4 open:pb-5"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold uppercase tracking-[0.16em] text-bm-muted2 group-open:text-bm-text">
        <span>{title}</span>
        <span className="text-bm-muted2 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function EvidencePanel({
  site,
  evidence,
}: {
  site: OperatorSiteDecisionSite;
  evidence: OperatorSiteDecisionEvidence;
}) {
  return (
    <div className="space-y-3">
      <Section title="Site facts" defaultOpen>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          {[
            ["Address", site.address],
            ["Parcel ID", site.parcel_id],
            ["Zoning", site.zoning],
            ["Acreage", site.acreage ? `${site.acreage} ac` : null],
            ["Status", site.status],
            ["Target use", site.target_project_type],
            ["Buildable units",
              site.buildable_units_low && site.buildable_units_high
                ? `${site.buildable_units_low}–${site.buildable_units_high}`
                : null],
            ["Height limit",
              site.height_limit_ft ? `${site.height_limit_ft} ft` : null],
            ["Density cap",
              site.density_cap_du_per_acre ? `${site.density_cap_du_per_acre} DU/ac` : null],
            ["Approval timeline",
              site.approval_timeline_days_low && site.approval_timeline_days_high
                ? `${site.approval_timeline_days_low}–${site.approval_timeline_days_high}d`
                : null],
            ["Feasibility score",
              site.feasibility_score != null
                ? `${Math.round(site.feasibility_score * 100)}%`
                : null],
            ["Municipality",
              site.municipality_name
                ? `${site.municipality_name} (friction ${site.municipality_friction_score ?? "—"})`
                : null],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <dt className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
                {label}
              </dt>
              <dd className="mt-1 text-bm-text">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Comparable projects">
        {evidence.comparable_projects?.length ? (
          <ul className="space-y-2">
            {evidence.comparable_projects.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-bm-text">{c.name}</span>
                  <span className="text-xs text-bm-muted2">
                    {c.outcome?.replace(/_/g, " ")} · {c.cycle_days}d
                  </span>
                </div>
                {c.notes ? (
                  <p className="mt-1 text-xs text-bm-muted2">{c.notes}</p>
                ) : null}
                {c.matched_on?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.matched_on.map((m) => (
                      <span
                        key={m}
                        className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-bm-muted2"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-bm-muted2">
            Not available — no comparable projects linked for this site.
          </p>
        )}
      </Section>

      <Section title="Feasibility assessment">
        {evidence.feasibility ? (
          <div className="space-y-3 text-sm">
            <p className="text-bm-text">{evidence.feasibility.summary}</p>
            {evidence.feasibility.constraints?.length ? (
              <ul className="space-y-2">
                {evidence.feasibility.constraints.map((c, idx) => (
                  <li
                    key={`${c.rule_id}-${idx}`}
                    className="rounded-xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex items-center justify-between text-xs text-bm-muted2">
                      <span>{c.rule_id}</span>
                      <span className="uppercase">{c.impact}</span>
                    </div>
                    <p className="mt-1 text-bm-text">{c.note}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {evidence.feasibility.recommended_actions?.length ? (
              <ul className="list-disc pl-5 text-xs text-bm-muted2">
                {evidence.feasibility.recommended_actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-bm-muted2">
            Not available — feasibility assessment has not been generated.
          </p>
        )}
      </Section>

      <Section title="Relevant ordinance rules">
        {evidence.ordinance_rules?.length ? (
          <ul className="space-y-2">
            {evidence.ordinance_rules.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-bm-text">{r.title}</span>
                  <span className="text-xs text-bm-muted2">{r.effective_date}</span>
                </div>
                <p className="mt-1 text-xs text-bm-muted2">{r.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-bm-muted2">
            Not available — no municipality rules indexed.
          </p>
        )}
      </Section>
    </div>
  );
}

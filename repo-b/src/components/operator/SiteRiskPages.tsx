"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { WorkspaceContextLoader } from "@/components/ui/WinstonLoader";
import { OperatorUnavailableState } from "@/components/operator/OperatorUnavailableState";
import {
  getOperatorSiteDetail,
  listOperatorMunicipalities,
  listOperatorOrdinanceChanges,
  listOperatorSites,
  type OperatorMunicipalityRow,
  type OperatorOrdinanceChangeRow,
  type OperatorLegacySiteDetail,
  type OperatorLegacySiteRow,
} from "@/lib/bos-api";
import { fmtMoney } from "@/lib/format-utils";
import ScenarioPanel from "@/components/operator/ScenarioPanel";

const RISK_TONE: Record<string, string> = {
  high_risk: "border-red-400/40 bg-red-500/10 text-red-200",
  borderline: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  clean: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
};

const SEVERITY_TONE: Record<string, string> = {
  blocking: "border-red-400/40 bg-red-500/10 text-red-200",
  delaying: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  cost_impact: "border-orange-400/40 bg-orange-500/10 text-orange-100",
};

const IMPACT_TONE: Record<string, string> = {
  blocking: "text-red-200",
  cost_impact: "text-orange-200",
  delaying: "text-amber-200",
};

function fmtPct(score: number | null | undefined): string {
  if (score == null) return "—";
  return `${Math.round(score * 100)}%`;
}

function SectionShell({
  id,
  title,
  eyebrow,
  children,
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-5">
      {eyebrow ? <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">{eyebrow}</p> : null}
      <h2 className="mt-1 text-lg font-semibold text-bm-text">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SiteRiskLandingPage() {
  const { envId, businessId } = useDomainEnv();
  const [sites, setSites] = useState<OperatorLegacySiteRow[]>([]);
  const [events, setEvents] = useState<OperatorOrdinanceChangeRow[]>([]);
  const [munis, setMunis] = useState<OperatorMunicipalityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, e, m] = await Promise.all([
        listOperatorSites(envId, businessId || undefined),
        listOperatorOrdinanceChanges(envId, businessId || undefined),
        listOperatorMunicipalities(envId, businessId || undefined),
      ]);
      setSites(s);
      setEvents(e);
      setMunis(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load site risk data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [envId, businessId]);

  if (loading) return <WorkspaceContextLoader label="Loading site risk" />;
  if (error) {
    return (
      <OperatorUnavailableState
        title="Site risk unavailable"
        detail={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionShell
        id="ordinance-changes"
        title={`${events.length} ordinance change${events.length === 1 ? "" : "s"} in the last 30 days`}
        eyebrow="Ordinance Intelligence"
      >
        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-bm-muted2">No recent ordinance changes affecting active sites.</p>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-bm-border/60 bg-black/25 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-bm-text">{event.rule_title}</p>
                    <p className="mt-1 text-xs text-bm-muted2">
                      {event.municipality_name} · effective {event.effective_date ?? "—"}
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
                  <p className="mt-3 text-sm text-bm-muted2">{event.summary}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  {event.impact?.estimated_cost_usd ? (
                    <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-red-100">
                      {fmtMoney(event.impact.estimated_cost_usd)}
                    </span>
                  ) : null}
                  {event.impact?.estimated_delay_days ? (
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                      +{event.impact.estimated_delay_days}d
                    </span>
                  ) : null}
                  {event.impact?.time_to_failure_days != null &&
                  event.impact.time_to_failure_days <= 14 ? (
                    <span className="rounded-full border border-red-500/50 bg-red-500/20 px-2 py-0.5 font-medium text-red-100">
                      {event.impact.time_to_failure_days}d to failure
                    </span>
                  ) : null}
                  {event.confidence ? (
                    <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 uppercase tracking-[0.14em] text-bm-muted2">
                      {event.confidence} conf
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-bm-muted2">
                  {event.affected_sites.map((s) => (
                    <Link
                      key={s.site_id}
                      href={s.href ?? "#"}
                      className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 hover:bg-bm-surface/50"
                    >
                      Site · {s.name}
                    </Link>
                  ))}
                  {event.affected_projects.map((p) => (
                    <Link
                      key={p.project_id}
                      href={p.href ?? "#"}
                      className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 hover:bg-bm-surface/50"
                    >
                      Project · {p.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </SectionShell>

      <SectionShell id="sites" title="Site pipeline" eyebrow="Feasibility ranked by risk">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/40 text-left text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                <th className="px-2 py-2 font-medium">Site</th>
                <th className="px-2 py-2 font-medium">Municipality</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Feasibility</th>
                <th className="px-2 py-2 font-medium">Units</th>
                <th className="px-2 py-2 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/30">
              {sites.map((site) => (
                <tr key={site.site_id}>
                  <td className="px-2 py-2">
                    <Link href={site.href ?? "#"} className="font-medium text-bm-text hover:underline">
                      {site.name}
                    </Link>
                    <div className="text-xs text-bm-muted2">{site.zoning}</div>
                  </td>
                  <td className="px-2 py-2 text-bm-text">{site.municipality_name}</td>
                  <td className="px-2 py-2 text-bm-muted2">
                    {site.status?.replace("_", " ") ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-bm-text">{fmtPct(site.feasibility_score)}</div>
                    {site.confidence ? (
                      <div className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                        {site.confidence} conf
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-bm-muted2">
                    {site.buildable_units_low ?? "—"}–{site.buildable_units_high ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    {site.risk_level ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${RISK_TONE[site.risk_level] ?? "border-bm-border/60 bg-bm-surface/30 text-bm-muted2"}`}
                      >
                        {site.risk_level.replace("_", " ")}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionShell>

      <SectionShell id="municipalities" title="Municipality friction" eyebrow="Jurisdiction scorecard">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {munis.map((muni) => (
            <Link
              key={muni.id}
              href={muni.href ?? "#"}
              className="rounded-2xl border border-bm-border/60 bg-black/25 p-3 transition hover:bg-black/35"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-bm-text">{muni.name}</p>
                  <p className="mt-1 text-xs text-bm-muted2">
                    {muni.state} · {muni.active_project_count ?? 0} projects ·{" "}
                    {muni.active_site_count ?? 0} sites
                  </p>
                </div>
                <span className="text-2xl font-semibold text-bm-text">
                  {muni.overall_friction_score != null
                    ? Math.round(muni.overall_friction_score)
                    : "—"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-bm-muted2">
                <span>Median approval: {muni.median_approval_days ?? "—"}d</span>
                <span>Variance rate: {fmtPct(muni.variance_required_rate)}</span>
                <span>Rework: {fmtPct(muni.rework_rate)}</span>
                <span>Changes 30d: {muni.recent_changes_30d ?? 0}</span>
              </div>
            </Link>
          ))}
        </div>
      </SectionShell>
    </div>
  );
}

export function SiteRiskDetailPage({ siteId }: { siteId: string }) {
  const { envId, businessId } = useDomainEnv();
  const [detail, setDetail] = useState<OperatorLegacySiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await getOperatorSiteDetail(siteId, envId, businessId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load site detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [siteId, envId, businessId]);

  if (loading) return <WorkspaceContextLoader label="Loading site detail" />;
  if (error || !detail) {
    return (
      <OperatorUnavailableState
        title="Site detail unavailable"
        detail={error || "No data returned."}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionShell title={detail.name ?? "Site"} eyebrow="Feasibility Engine">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1 text-sm text-bm-muted2">
              <MapPin size={13} />
              {detail.address} · {detail.municipality_name}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-bm-muted2">{detail.summary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail.risk_level ? (
              <span
                className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${RISK_TONE[detail.risk_level] ?? "border-bm-border/60 bg-bm-surface/30 text-bm-muted2"}`}
              >
                {detail.risk_level.replace("_", " ")}
              </span>
            ) : null}
            <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
              Feasibility {fmtPct(detail.feasibility_score)}
            </span>
            {detail.confidence ? (
              <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                {detail.confidence} conf
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Buildable units</p>
            <p className="mt-1 text-lg font-semibold text-bm-text">
              {detail.buildable_units_low ?? "—"}–{detail.buildable_units_high ?? "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Approval timeline</p>
            <p className="mt-1 text-lg font-semibold text-bm-text">
              {detail.approval_timeline_days_low ?? "—"}–{detail.approval_timeline_days_high ?? "—"}d
            </p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Zoning</p>
            <p className="mt-1 text-lg font-semibold text-bm-text">{detail.zoning ?? "—"}</p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Muni friction</p>
            <p className="mt-1 text-lg font-semibold text-bm-text">
              {detail.municipality_friction_score != null
                ? `${Math.round(detail.municipality_friction_score)}/100`
                : "—"}
            </p>
          </div>
        </div>
      </SectionShell>

      <SectionShell title="Financial impact of today's decisions" eyebrow="REPE Crossover">
        {detail.development_scenarios ? (
          <ScenarioPanel
            scenarios={detail.development_scenarios}
            siteConfidence={detail.confidence}
          />
        ) : (
          <p className="text-sm text-bm-muted2">Scenario data not available for this site.</p>
        )}
      </SectionShell>

      <SectionShell title="Constraint breakdown" eyebrow="Linked Ordinance Rules">
        {(detail.constraints ?? []).length === 0 ? (
          <p className="text-sm text-bm-muted2">No active constraints. Site is clean.</p>
        ) : (
          <div className="space-y-3">
            {(detail.constraints ?? []).map((constraint) => (
              <div
                key={constraint.rule_id ?? constraint.rule_title}
                className="rounded-2xl border border-bm-border/60 bg-black/25 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-bm-text">{constraint.rule_title}</p>
                    <p className="mt-1 text-xs text-bm-muted2">
                      Effective {constraint.effective_date ?? "—"} · {constraint.severity}
                    </p>
                  </div>
                  {constraint.impact ? (
                    <span
                      className={`text-[11px] uppercase tracking-[0.14em] ${IMPACT_TONE[constraint.impact] ?? "text-bm-muted2"}`}
                    >
                      {constraint.impact.replace("_", " ")}
                    </span>
                  ) : null}
                </div>
                {constraint.note ? (
                  <p className="mt-2 text-sm text-bm-muted2">{constraint.note}</p>
                ) : null}
                {constraint.confidence ? (
                  <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                    {constraint.confidence} conf
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell title="Comparable projects" eyebrow="Pattern Matching">
        {(detail.comparable_projects ?? []).length === 0 ? (
          <p className="text-sm text-bm-muted2">No comparable projects matched.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(detail.comparable_projects ?? []).map((comp) => (
              <div
                key={comp.id}
                className="rounded-2xl border border-bm-border/60 bg-black/25 p-3"
              >
                <p className="font-medium text-bm-text">{comp.name}</p>
                <p className="mt-1 text-xs text-bm-muted2">
                  {comp.municipality_name} · {comp.outcome?.replace("_", " ")} · {comp.cycle_days ?? "—"}d
                </p>
                {comp.notes ? <p className="mt-2 text-sm text-bm-muted2">{comp.notes}</p> : null}
                {comp.matched_on.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {comp.matched_on.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-bm-muted2"
                      >
                        {tag.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell title="Recommended actions" eyebrow="Do Next">
        {detail.recommended_actions.length === 0 ? (
          <p className="text-sm text-bm-muted2">No actions required right now.</p>
        ) : (
          <ol className="space-y-2 text-sm text-bm-text/90">
            {detail.recommended_actions.map((action, idx) => (
              <li key={action} className="flex gap-3">
                <span className="mt-0.5 text-xs text-bm-muted2">{idx + 1}.</span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
        )}
        {detail.linked_project ? (
          <div className="mt-4 rounded-2xl border border-bm-border/60 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Linked project</p>
            <Link
              href={detail.linked_project.href ?? "#"}
              className="mt-1 block text-sm text-bm-text hover:underline"
            >
              {detail.linked_project.name}
            </Link>
          </div>
        ) : null}
      </SectionShell>
    </div>
  );
}

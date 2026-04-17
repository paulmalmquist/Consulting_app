"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { WorkspaceContextLoader } from "@/components/ui/WinstonLoader";
import { OperatorUnavailableState } from "@/components/operator/OperatorUnavailableState";
import {
  getOperatorMunicipalityDetail,
  listOperatorMunicipalities,
  type OperatorMunicipalityDetail,
  type OperatorMunicipalityRow,
} from "@/lib/bos-api";
import { fmtMoney } from "@/lib/format-utils";

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

export function MunicipalityLandingPage() {
  const { envId, businessId } = useDomainEnv();
  const [rows, setRows] = useState<OperatorMunicipalityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listOperatorMunicipalities(envId, businessId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load municipalities.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [envId, businessId]);

  if (loading) return <WorkspaceContextLoader label="Loading municipality scorecard" />;
  if (error) {
    return (
      <OperatorUnavailableState
        title="Municipality scorecard unavailable"
        detail={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionShell id="scorecard" title="Municipality scorecard" eyebrow="Jurisdiction Friction Ranking">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/40 text-left text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                <th className="px-2 py-2 font-medium">Municipality</th>
                <th className="px-2 py-2 font-medium">Active</th>
                <th className="px-2 py-2 font-medium">Median days</th>
                <th className="px-2 py-2 font-medium">Variance rate</th>
                <th className="px-2 py-2 font-medium">Rework</th>
                <th className="px-2 py-2 font-medium">Changes 30d</th>
                <th className="px-2 py-2 font-medium">Friction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/30">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-2 py-2">
                    <Link
                      href={row.href ?? "#"}
                      className="font-medium text-bm-text hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="text-xs text-bm-muted2">{row.state}</div>
                  </td>
                  <td className="px-2 py-2 text-bm-muted2">
                    {row.active_project_count ?? 0}p / {row.active_site_count ?? 0}s
                  </td>
                  <td className="px-2 py-2 text-bm-text">{row.median_approval_days ?? "—"}d</td>
                  <td className="px-2 py-2 text-bm-text">{fmtPct(row.variance_required_rate)}</td>
                  <td className="px-2 py-2 text-bm-text">{fmtPct(row.rework_rate)}</td>
                  <td className="px-2 py-2 text-bm-muted2">{row.recent_changes_30d ?? 0}</td>
                  <td className="px-2 py-2">
                    <span className="text-lg font-semibold text-bm-text">
                      {row.overall_friction_score != null
                        ? Math.round(row.overall_friction_score)
                        : "—"}
                    </span>
                    <span className="ml-1 text-[11px] text-bm-muted2">/100</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionShell>
    </div>
  );
}

export function MunicipalityDetailPage({ municipalityId }: { municipalityId: string }) {
  const { envId, businessId } = useDomainEnv();
  const [detail, setDetail] = useState<OperatorMunicipalityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(
        await getOperatorMunicipalityDetail(municipalityId, envId, businessId || undefined)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load municipality detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [municipalityId, envId, businessId]);

  if (loading) return <WorkspaceContextLoader label="Loading municipality detail" />;
  if (error || !detail) {
    return (
      <OperatorUnavailableState
        title="Municipality detail unavailable"
        detail={error || "No data returned."}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionShell title={detail.name ?? "Municipality"} eyebrow={`${detail.state ?? ""} scorecard`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm text-bm-muted2">
            Friction score aggregates approval timeline, variance rate, rework, and ordinance
            volatility across Hall Boys pursuit and delivery activity.
          </p>
          <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-3 py-1 text-lg font-semibold text-bm-text">
            {detail.overall_friction_score != null
              ? Math.round(detail.overall_friction_score)
              : "—"}
            <span className="ml-1 text-[11px] uppercase tracking-[0.18em] text-bm-muted2">/100</span>
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Median approval</p>
            <p className="mt-1 text-lg font-semibold text-bm-text">
              {detail.median_approval_days ?? "—"}d
            </p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Variance rate</p>
            <p className="mt-1 text-lg font-semibold text-bm-text">
              {fmtPct(detail.variance_required_rate)}
            </p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Inspection fails</p>
            <p className="mt-1 text-lg font-semibold text-bm-text">
              {fmtPct(detail.inspection_fail_rate)}
            </p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Rework rate</p>
            <p className="mt-1 text-lg font-semibold text-bm-text">
              {fmtPct(detail.rework_rate)}
            </p>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="linked-sites" title="Linked sites" eyebrow="Active in this Jurisdiction">
        {detail.sites.length === 0 ? (
          <p className="text-sm text-bm-muted2">No active Hall Boys sites here.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {detail.sites.map((site) => (
              <Link
                key={site.project_id}
                href={site.href ?? "#"}
                className="rounded-2xl border border-bm-border/60 bg-black/25 p-3 transition hover:bg-black/35"
              >
                <p className="font-medium text-bm-text">{site.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-bm-muted2">
                  {site.status ?? site.risk_level ?? ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell id="linked-projects" title="Linked projects" eyebrow="Delivery Exposure">
        {detail.linked_projects.length === 0 ? (
          <p className="text-sm text-bm-muted2">No active projects tied to this jurisdiction.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {detail.linked_projects.map((p) => (
              <Link
                key={p.project_id}
                href={p.href ?? "#"}
                className="rounded-2xl border border-bm-border/60 bg-black/25 p-3 transition hover:bg-black/35"
              >
                <p className="font-medium text-bm-text">{p.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-bm-muted2">
                  {p.status ?? p.risk_level ?? ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell id="recent-changes" title="Recent ordinance changes" eyebrow="Last 30 Days">
        {detail.recent_changes.length === 0 ? (
          <p className="text-sm text-bm-muted2">No recent ordinance activity.</p>
        ) : (
          <div className="space-y-3">
            {detail.recent_changes.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-bm-border/60 bg-black/25 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-bm-text">{event.rule_title}</p>
                  {event.severity ? (
                    <span className="rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                      {event.severity.replace("_", " ")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-bm-muted2">
                  Effective {event.effective_date ?? "—"}
                </p>
                {event.summary ? (
                  <p className="mt-2 text-sm text-bm-muted2">{event.summary}</p>
                ) : null}
                {event.impact?.estimated_cost_usd ? (
                  <p className="mt-2 text-[11px] text-red-200">
                    Cost impact: {fmtMoney(event.impact.estimated_cost_usd)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionShell>
    </div>
  );
}

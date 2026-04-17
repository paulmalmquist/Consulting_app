"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { WorkspaceContextLoader } from "@/components/ui/WinstonLoader";
import { OperatorUnavailableState } from "@/components/operator/OperatorUnavailableState";
import {
  getOperatorPipelineIntegrity,
  type OperatorActiveBeforeReadyRow,
  type OperatorAssumptionDriftRow,
  type OperatorHandoffVarianceItem,
  type OperatorPipelineIntegrity,
  type OperatorPrematureProjectRow,
  type OperatorReadinessGate,
} from "@/lib/bos-api";
import { fmtMoney } from "@/lib/format-utils";

const GATE_TONE: Record<string, string> = {
  complete: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  at_risk: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  incomplete: "border-red-400/40 bg-red-500/10 text-red-200",
  unknown: "border-bm-border/60 bg-bm-surface/30 text-bm-muted2",
};

const SEVERITY_TONE: Record<string, string> = {
  high: "border-red-400/40 bg-red-500/10 text-red-200",
  medium: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  low: "border-bm-border/60 bg-bm-surface/30 text-bm-muted2",
};

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
      {eyebrow ? (
        <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">{eyebrow}</p>
      ) : null}
      <h2 className="mt-1 text-lg font-semibold text-bm-text">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PrematureProjectCard({ row }: { row: OperatorPrematureProjectRow }) {
  const score = row.feasibility_score == null ? "—" : `${Math.round(row.feasibility_score * 100)}%`;
  return (
    <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={row.project_href ?? "#"}
            className="text-base font-medium text-bm-text hover:underline"
          >
            {row.project_name}
          </Link>
          <p className="mt-1 text-xs text-bm-muted2">Site: {row.site_name}</p>
        </div>
        <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-100">
          Feasibility {score}
        </span>
      </div>
      {row.summary ? (
        <p className="mt-3 text-sm text-bm-muted2">{row.summary}</p>
      ) : null}
      {row.recommended_action ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-bm-text/90">
          <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 uppercase tracking-[0.14em] text-bm-muted2">
            Do next
          </span>
          {row.recommended_action}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-3 text-xs text-bm-muted2">
        <Link href={row.href ?? "#"} className="inline-flex items-center gap-1 hover:text-bm-text">
          Open site <ArrowRight size={11} />
        </Link>
        <Link
          href={row.project_href ?? "#"}
          className="inline-flex items-center gap-1 hover:text-bm-text"
        >
          Open project <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}

function ReadinessGatePill({ gate }: { gate: OperatorReadinessGate }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${GATE_TONE[gate.status] ?? GATE_TONE.unknown}`}
      title={gate.blocker_reason ?? undefined}
    >
      {gate.label ?? gate.key}
    </span>
  );
}

function ActiveBeforeReadyCard({ row }: { row: OperatorActiveBeforeReadyRow }) {
  const pct = Math.round(row.overall_pct * 100);
  return (
    <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={row.href ?? "#"}
            className="text-base font-medium text-bm-text hover:underline"
          >
            {row.project_name}
          </Link>
          {row.owner ? (
            <p className="mt-1 text-xs text-bm-muted2">{row.owner}</p>
          ) : null}
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100">
          {pct}% ready
        </span>
      </div>
      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-bm-border/40">
          <div
            className="h-full rounded-full bg-amber-400/70"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {row.gates.map((gate) => (
          <ReadinessGatePill key={`${row.project_id}-${gate.key}`} gate={gate} />
        ))}
      </div>
      {row.next_action ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-bm-text/90">
          <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/50 bg-bm-surface/30 px-2 py-0.5 uppercase tracking-[0.14em] text-bm-muted2">
            Do next
          </span>
          {row.next_action}
        </p>
      ) : null}
    </div>
  );
}

function VarianceRow({ item }: { item: OperatorHandoffVarianceItem }) {
  const impact = item.impact;
  const severity = item.severity || "medium";
  const pursuit =
    typeof item.pursuit === "number"
      ? fmtMoney(item.pursuit)
      : String(item.pursuit ?? "—");
  const current =
    typeof item.current === "number"
      ? fmtMoney(item.current)
      : String(item.current ?? "—");
  return (
    <div className="grid gap-2 rounded-2xl border border-bm-border/50 bg-black/20 p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-bm-text">{item.label ?? item.key}</p>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${SEVERITY_TONE[severity] ?? SEVERITY_TONE.medium}`}
          >
            {severity}
          </span>
        </div>
        <p className="mt-1 text-xs text-bm-muted2">
          <span className="text-bm-muted2">Pursuit:</span>{" "}
          <span className="text-bm-text/90">{pursuit}</span>
        </p>
        <p className="text-xs text-bm-muted2">
          <span className="text-bm-muted2">Current:</span>{" "}
          <span className="text-bm-text/90">{current}</span>
        </p>
        {item.note ? <p className="mt-1 text-xs text-bm-muted2">{item.note}</p> : null}
      </div>
      {impact ? (
        <div className="flex flex-col justify-center gap-1 text-right text-[11px]">
          {impact.estimated_cost_usd ? (
            <span className="font-medium text-red-200">
              {fmtMoney(impact.estimated_cost_usd)} today
            </span>
          ) : null}
          {impact.estimated_delay_days ? (
            <span className="text-amber-100">+{impact.estimated_delay_days}d</span>
          ) : null}
          {impact.if_ignored?.in_30_days ? (
            <span className="text-red-200/80">
              If ignored in 30d: +
              {fmtMoney(impact.if_ignored.in_30_days.estimated_cost_usd)}
              {impact.if_ignored.in_30_days.estimated_delay_days
                ? ` · +${impact.if_ignored.in_30_days.estimated_delay_days}d`
                : ""}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AssumptionDriftCard({ row }: { row: OperatorAssumptionDriftRow }) {
  return (
    <div className="rounded-2xl border border-bm-border/60 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={row.href ?? "#"}
            className="text-base font-medium text-bm-text hover:underline"
          >
            {row.project_name}
          </Link>
          <p className="mt-1 text-xs text-bm-muted2">
            Captured {row.captured_at_pursuit ?? "—"} · {row.variance_count} drift
            {row.variance_count === 1 ? "" : "s"}
            {row.site_name ? ` · ${row.site_name}` : ""}
          </p>
        </div>
        <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-100">
          {fmtMoney(row.total_impact_usd)} at risk
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {row.variance_items.map((item) => (
          <VarianceRow key={`${row.project_id}-${item.key}`} item={item} />
        ))}
      </div>
    </div>
  );
}

export function PipelineIntegrityLandingPage() {
  const { envId, businessId } = useDomainEnv();
  const [data, setData] = useState<OperatorPipelineIntegrity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getOperatorPipelineIntegrity(envId, businessId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline integrity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [envId, businessId]);

  if (loading) return <WorkspaceContextLoader label="Loading pipeline integrity" />;
  if (error || !data) {
    return (
      <OperatorUnavailableState
        title="Pipeline Integrity unavailable"
        detail={error || "No data returned."}
        onRetry={() => void load()}
      />
    );
  }

  const { premature_projects, active_before_ready, assumption_drift, totals } = data;

  return (
    <div className="space-y-4">
      <section
        data-testid="pipeline-integrity-summary"
        className="grid gap-3 sm:grid-cols-3"
      >
        <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/25 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            Premature projects
          </p>
          <p className="mt-2 text-3xl font-semibold text-bm-text">
            {totals.premature_count}
          </p>
          <p className="mt-1 text-xs text-bm-muted2">
            Sites with feasibility below threshold that became projects.
          </p>
        </div>
        <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/25 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            Active before ready
          </p>
          <p className="mt-2 text-3xl font-semibold text-bm-text">
            {totals.active_before_ready_count}
          </p>
          <p className="mt-1 text-xs text-bm-muted2">
            Projects running while preconstruction gates remain open.
          </p>
        </div>
        <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/25 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            Assumption drift at risk
          </p>
          <p className="mt-2 text-3xl font-semibold text-red-200">
            {fmtMoney(totals.total_drift_impact_usd)}
          </p>
          <p className="mt-1 text-xs text-bm-muted2">
            Cumulative $ impact across pursuit-vs-reality variance.
          </p>
        </div>
      </section>

      <SectionShell
        id="premature-projects"
        title="Sites pushed into projects prematurely"
        eyebrow="Loop 1 → Loop 2 Handoff"
      >
        {premature_projects.length === 0 ? (
          <p className="text-sm text-bm-muted2">
            No premature projects. Every active project started above feasibility
            threshold.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {premature_projects.map((row) => (
              <PrematureProjectCard key={row.project_id} row={row} />
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        id="active-before-ready"
        title="Projects active before ready"
        eyebrow="Preconstruction Readiness"
      >
        {active_before_ready.length === 0 ? (
          <p className="text-sm text-bm-muted2">
            No active projects below readiness threshold.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {active_before_ready.map((row) => (
              <ActiveBeforeReadyCard key={row.project_id} row={row} />
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        id="assumption-drift"
        title="Assumption drift"
        eyebrow="Deal-to-Execution Handoff"
      >
        {assumption_drift.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-bm-muted2">
            <AlertTriangle size={14} className="text-amber-200" />
            No material drift detected above impact threshold.
          </div>
        ) : (
          <div className="space-y-3">
            {assumption_drift.map((row) => (
              <AssumptionDriftCard key={row.project_id} row={row} />
            ))}
          </div>
        )}
      </SectionShell>
    </div>
  );
}

export default PipelineIntegrityLandingPage;

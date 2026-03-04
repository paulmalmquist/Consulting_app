"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPdsPortfolioHealth, runPdsReportPack, runPdsSnapshot } from "@/lib/bos-api";
import type { PdsPortfolioHealth, PdsStatusMetric } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value?: string | null): string {
  if (!value) return "No date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function stateTone(state: PdsStatusMetric["state"]): string {
  if (state === "red") return "border-red-500/40 bg-red-500/10 text-red-100";
  if (state === "yellow") return "border-amber-400/40 bg-amber-400/10 text-amber-100";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
}

function badgeTone(state: "red" | "yellow" | "green"): string {
  if (state === "red") return "bg-red-500/15 text-red-200";
  if (state === "yellow") return "bg-amber-400/15 text-amber-200";
  return "bg-emerald-500/15 text-emerald-200";
}

function priorityTone(priority: string): string {
  if (priority === "high") return "bg-red-500/15 text-red-200";
  if (priority === "medium") return "bg-amber-400/15 text-amber-200";
  return "bg-emerald-500/15 text-emerald-200";
}

function PortfolioStatusSummary({ summary }: { summary: PdsPortfolioHealth["summary"] | null }) {
  const cards = [
    { label: "Active Projects", metric: summary?.active_projects ?? { value: 0, state: "green" as const } },
    { label: "Projects At Risk", metric: summary?.projects_at_risk ?? { value: 0, state: "green" as const } },
    { label: "Behind Schedule", metric: summary?.behind_schedule ?? { value: 0, state: "green" as const } },
    { label: "Over Budget", metric: summary?.over_budget ?? { value: 0, state: "green" as const } },
    { label: "Pending Change Orders", metric: summary?.pending_change_orders ?? { value: 0, state: "green" as const } },
    { label: "Upcoming Milestones (7d)", metric: summary?.upcoming_milestones_7d ?? { value: 0, state: "green" as const } },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-2xl border p-4 ${stateTone(card.metric.state)}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-current/80">{card.label}</p>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${badgeTone(card.metric.state)}`}>
              {card.metric.state}
            </span>
          </div>
          <p className="mt-3 text-3xl font-semibold">{card.metric.value}</p>
        </div>
      ))}
    </div>
  );
}

function ProjectsRequiringAttentionTable({
  items,
  loading,
}: {
  items: PdsPortfolioHealth["projects_requiring_attention"];
  loading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-attention-table">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Intervention Queue</p>
          <h3 className="text-lg font-semibold">Projects Requiring Attention</h3>
        </div>
        <p className="text-sm text-bm-muted2">Where cost, schedule, or approvals need action now.</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
            <tr className="border-b border-bm-border/50">
              <th className="pb-3 pr-4 font-medium">Project</th>
              <th className="pb-3 pr-4 font-medium">Issue Type</th>
              <th className="pb-3 pr-4 font-medium">Impact</th>
              <th className="pb-3 font-medium">Recommended Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-5 text-bm-muted2">
                  Loading intervention queue...
                </td>
              </tr>
            ) : items.length ? (
              items.map((item) => (
                <tr key={item.project_id} className="border-b border-bm-border/40 last:border-b-0">
                  <td className="py-4 pr-4 align-top">
                    <div className="font-medium text-bm-text">{item.project_name}</div>
                    <div className="mt-1 text-xs text-bm-muted2">
                      {item.project_code || "No code"}
                      {item.project_manager ? ` · PM ${item.project_manager}` : ""}
                      {item.next_milestone_date ? ` · ${formatDate(item.next_milestone_date)}` : ""}
                    </div>
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${badgeTone(item.severity)}`}>
                        {item.severity}
                      </span>
                      <span>{item.issue_type}</span>
                    </div>
                    {item.reason_codes.length ? (
                      <div className="mt-1 text-xs text-bm-muted2">{item.reason_codes.join(" · ")}</div>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4 align-top font-medium">{item.impact_label}</td>
                  <td className="py-4 align-top">
                    <Link
                      href={item.recommended_action.href}
                      className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-xs font-medium hover:bg-bm-surface/40"
                    >
                      {item.recommended_action.label}
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-5 text-bm-muted2">
                  No active interventions. The portfolio is clear right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UpcomingMilestonesPanel({
  items,
  loading,
}: {
  items: PdsPortfolioHealth["upcoming_milestones"];
  loading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-upcoming-milestones">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Schedule Horizon</p>
          <h3 className="text-lg font-semibold">Upcoming Milestones</h3>
        </div>
        <p className="text-sm text-bm-muted2">Next 7–14 days across active projects.</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
            <tr className="border-b border-bm-border/50">
              <th className="pb-3 pr-4 font-medium">Project</th>
              <th className="pb-3 pr-4 font-medium">Milestone</th>
              <th className="pb-3 pr-4 font-medium">Date</th>
              <th className="pb-3 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-5 text-bm-muted2">
                  Loading milestones...
                </td>
              </tr>
            ) : items.length ? (
              items.map((item) => (
                <tr key={item.milestone_id} className="border-b border-bm-border/40 last:border-b-0">
                  <td className="py-4 pr-4">
                    <Link href={item.href} className="font-medium text-bm-text hover:underline">
                      {item.project_name}
                    </Link>
                  </td>
                  <td className="py-4 pr-4">
                    <div>{item.milestone_name}</div>
                    <div className="mt-1 text-xs text-bm-muted2">{item.status.replace(/_/g, " ")}</div>
                  </td>
                  <td className="py-4 pr-4 font-medium">{formatDate(item.date)}</td>
                  <td className="py-4">{item.owner || "Unassigned"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-5 text-bm-muted2">
                  No milestones due in the current lookahead window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FinancialHealthPanel({ health }: { health: PdsPortfolioHealth["financial_health"] | null }) {
  const metrics = [
    { label: "Approved Budget", value: formatMoney(health?.approved_budget) },
    { label: "Committed", value: formatMoney(health?.committed) },
    { label: "Spent", value: formatMoney(health?.spent) },
    { label: "EAC Forecast", value: formatMoney(health?.eac_forecast) },
    { label: "Variance", value: formatMoney(health?.variance) },
    { label: "Upcoming Spend (30d)", value: formatMoney(health?.upcoming_spend_30d) },
    { label: "Pending CO Exposure", value: formatMoney(health?.pending_change_order_value) },
  ];

  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-financial-health">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Cost Controls</p>
          <h3 className="text-lg font-semibold">Financial Health</h3>
        </div>
        <p className="text-sm text-bm-muted2">Portfolio-wide exposure across budget, spend, and forecast.</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-bm-border/50 bg-bm-surface/20 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{metric.label}</p>
            <p className="mt-2 text-xl font-semibold">{metric.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UserActionQueuePanel({
  items,
  loading,
}: {
  items: PdsPortfolioHealth["user_action_queue"];
  loading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-user-action-queue">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Workflow</p>
          <h3 className="text-lg font-semibold">Personal Action Queue</h3>
        </div>
        <p className="text-sm text-bm-muted2">Approvals and follow-up items that need attention.</p>
      </div>
      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-bm-muted2">Loading action queue...</p>
        ) : items.length ? (
          items.map((item, index) => (
            <div key={`${item.project_id}-${index}`} className="rounded-xl border border-bm-border/50 bg-bm-surface/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{item.title}</div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${priorityTone(item.priority)}`}>
                  {item.priority}
                </span>
              </div>
              <div className="mt-1 text-sm text-bm-muted2">{item.project_name}</div>
              {item.why_it_matters ? <div className="mt-2 text-xs text-bm-muted2">{item.why_it_matters}</div> : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-bm-muted2">
                  {item.due_date ? `Due ${formatDate(item.due_date)}` : "No due date"}
                </span>
                <Link href={item.href} className="text-xs font-medium text-bm-accent hover:underline">
                  Open
                </Link>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-bm-muted2">No approvals or follow-ups are queued right now.</p>
        )}
      </div>
    </section>
  );
}

export default function PdsHomePage() {
  const { envId, businessId } = useDomainEnv();
  const [period, setPeriod] = useState(currentPeriod());
  const [health, setHealth] = useState<PdsPortfolioHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await getPdsPortfolioHealth(envId, period, businessId || undefined);
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load construction mission control");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [businessId, envId, period]);

  async function onRunSnapshot() {
    setStatus("Running snapshot...");
    setError(null);
    try {
      const run = await runPdsSnapshot({ env_id: envId, business_id: businessId || undefined, period });
      setStatus(`Snapshot complete · run ${run.run_id}`);
      await refresh();
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Snapshot failed");
    }
  }

  async function onRunReportPack() {
    setStatus("Assembling report pack...");
    setError(null);
    try {
      const run = await runPdsReportPack({ env_id: envId, business_id: businessId || undefined, period });
      setStatus(`Report run complete · ${run.run_id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Report pack failed");
    }
  }

  return (
    <section className="space-y-6" data-testid="pds-command-center">
      <div className="rounded-3xl border border-bm-border/70 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_38%),radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_34%)] bg-bm-surface/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">PDS Delivery</p>
            <h2 className="mt-2 text-3xl font-semibold">Construction Mission Control</h2>
            <p className="mt-2 text-sm text-bm-muted2">
              In one screen: which projects need intervention, what is slipping, and what approvals are waiting.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-bm-border bg-bm-surface px-2.5 py-2 text-sm"
              aria-label="period"
            />
            <button
              type="button"
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
              onClick={() => void onRunSnapshot()}
            >
              Run Snapshot
            </button>
            <button
              type="button"
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
              onClick={() => void onRunReportPack()}
            >
              Run Report Pack
            </button>
          </div>
        </div>
      </div>

      <PortfolioStatusSummary summary={health?.summary ?? null} />

      <ProjectsRequiringAttentionTable items={health?.projects_requiring_attention ?? []} loading={loading} />

      <UpcomingMilestonesPanel items={health?.upcoming_milestones ?? []} loading={loading} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <FinancialHealthPanel health={health?.financial_health ?? null} />
        <UserActionQueuePanel items={health?.user_action_queue ?? []} loading={loading} />
      </div>

      {status ? <p className="text-xs text-bm-muted2">{status}</p> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </section>
  );
}

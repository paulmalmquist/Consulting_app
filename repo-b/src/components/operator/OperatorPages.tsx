"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  FileText,
  Upload,
} from "lucide-react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { useWinstonCompanion } from "@/components/winston-companion/WinstonCompanionProvider";
import { WorkspaceContextLoader } from "@/components/ui/WinstonLoader";
import { publishAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import {
  completeUpload,
  computeSha256,
  getOperatorCommandCenter,
  getOperatorProjectDetail,
  initExtraction,
  initUpload,
  listDocuments,
  listOperatorCloseTasks,
  listOperatorProjects,
  listOperatorVendors,
  runExtraction,
  type DocumentItem,
  type ExtractionDetail,
  type OperatorCloseTaskRow,
  type OperatorCommandCenter,
  type OperatorProjectDetail,
  type OperatorProjectRow,
  type OperatorVendorRow,
} from "@/lib/bos-api";
import { fmtDate, fmtMoney, fmtNumber, fmtPctDirect, fmtText } from "@/lib/format-utils";

function toneClasses(value: string) {
  const key = value.toLowerCase();
  if (["critical", "danger", "high", "blocked", "late", "at_risk"].includes(key)) {
    return "bg-red-500/12 text-red-200 border-red-500/30";
  }
  if (["watch", "warning", "medium", "in_progress"].includes(key)) {
    return "bg-amber-500/12 text-amber-100 border-amber-500/30";
  }
  if (["healthy", "positive", "low", "on_track", "completed"].includes(key)) {
    return "bg-emerald-500/12 text-emerald-100 border-emerald-500/30";
  }
  return "bg-white/5 text-bm-muted2 border-white/10";
}

function OperatorErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5">
      <h2 className="text-lg font-semibold text-bm-text">{title}</h2>
      <p className="mt-2 text-sm text-red-200">{detail}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full border border-red-400/30 px-4 py-2 text-sm text-red-100 hover:bg-red-500/10"
      >
        Retry
      </button>
    </div>
  );
}

function SectionCard({
  id,
  title,
  eyebrow,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-5 ${className}`}>
      {eyebrow ? <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">{eyebrow}</p> : null}
      <h2 className="mt-1 text-lg font-semibold text-bm-text">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MetricStrip({ metrics }: { metrics: OperatorCommandCenter["metrics_strip"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.key} className="rounded-3xl border border-bm-border/70 bg-bm-surface/25 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">{metric.label}</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold text-bm-text">
              {metric.unit === "usd"
                ? fmtMoney(metric.value as number)
                : metric.unit === "pct"
                  ? fmtPctDirect(metric.value as number)
                  : fmtText(metric.value)}
            </p>
            {metric.trend_direction ? (
              <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(metric.tone || "neutral")}`}>
                {metric.trend_direction}
              </span>
            ) : null}
          </div>
          {metric.comparison_label ? (
            <p className="mt-2 text-sm text-bm-muted2">
              {metric.comparison_label}:{" "}
              {metric.unit === "usd"
                ? fmtMoney(metric.comparison_value as number)
                : metric.unit === "pct"
                  ? fmtPctDirect(metric.comparison_value as number)
                  : fmtText(metric.comparison_value)}
            </p>
          ) : null}
          {metric.driver_text ? <p className="mt-2 text-sm text-bm-muted2">{metric.driver_text}</p> : null}
        </div>
      ))}
    </div>
  );
}

function ComparisonMeter({
  budget,
  actual,
}: {
  budget: number;
  actual: number;
}) {
  const maxValue = Math.max(budget, actual, 1);
  const budgetWidth = `${(budget / maxValue) * 100}%`;
  const actualWidth = `${(actual / maxValue) * 100}%`;
  return (
    <div className="space-y-2">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-bm-muted2">
          <span>Budget</span>
          <span>{fmtMoney(budget)}</span>
        </div>
        <div className="h-2 rounded-full bg-white/5">
          <div className="h-2 rounded-full bg-white/30" style={{ width: budgetWidth }} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-bm-muted2">
          <span>Actual</span>
          <span>{fmtMoney(actual)}</span>
        </div>
        <div className="h-2 rounded-full bg-white/5">
          <div
            className={`h-2 rounded-full ${actual > budget ? "bg-red-300" : "bg-emerald-300"}`}
            style={{ width: actualWidth }}
          />
        </div>
      </div>
    </div>
  );
}

function OperatorWinstonPanel({
  headline,
  lines,
  prompts,
}: {
  headline: string;
  lines: string[];
  prompts: string[];
}) {
  const { openDrawer, setDraft, sendPrompt } = useWinstonCompanion();

  async function triggerPrompt(prompt: string) {
    openDrawer("contextual");
    setDraft("contextual", prompt);
    await sendPrompt("contextual", prompt);
  }

  return (
    <SectionCard id="winston" title="Winston" eyebrow="AI Panel" className="h-full">
      <div className="space-y-4">
        <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
          <p className="text-sm font-medium text-bm-text">{headline}</p>
          <div className="mt-3 space-y-2">
            {lines.slice(0, 3).map((line) => (
              <p key={line} className="text-sm text-bm-muted2">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void triggerPrompt(prompt)}
              className="flex w-full items-center justify-between rounded-2xl border border-bm-border/70 bg-bm-surface/25 px-4 py-3 text-left text-sm text-bm-text transition hover:bg-bm-surface/40"
            >
              <span>{prompt}</span>
              <ArrowRight size={15} className="text-bm-muted2" />
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function useCommandCenterData() {
  const { envId, businessId } = useDomainEnv();
  const [data, setData] = useState<OperatorCommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getOperatorCommandCenter(envId, businessId || undefined);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operator command center.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [envId, businessId]);

  return { data, loading, error, reload: load };
}

function renderExtractedJson(extractedJson: Record<string, unknown>) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(extractedJson).map(([key, value]) => (
        <div key={key} className="rounded-2xl border border-bm-border/60 bg-black/20 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">{key.replaceAll("_", " ")}</p>
          <p className="mt-1 text-sm text-bm-text">
            {Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? String(value) : fmtText(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function EntityPerformanceTable({ rows }: { rows: OperatorCommandCenter["entity_performance"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-bm-border/50 text-left text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
            <th className="px-3 py-2 font-medium">Entity</th>
            <th className="px-3 py-2 font-medium">Revenue</th>
            <th className="px-3 py-2 font-medium">Margin</th>
            <th className="px-3 py-2 font-medium">Trend</th>
            <th className="px-3 py-2 font-medium">Cash</th>
            <th className="px-3 py-2 font-medium">Flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bm-border/40">
          {rows.map((row) => (
            <tr key={row.entity_id}>
              <td className="px-3 py-3">
                <div className="font-medium text-bm-text">{row.entity_name}</div>
                <div className="text-xs text-bm-muted2">{row.industry}</div>
              </td>
              <td className="px-3 py-3 text-bm-text">{fmtMoney(row.revenue)}</td>
              <td className="px-3 py-3">
                <div className="text-bm-text">{fmtPctDirect(row.margin_pct)}</div>
                {row.margin_delta_pct != null ? (
                  <div className="text-xs text-bm-muted2">
                    {row.margin_delta_pct > 0 ? "+" : ""}
                    {fmtPctDirect(row.margin_delta_pct)}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(row.status)}`}>
                  {row.trend}
                </span>
              </td>
              <td className="px-3 py-3 text-bm-text">{fmtMoney(row.cash)}</td>
              <td className="px-3 py-3 text-bm-muted2">{row.flag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OperatorExecutivePage() {
  const pathname = usePathname();
  const { data, loading, error, reload } = useCommandCenterData();

  useEffect(() => {
    if (!data) return;
    publishAssistantPageContext({
      route: pathname,
      surface: "operator_workspace",
      active_module: "operator",
      page_entity_type: "business",
      page_entity_id: data.business_id,
      page_entity_name: data.business_name,
      selected_entities: [
        {
          entity_type: "business",
          entity_id: data.business_id,
          name: data.business_name,
          source: "page",
        },
      ],
      visible_data: {
        metrics: {
          revenue: data.metrics_strip[0]?.value as number,
          weighted_margin_pct: data.metrics_strip[1]?.value as number,
          cash: data.metrics_strip[2]?.value as number,
          at_risk_projects: data.metrics_strip[3]?.value as number,
        },
        notes: data.assistant_focus.summary_lines,
        operator_command_center: data,
      },
    });
  }, [data, pathname]);

  if (loading) return <WorkspaceContextLoader label="Loading executive operator view" />;
  if (error || !data) {
    return <OperatorErrorState title="Executive view unavailable" detail={error || "No data returned."} onRetry={() => void reload()} />;
  }

  return (
    <div className="space-y-4">
      <section id="overview" className="space-y-4">
        <MetricStrip metrics={data.metrics_strip} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <SectionCard id="entity-performance" title="Entity Performance" eyebrow="Cross-Entity View">
          <EntityPerformanceTable rows={data.entity_performance} />
        </SectionCard>

        <div className="space-y-4">
          <SectionCard id="project-risk" title="Project Risk" eyebrow="Red Panel">
            <div className="space-y-3">
              {data.at_risk_projects.map((project) => (
                <Link
                  key={project.project_id}
                  href={project.href || "#"}
                  className="block rounded-2xl border border-bm-border/70 bg-black/20 p-4 transition hover:bg-black/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-bm-text">{project.name}</p>
                      <p className="mt-1 text-sm text-bm-muted2">{project.entity_name}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(project.risk_level)}`}>
                      {project.risk_level}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-bm-muted2">{project.summary}</p>
                  <div className="mt-3 flex items-center justify-between text-sm text-bm-text">
                    <span>Variance {fmtMoney(project.variance)}</span>
                    <span>Risk {fmtNumber(project.risk_score)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>

          <OperatorWinstonPanel
            headline={data.assistant_focus.headline}
            lines={data.assistant_focus.summary_lines}
            prompts={data.assistant_focus.prompt_suggestions}
          />
        </div>
      </div>
    </div>
  );
}

export function OperatorFinancePage() {
  const { data, loading, error, reload } = useCommandCenterData();

  const consolidatedRevenue = data?.metrics_strip[0]?.value as number | undefined;
  const weightedMargin = data?.metrics_strip[1]?.value as number | undefined;
  const cash = data?.metrics_strip[2]?.value as number | undefined;

  if (loading) return <WorkspaceContextLoader label="Loading finance rollup" />;
  if (error || !data) {
    return <OperatorErrorState title="Finance view unavailable" detail={error || "No data returned."} onRetry={() => void reload()} />;
  }

  return (
    <div className="space-y-4">
      <SectionCard id="overview" title="Finance Overview" eyebrow="Consolidated">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Revenue</p>
            <p className="mt-2 text-2xl font-semibold text-bm-text">{fmtMoney(consolidatedRevenue)}</p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Weighted Margin</p>
            <p className="mt-2 text-2xl font-semibold text-bm-text">{fmtPctDirect(weightedMargin)}</p>
            <p className="mt-2 text-sm text-bm-muted2">Weighted margin is based on consolidated revenue and expense, not average entity margin.</p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Cash</p>
            <p className="mt-2 text-2xl font-semibold text-bm-text">{fmtMoney(cash)}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard id="entity-performance" title="Entity Performance" eyebrow="Operating Companies">
        <EntityPerformanceTable rows={data.entity_performance} />
      </SectionCard>

      <SectionCard id="consolidation" title="Consolidation" eyebrow="Rollup">
        <div className="grid gap-3 md:grid-cols-2">
          {data.entity_performance.map((row) => (
            <div key={row.entity_id} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-bm-text">{row.entity_name}</p>
                <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(row.status)}`}>
                  {row.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-bm-muted2">Revenue</p>
                  <p className="mt-1 text-bm-text">{fmtMoney(row.revenue)}</p>
                </div>
                <div>
                  <p className="text-bm-muted2">Expenses</p>
                  <p className="mt-1 text-bm-text">{fmtMoney(row.expenses)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard id="variance" title="Variance vs Plan" eyebrow="Management Questions">
        <div className="space-y-3">
          {data.entity_performance.map((row) => (
            <div key={`${row.entity_id}-variance`} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-bm-text">{row.entity_name}</p>
                  <p className="text-sm text-bm-muted2">{row.top_driver}</p>
                </div>
                <p className={`text-sm font-medium ${(row.revenue_variance || 0) < 0 ? "text-red-200" : "text-emerald-200"}`}>
                  {row.revenue_variance && row.revenue_variance > 0 ? "+" : ""}
                  {fmtMoney(row.revenue_variance)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard id="close-tracker" title="Close Tracker" eyebrow="Cross-Entity Workflow">
        <div className="space-y-3">
          {data.close_tasks.map((task) => (
            <div key={task.task_id} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-bm-text">{task.title}</p>
                  <p className="text-sm text-bm-muted2">
                    {task.entity_name} · {task.owner}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(task.status)}`}>
                  {task.status}
                </span>
              </div>
              {task.blocker_reason ? <p className="mt-3 text-sm text-bm-muted2">{task.blocker_reason}</p> : null}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function OperatorProjectsPage() {
  const { envId, businessId } = useDomainEnv();
  const [projects, setProjects] = useState<OperatorProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await listOperatorProjects(envId, businessId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [envId, businessId]);

  const redProjects = useMemo(() => projects.filter((project) => project.risk_level === "high"), [projects]);

  if (loading) return <WorkspaceContextLoader label="Loading projects" />;
  if (error) return <OperatorErrorState title="Project tracker unavailable" detail={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <SectionCard id="project-tracker" title="Cross-Entity Project Tracker" eyebrow="Execution Surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 text-left text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Budget</th>
                <th className="px-3 py-2 font-medium">Actual</th>
                <th className="px-3 py-2 font-medium">Variance</th>
                <th className="px-3 py-2 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {projects.map((project) => (
                <tr key={project.project_id}>
                  <td className="px-3 py-3">
                    <Link href={project.href || "#"} className="font-medium text-bm-text hover:underline">
                      {project.name}
                    </Link>
                    <p className="mt-1 text-xs text-bm-muted2">{project.summary}</p>
                  </td>
                  <td className="px-3 py-3 text-bm-text">{project.entity_name}</td>
                  <td className="px-3 py-3 text-bm-text">{fmtMoney(project.budget)}</td>
                  <td className="px-3 py-3 text-bm-text">{fmtMoney(project.actual_cost)}</td>
                  <td className={`px-3 py-3 ${project.variance < 0 ? "text-red-200" : "text-emerald-200"}`}>{fmtMoney(project.variance)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(project.risk_level)}`}>
                      {project.risk_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard id="red-projects" title="Red Projects" eyebrow="What Needs Intervention">
        <div className="grid gap-3 lg:grid-cols-2">
          {redProjects.map((project) => (
            <Link
              key={`${project.project_id}-red`}
              href={project.href || "#"}
              className="rounded-2xl border border-bm-border/60 bg-black/20 p-4 transition hover:bg-black/30"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-bm-text">{project.name}</p>
                <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(project.risk_level)}`}>
                  {project.risk_level}
                </span>
              </div>
              <p className="mt-2 text-sm text-bm-muted2">{project.entity_name}</p>
              <p className="mt-3 text-sm text-bm-muted2">{project.summary}</p>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function OperatorProjectDetailPage({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const { envId, businessId } = useDomainEnv();
  const [detail, setDetail] = useState<OperatorProjectDetail | null>(null);
  const [commandCenter, setCommandCenter] = useState<OperatorCommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectDetail, center] = await Promise.all([
        getOperatorProjectDetail(projectId, envId, businessId || undefined),
        getOperatorCommandCenter(envId, businessId || undefined),
      ]);
      setDetail(projectDetail);
      setCommandCenter(center);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId, envId, businessId]);

  useEffect(() => {
    if (!detail || !commandCenter) return;
    publishAssistantPageContext({
      route: pathname,
      surface: "operator_project_detail",
      active_module: "operator",
      page_entity_type: "project",
      page_entity_id: detail.project_id,
      page_entity_name: detail.name,
      selected_entities: [
        {
          entity_type: "business",
          entity_id: commandCenter.business_id,
          name: commandCenter.business_name,
          source: "page",
        },
        {
          entity_type: "project",
          entity_id: detail.project_id,
          name: detail.name,
          source: "page",
          metadata: { entity_name: detail.entity_name, risk_level: detail.risk_level },
        },
      ],
      visible_data: {
        metrics: {
          budget: detail.budget,
          actual_cost: detail.actual_cost,
          variance: detail.variance,
          risk_score: detail.risk_score,
        },
        notes: [...detail.root_causes, ...detail.recommended_actions],
        project_detail: detail,
        operator_command_center: commandCenter,
      },
    });
  }, [detail, commandCenter, pathname]);

  if (loading) return <WorkspaceContextLoader label="Loading project detail" />;
  if (error || !detail || !commandCenter) {
    return <OperatorErrorState title="Project detail unavailable" detail={error || "No data returned."} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <SectionCard title={detail.name} eyebrow={detail.entity_name}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-4">
            <p className="max-w-3xl text-sm text-bm-muted2">{detail.summary}</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Budget</p>
                <p className="mt-2 text-xl font-semibold text-bm-text">{fmtMoney(detail.budget)}</p>
              </div>
              <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Actual</p>
                <p className="mt-2 text-xl font-semibold text-bm-text">{fmtMoney(detail.actual_cost)}</p>
              </div>
              <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Variance</p>
                <p className={`mt-2 text-xl font-semibold ${detail.variance < 0 ? "text-red-200" : "text-emerald-200"}`}>
                  {fmtMoney(detail.variance)}
                </p>
              </div>
              <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Risk</p>
                <div className="mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-medium text-bm-text">
                  {detail.risk_score} · {detail.risk_level}
                </div>
              </div>
            </div>
          </div>

          <OperatorWinstonPanel
            headline={commandCenter.assistant_focus.headline}
            lines={[detail.summary || "", ...detail.root_causes].filter(Boolean)}
            prompts={[
              `Why is ${detail.name} over budget?`,
              `Where is ${detail.name} losing money?`,
              `What should I do next on ${detail.name}?`,
            ]}
          />
        </div>
      </SectionCard>

      <SectionCard id="budget-vs-actual" title="Budget vs Actual" eyebrow="Monthly View">
        <div className="grid gap-3 lg:grid-cols-3">
          {detail.budget_vs_actual.map((point) => (
            <div key={point.period} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <p className="text-sm font-medium text-bm-text">{point.period}</p>
              <div className="mt-3">
                <ComparisonMeter budget={point.budget} actual={point.actual} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard id="documents" title="Documents" eyebrow="Linked Context">
        <div className="grid gap-3 lg:grid-cols-2">
          {detail.documents.map((document) => (
            <div key={document.document_id} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-bm-text">{document.title}</p>
                  <p className="mt-1 text-sm text-bm-muted2">
                    {document.type} · {fmtDate(document.created_at)}
                  </p>
                </div>
                <FileText size={18} className="text-bm-muted2" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {document.risk_flags.map((flag) => (
                  <span key={`${document.document_id}-${flag}`} className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(flag)}`}>
                    {flag}
                  </span>
                ))}
              </div>
              {document.key_terms.length ? (
                <div className="mt-3 space-y-2">
                  {document.key_terms.map((term) => (
                    <p key={term} className="text-sm text-bm-muted2">
                      {term}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard id="tasks" title="Tasks" eyebrow="Workflow">
        <div className="space-y-3">
          {detail.tasks.length ? (
            detail.tasks.map((task) => (
              <div key={task.task_id} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-bm-text">{task.title}</p>
                    <p className="text-sm text-bm-muted2">
                      {task.owner} · due {fmtDate(task.due_date || undefined)}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(task.status)}`}>
                    {task.status}
                  </span>
                </div>
                {task.blocker_reason ? <p className="mt-3 text-sm text-bm-muted2">{task.blocker_reason}</p> : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-bm-muted2">No linked workflow tasks for this project.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard id="vendors" title="Vendor Breakdown" eyebrow="Cost Drivers">
        <div className="grid gap-3 lg:grid-cols-3">
          {detail.vendor_breakdown.map((vendor) => (
            <div key={`${detail.project_id}-${vendor.vendor_id}`} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-bm-text">{vendor.vendor_name}</p>
                {vendor.status ? (
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(vendor.status)}`}>
                    {vendor.status}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-xl font-semibold text-bm-text">{fmtMoney(vendor.amount)}</p>
              {vendor.share_pct != null ? <p className="mt-1 text-sm text-bm-muted2">{fmtPctDirect(vendor.share_pct)} of project spend</p> : null}
              {vendor.note ? <p className="mt-3 text-sm text-bm-muted2">{vendor.note}</p> : null}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function OperatorDocumentsPage() {
  const { envId, businessId } = useDomainEnv();
  const [commandCenter, setCommandCenter] = useState<OperatorCommandCenter | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<DocumentItem[]>([]);
  const [latestExtraction, setLatestExtraction] = useState<ExtractionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const [center, docs] = await Promise.all([
        getOperatorCommandCenter(envId, businessId),
        listDocuments(businessId, undefined, { env_id: envId }),
      ]);
      setCommandCenter(center);
      setUploadedDocs(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operator documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [envId, businessId]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !businessId) return;

    setUploadError(null);
    setLatestExtraction(null);
    setSelectedFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Upload a PDF contract or invoice so the existing extraction pipeline can parse it.");
      return;
    }

    setUploading(true);
    try {
      const init = await initUpload({
        business_id: businessId,
        filename: file.name,
        content_type: file.type || "application/pdf",
        title: file.name.replace(/\.[^.]+$/, ""),
        virtual_path: `operator/env/${envId}/${file.name}`,
        env_id: envId,
      });

      const putRes = await fetch(init.signed_upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }

      const sha256 = await computeSha256(file);
      await completeUpload({
        document_id: init.document_id,
        version_id: init.version_id,
        sha256,
        byte_size: file.size,
        env_id: envId,
      });

      const extractedDocument = await initExtraction({
        document_id: init.document_id,
        version_id: init.version_id,
        extraction_profile: "operator_contract",
      });
      const detail = await runExtraction({ extracted_document_id: extractedDocument.id });
      setLatestExtraction(detail);
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload and extract document.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  if (loading) return <WorkspaceContextLoader label="Loading document intelligence" />;
  if (error || !commandCenter) {
    return <OperatorErrorState title="Document intelligence unavailable" detail={error || "No data returned."} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <SectionCard id="intelligence" title="Document Intelligence" eyebrow="Executive Signal">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-3">
            <p className="text-sm text-bm-muted2">
              Upload contracts and invoices, extract structured terms, and link them back to the operator story.
            </p>
            <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <p className="font-medium text-bm-text">Seeded demo moment</p>
              <p className="mt-2 text-sm text-bm-muted2">
                The Apex Electrical agreement requires a $250K mobilization payment within 30 days and contains an auto-renewal clause plus a late-payment penalty.
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/25 p-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Upload + Extract</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-bm-border/70 bg-black/20 px-4 py-8 text-center">
              <Upload size={20} className="text-bm-muted2" />
              <p className="mt-3 text-sm font-medium text-bm-text">{uploading ? "Extracting document..." : "Upload PDF contract or invoice"}</p>
              <p className="mt-1 text-xs text-bm-muted2">{selectedFileName || "Runs through /api/documents and /api/extract."}</p>
              <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={uploading} onChange={handleFileChange} />
            </label>
            {uploadError ? <p className="mt-3 text-sm text-red-200">{uploadError}</p> : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard id="seeded-docs" title="Seeded Documents" eyebrow="Grounded Demo Data">
        <div className="grid gap-3 xl:grid-cols-2">
          {commandCenter.top_documents.map((document) => (
            <div key={document.document_id} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-bm-text">{document.title}</p>
                  <p className="mt-1 text-sm text-bm-muted2">
                    {document.entity_name}
                    {document.project_name ? ` · ${document.project_name}` : ""}
                  </p>
                </div>
                <FileText size={18} className="text-bm-muted2" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {document.risk_flags.map((flag) => (
                  <span key={`${document.document_id}-${flag}`} className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(flag)}`}>
                    {flag}
                  </span>
                ))}
              </div>
              <div className="mt-4">{renderExtractedJson(document.extracted_json)}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard id="upload" title="Uploaded Documents" eyebrow="Live Pipeline">
        {latestExtraction ? (
          <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-bm-text">
              <ClipboardList size={18} />
              <p className="font-medium">Most Recent Extraction</p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {latestExtraction.fields.map((field) => (
                <div key={field.id} className="rounded-2xl border border-bm-border/60 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">{field.field_key}</p>
                  <p className="mt-1 text-sm text-bm-text">
                    {Array.isArray(field.field_value_json)
                      ? field.field_value_json.join(", ")
                      : fmtText(field.field_value_json)}
                  </p>
                  {field.evidence_json?.snippet ? (
                    <p className="mt-2 text-xs text-bm-muted2">
                      p.{field.evidence_json.page}: {field.evidence_json.snippet}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-bm-muted2">Uploaded operator documents for this environment will appear here after extraction runs.</p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 text-left text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {uploadedDocs.length ? (
                uploadedDocs.map((document) => (
                  <tr key={document.document_id}>
                    <td className="px-3 py-3 text-bm-text">{document.title}</td>
                    <td className="px-3 py-3 text-bm-muted2">{document.status}</td>
                    <td className="px-3 py-3 text-bm-muted2">{document.latest_version_number ?? "—"}</td>
                    <td className="px-3 py-3 text-bm-muted2">{fmtDate(document.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-bm-muted2" colSpan={4}>
                    No uploaded documents yet for this environment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

export function OperatorVendorsPage() {
  const { envId, businessId } = useDomainEnv();
  const [vendors, setVendors] = useState<OperatorVendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setVendors(await listOperatorVendors(envId, businessId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vendors.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [envId, businessId]);

  const duplicated = useMemo(() => vendors.filter((vendor) => vendor.duplication_flag), [vendors]);
  const spendTotal = useMemo(() => vendors.reduce((sum, vendor) => sum + vendor.spend_ytd, 0), [vendors]);

  if (loading) return <WorkspaceContextLoader label="Loading vendor control view" />;
  if (error) return <OperatorErrorState title="Vendor view unavailable" detail={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <SectionCard id="spend-aggregation" title="Spend Aggregation" eyebrow="Cross-Entity Control">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Vendor Spend YTD</p>
            <p className="mt-2 text-2xl font-semibold text-bm-text">{fmtMoney(spendTotal)}</p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Duplicated Vendors</p>
            <p className="mt-2 text-2xl font-semibold text-bm-text">{fmtNumber(duplicated.length)}</p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Immediate Focus</p>
            <p className="mt-2 text-sm text-bm-text">Apex Electrical and Prime Staffing should be consolidated or renegotiated first.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard id="duplication" title="Duplication Detection" eyebrow="Where Contracts Overlap">
        <div className="grid gap-3 lg:grid-cols-3">
          {duplicated.map((vendor) => (
            <div key={`${vendor.vendor_id}-duplicate`} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-bm-text">{vendor.name}</p>
                  <p className="mt-1 text-sm text-bm-muted2">{vendor.entities.join(" · ")}</p>
                </div>
                <AlertTriangle size={18} className="text-amber-200" />
              </div>
              <p className="mt-3 text-xl font-semibold text-bm-text">{fmtMoney(vendor.spend_ytd)}</p>
              <p className="mt-1 text-sm text-bm-muted2">{vendor.notes}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard id="consolidation" title="Vendor Table" eyebrow="Spend + Contract Coverage">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 text-left text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">Entities</th>
                <th className="px-3 py-2 font-medium">Spend YTD</th>
                <th className="px-3 py-2 font-medium">Contract</th>
                <th className="px-3 py-2 font-medium">Overspend</th>
                <th className="px-3 py-2 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {vendors.map((vendor) => (
                <tr key={vendor.vendor_id}>
                  <td className="px-3 py-3">
                    <p className="font-medium text-bm-text">{vendor.name}</p>
                    <p className="text-xs text-bm-muted2">{vendor.category}</p>
                  </td>
                  <td className="px-3 py-3 text-bm-muted2">{vendor.entities.join(", ")}</td>
                  <td className="px-3 py-3 text-bm-text">{fmtMoney(vendor.spend_ytd)}</td>
                  <td className="px-3 py-3 text-bm-text">{fmtMoney(vendor.contract_value)}</td>
                  <td className={`px-3 py-3 ${(vendor.overspend_amount || 0) > 0 ? "text-red-200" : "text-bm-muted2"}`}>
                    {fmtMoney(vendor.overspend_amount)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(vendor.risk_flag || "")}`}>
                      {vendor.risk_flag || "stable"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

export function OperatorClosePage() {
  const { envId, businessId } = useDomainEnv();
  const [tasks, setTasks] = useState<OperatorCloseTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await listOperatorCloseTasks(envId, businessId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load close tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [envId, businessId]);

  const blockers = useMemo(() => tasks.filter((task) => task.status === "blocked" || task.status === "late"), [tasks]);

  if (loading) return <WorkspaceContextLoader label="Loading close tracker" />;
  if (error) return <OperatorErrorState title="Close tracker unavailable" detail={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <SectionCard id="close-tasks" title="Close Tasks Across Entities" eyebrow="Workflow Management">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 text-left text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
                <th className="px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {tasks.map((task) => (
                <tr key={task.task_id}>
                  <td className="px-3 py-3">
                    <p className="font-medium text-bm-text">{task.title}</p>
                    {task.blocker_reason ? <p className="mt-1 text-xs text-bm-muted2">{task.blocker_reason}</p> : null}
                  </td>
                  <td className="px-3 py-3 text-bm-text">{task.owner}</td>
                  <td className="px-3 py-3 text-bm-text">{task.entity_name}</td>
                  <td className="px-3 py-3 text-bm-muted2">{fmtDate(task.due_date || undefined)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(task.status)}`}>
                      {task.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard id="blockers" title="Blockers + Late Flags" eyebrow="What Is Holding Close">
        <div className="space-y-3">
          {blockers.map((task) => (
            <div key={`${task.task_id}-blocker`} className="rounded-2xl border border-bm-border/60 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-bm-text">{task.title}</p>
                  <p className="text-sm text-bm-muted2">
                    {task.entity_name} · {task.owner}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses(task.status)}`}>
                  {task.status}
                </span>
              </div>
              {task.blocker_reason ? <p className="mt-3 text-sm text-bm-muted2">{task.blocker_reason}</p> : null}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

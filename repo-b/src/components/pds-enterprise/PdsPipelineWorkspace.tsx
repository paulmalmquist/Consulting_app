"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight, CalendarClock, CircleDollarSign, Clock3, Plus } from "lucide-react";

import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { cn } from "@/lib/cn";
import {
  createPdsPipelineDeal,
  getPdsPipeline,
  getPdsPipelineDeal,
  getPdsPipelineLookups,
  updatePdsPipelineDeal,
  type PdsV2PipelineAttentionItem,
  type PdsV2PipelineDeal,
  type PdsV2PipelineDealDetail,
  type PdsV2PipelineLookups,
  type PdsV2PipelineMetric,
  type PdsV2PipelineStage,
  type PdsV2PipelineSummary,
  type PdsV2PipelineTimelinePoint,
} from "@/lib/bos-api";
import { formatCurrency, formatDate, formatPercentRaw } from "@/components/pds-enterprise/pdsEnterprise";

const BOARD_STAGES = ["prospect", "pursuit", "negotiation", "won", "converted"] as const;
const EMPTY_DRAFT = {
  deal_name: "",
  account_id: "",
  stage: "prospect",
  deal_value: "0",
  probability_pct: "20",
  expected_close_date: "",
  owner_name: "",
  notes: "",
  lost_reason: "",
};

function toneClasses(tone: "neutral" | "positive" | "warn" | "danger") {
  if (tone === "positive") return "border-pds-signalGreen/25 bg-pds-signalGreen/8";
  if (tone === "warn") return "border-pds-signalOrange/25 bg-pds-signalOrange/8";
  if (tone === "danger") return "border-pds-signalRed/25 bg-pds-signalRed/8";
  return "border-bm-border/70 bg-bm-surface/20";
}

function stageLabel(stage: string) {
  return {
    prospect: "Prospect",
    pursuit: "Pursuit",
    negotiation: "Negotiation",
    won: "Won",
    converted: "Converted",
    lost: "Lost",
  }[stage] || stage;
}

function stageTone(stage: string) {
  if (stage === "won" || stage === "converted") return "border-pds-signalGreen/30 bg-pds-signalGreen/10";
  if (stage === "lost") return "border-pds-signalRed/30 bg-pds-signalRed/10";
  return "border-pds-signalOrange/20 bg-bm-surface/25";
}

function metricDisplay(metric: PdsV2PipelineMetric) {
  if (metric.key === "win_rate") {
    return metric.value == null ? "—" : formatPercentRaw(metric.value, 0);
  }
  if (metric.key === "active_deals") {
    return String(metric.value ?? 0);
  }
  return formatCurrency(metric.value ?? 0);
}

function metricDelta(metric: PdsV2PipelineMetric) {
  if (metric.delta_value == null) return null;
  const delta = Number(metric.delta_value || 0);
  if (metric.key === "active_deals") {
    const prefix = delta > 0 ? "+" : "";
    return `${prefix}${delta}`;
  }
  return `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`;
}

function formatShortMonth(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(parsed);
}

function describeAttention(type: string) {
  if (type === "overdue_close") return { title: "Overdue Close", icon: AlertTriangle };
  if (type === "stalled") return { title: "Stalled", icon: Clock3 };
  if (type === "low_probability_high_value") return { title: "High Value / Low Prob", icon: CircleDollarSign };
  return { title: "Closing Soon", icon: CalendarClock };
}

function DraggableDealCard({
  deal,
  onOpen,
}: {
  deal: PdsV2PipelineDeal;
  onOpen: (dealId: string) => void;
}) {
  const dragId = `deal:${deal.deal_id}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen(deal.deal_id)}
      {...attributes}
      {...listeners}
      className={cn(
        "w-full rounded-2xl border p-3 text-left transition hover:-translate-y-[1px] hover:border-bm-accent/45",
        stageTone(deal.stage),
        isDragging && "opacity-40"
      )}
      data-testid={`pds-pipeline-card-${deal.deal_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-bm-text">{deal.deal_name}</div>
          <div className="mt-1 text-xs text-bm-muted2">{deal.account_name || "No account linked"}</div>
        </div>
        <span className="rounded-full border border-bm-border/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          {stageLabel(deal.stage)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-bm-muted2">
        <span>{formatCurrency(deal.deal_value)}</span>
        <span>{formatPercentRaw(deal.probability_pct, 0)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-bm-muted2">
        <span>{deal.owner_name || "No owner"}</span>
        <span>{deal.expected_close_date ? formatDate(deal.expected_close_date) : "No close date"}</span>
      </div>
      {deal.attention_reasons.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {deal.attention_reasons.slice(0, 2).map((reason) => (
            <span
              key={reason}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
                reason === "overdue_close" || reason === "stalled"
                  ? "bg-pds-signalRed/15 text-pds-signalRed"
                  : "bg-pds-signalOrange/15 text-pds-signalOrange"
              )}
            >
              {reason.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function StageColumn({
  stage,
  summary,
  deals,
  onOpen,
}: {
  stage: string;
  summary?: PdsV2PipelineStage;
  deals: PdsV2PipelineDeal[];
  onOpen: (dealId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage}` });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-[320px] min-w-[280px] flex-col rounded-[26px] border p-4",
        stageTone(stage),
        isOver && "border-bm-accent/50 shadow-[0_0_0_1px_hsl(var(--bm-accent)/0.18)]"
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-bm-border/50 pb-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">{summary?.label || stageLabel(stage)}</p>
          <h3 className="mt-1 text-lg font-semibold">{summary?.count ?? deals.length}</h3>
        </div>
        <div className="text-right text-xs text-bm-muted2">
          <div>{formatCurrency(summary?.unweighted_value ?? 0)}</div>
          <div className="mt-1">{summary?.avg_days_in_stage ? `${Math.round(Number(summary.avg_days_in_stage))}d avg` : "New stage"}</div>
        </div>
      </div>
      <div className="mt-4 flex-1 space-y-3">
        {deals.length > 0 ? (
          deals.map((deal) => <DraggableDealCard key={deal.deal_id} deal={deal} onOpen={onOpen} />)
        ) : (
          <div className="flex h-full min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-bm-border/60 bg-bm-surface/15 text-center text-xs text-bm-muted2">
            Drop a deal here
          </div>
        )}
      </div>
    </section>
  );
}

function TimelineChart({ points }: { points: PdsV2PipelineTimelinePoint[] }) {
  const chartData = points.map((point) => ({
    ...point,
    monthLabel: formatShortMonth(point.forecast_month),
  }));

  if (chartData.length === 0) {
    return <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/10 p-8 text-sm text-bm-muted2">No dated deals yet. Add expected close dates to see revenue timing.</div>;
  }

  return (
    <div className="h-72 w-full rounded-2xl border border-bm-border/60 bg-bm-surface/10 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
          <XAxis dataKey="monthLabel" axisLine={false} tickLine={false} tick={{ fill: "rgba(226,232,240,0.7)", fontSize: 12 }} />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "rgba(226,232,240,0.7)", fontSize: 12 }}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(11,16,21,0.96)",
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 16,
            }}
            formatter={(value: number, key) => [formatCurrency(value), key === "weighted_value" ? "Weighted" : "Unweighted"]}
            labelFormatter={(label) => `Close month: ${label}`}
          />
          <Bar dataKey="unweighted_value" fill="rgba(245, 158, 11, 0.45)" radius={[8, 8, 0, 0]} />
          <Bar dataKey="weighted_value" fill="rgba(34, 197, 94, 0.5)" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PdsPipelineWorkspace() {
  const { envId, businessId } = useDomainEnv();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [data, setData] = useState<PdsV2PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<PdsV2PipelineLookups | null>(null);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [detail, setDetail] = useState<PdsV2PipelineDealDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [saving, setSaving] = useState(false);
  const [movePendingId, setMovePendingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  async function loadPipeline() {
    setLoading(true);
    setError(null);
    try {
      const payload = await getPdsPipeline(envId, { business_id: businessId || undefined });
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPipeline();
  }, [envId, businessId]);

  async function ensureLookups() {
    if (lookups || lookupsLoading) return;
    setLookupsLoading(true);
    try {
      const payload = await getPdsPipelineLookups(envId, { business_id: businessId || undefined });
      setLookups(payload);
    } finally {
      setLookupsLoading(false);
    }
  }

  async function openCreateDrawer() {
    setDrawerMode("create");
    setDetail(null);
    setDraft(EMPTY_DRAFT);
    setDrawerOpen(true);
    await ensureLookups();
  }

  async function openDealDrawer(dealId: string) {
    setDrawerMode("edit");
    setDrawerOpen(true);
    setDetailLoading(true);
    await ensureLookups();
    try {
      const payload = await getPdsPipelineDeal(envId, dealId, { business_id: businessId || undefined });
      setDetail(payload);
      setDraft({
        deal_name: payload.deal.deal_name,
        account_id: payload.deal.account_id || "",
        stage: payload.deal.stage,
        deal_value: String(payload.deal.deal_value ?? 0),
        probability_pct: String(payload.deal.probability_pct ?? 0),
        expected_close_date: payload.deal.expected_close_date || "",
        owner_name: payload.deal.owner_name || "",
        notes: payload.deal.notes || "",
        lost_reason: payload.deal.lost_reason || "",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load deal detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSave() {
    if (!draft.deal_name.trim()) {
      setError("Deal name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (drawerMode === "create") {
        const created = await createPdsPipelineDeal({
          env_id: envId,
          business_id: businessId || undefined,
          deal_name: draft.deal_name.trim(),
          account_id: draft.account_id || null,
          stage: draft.stage,
          deal_value: Number(draft.deal_value || 0),
          probability_pct: Number(draft.probability_pct || 0),
          expected_close_date: draft.expected_close_date || null,
          owner_name: draft.owner_name.trim() || null,
          notes: draft.notes.trim() || null,
          lost_reason: draft.stage === "lost" ? draft.lost_reason.trim() || null : null,
        });
        setDetail(created);
      } else if (detail) {
        const updated = await updatePdsPipelineDeal(
          envId,
          detail.deal.deal_id,
          {
            deal_name: draft.deal_name.trim(),
            account_id: draft.account_id || null,
            stage: draft.stage,
            deal_value: Number(draft.deal_value || 0),
            probability_pct: Number(draft.probability_pct || 0),
            expected_close_date: draft.expected_close_date || null,
            owner_name: draft.owner_name.trim() || null,
            notes: draft.notes.trim() || null,
            lost_reason: draft.stage === "lost" ? draft.lost_reason.trim() || null : null,
          },
          { business_id: businessId || undefined }
        );
        setDetail(updated);
      }
      await loadPipeline();
      setDrawerOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save deal");
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveStage(event: DragEndEvent) {
    const activeId = String(event.active.id || "");
    const overId = String(event.over?.id || "");
    if (!activeId.startsWith("deal:") || !overId.startsWith("stage:")) return;
    const dealId = activeId.replace("deal:", "");
    const nextStage = overId.replace("stage:", "");
    const deal = data?.deals.find((item) => item.deal_id === dealId);
    if (!deal || deal.stage === nextStage) return;

    setMovePendingId(dealId);
    try {
      await updatePdsPipelineDeal(
        envId,
        dealId,
        { stage: nextStage, transition_note: `Moved to ${stageLabel(nextStage)}` },
        { business_id: businessId || undefined }
      );
      await loadPipeline();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Failed to move deal");
    } finally {
      setMovePendingId(null);
    }
  }

  const dealsByStage = useMemo(() => {
    const map: Record<string, PdsV2PipelineDeal[]> = {};
    for (const stage of BOARD_STAGES) {
      map[stage] = [];
    }
    for (const deal of data?.deals || []) {
      if (!map[deal.stage]) continue;
      map[deal.stage].push(deal);
    }
    return map;
  }, [data?.deals]);

  const stageMap = useMemo(() => {
    const map = new Map<string, PdsV2PipelineStage>();
    for (const stage of data?.stages || []) {
      map.set(stage.stage, stage);
    }
    return map;
  }, [data?.stages]);

  const attentionGroups = useMemo(() => {
    const groups = new Map<string, PdsV2PipelineAttentionItem[]>();
    for (const item of data?.attention_items || []) {
      groups.set(item.issue_type, [...(groups.get(item.issue_type) || []), item]);
    }
    return groups;
  }, [data?.attention_items]);

  const sortedDeals = useMemo(() => {
    return [...(data?.deals || [])].sort((a, b) => {
      if (a.attention_reasons.length !== b.attention_reasons.length) {
        return b.attention_reasons.length - a.attention_reasons.length;
      }
      return Number(b.deal_value) - Number(a.deal_value);
    });
  }, [data?.deals]);

  if (loading && !data) {
    return <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-6 text-sm text-bm-muted2">Loading pipeline...</div>;
  }

  if (error && !data) {
    return <div className="rounded-3xl border border-pds-signalRed/30 bg-pds-signalRed/10 p-6 text-sm text-pds-signalRed">{error}</div>;
  }

  if (!data) return null;

  return (
    <>
      <div className="space-y-5">
        <section className="rounded-[28px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-accent)/0.08),transparent_40%)] bg-bm-surface/[0.92] px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Portfolio</p>
              <h2 className="mt-1 text-2xl font-semibold text-bm-text">Pipeline</h2>
              <p className="mt-1 max-w-3xl text-sm text-bm-muted2">
                Turn the StonePDS pipeline into an operating surface: see what is coming in, what is likely to close, what is stuck, and what to push next.
              </p>
            </div>
            <Button type="button" onClick={() => void openCreateDrawer()} className="self-start lg:self-auto">
              <Plus size={16} />
              Create Deal
            </Button>
          </div>
        </section>

        {!data.has_deals ? (
          <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
            <article className="rounded-[28px] border border-bm-border/70 bg-bm-surface/20 p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Empty State</p>
              <h3 className="mt-2 text-2xl font-semibold">{data.empty_state_title || "No pipeline yet"}</h3>
              <p className="mt-2 max-w-2xl text-sm text-bm-muted2">
                {data.empty_state_body || "Create the first deal so this page can start surfacing close timing, stall risk, and weighted revenue."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {data.required_fields.map((field) => (
                  <span key={field} className="rounded-full border border-bm-border/70 px-3 py-1 text-xs text-bm-muted2">
                    {field}
                  </span>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button type="button" onClick={() => void openCreateDrawer()}>
                  Create First Deal
                  <ArrowRight size={16} />
                </Button>
                <Button type="button" variant="secondary" onClick={() => void ensureLookups()}>
                  Load Account Choices
                </Button>
              </div>
            </article>

            <article className="rounded-[28px] border border-bm-border/70 bg-bm-surface/15 p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Example Deal</p>
              <div className="mt-4 rounded-2xl border border-pds-signalOrange/25 bg-pds-signalOrange/8 p-4">
                <div className="text-sm font-semibold text-bm-text">
                  {String(data.example_deal?.deal_name || "Northwest Medical Campus Refresh")}
                </div>
                <div className="mt-1 text-xs text-bm-muted2">
                  {String(data.example_deal?.account_name || "Stone Strategic Accounts")}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-bm-muted2">
                  <span>{stageLabel(String(data.example_deal?.stage || "prospect"))}</span>
                  <span>{formatCurrency(Number(data.example_deal?.deal_value || 1200000))}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-bm-muted2">
                  <span>{formatPercentRaw(Number(data.example_deal?.probability_pct || 25), 0)}</span>
                  <span>{data.example_deal?.expected_close_date ? formatDate(String(data.example_deal.expected_close_date)) : "Target close in 45 days"}</span>
                </div>
                <div className="mt-2 text-xs text-bm-muted2">{String(data.example_deal?.owner_name || "Dana Park")}</div>
              </div>
            </article>
          </section>
        ) : (
          <>
            <section className="space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Action Layer</p>
                <h3 className="text-xl font-semibold">Deals Requiring Attention</h3>
              </div>
              <div className="grid gap-3 xl:grid-cols-4">
                {Array.from(attentionGroups.entries()).map(([issueType, items]) => {
                  const meta = describeAttention(issueType);
                  const Icon = meta.icon;
                  return (
                    <article key={issueType} className={cn("rounded-[26px] border p-4", items[0] ? toneClasses(items[0].tone) : toneClasses("neutral"))}>
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="text-bm-muted2" />
                        <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">{meta.title}</p>
                      </div>
                      <div className="mt-3 space-y-3">
                        {items.slice(0, 3).map((item) => (
                          <button
                            key={`${item.deal_id}-${item.issue_type}`}
                            type="button"
                            onClick={() => void openDealDrawer(item.deal_id)}
                            className="w-full rounded-2xl border border-bm-border/50 bg-bm-surface/20 p-3 text-left transition hover:border-bm-accent/45"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium text-bm-text">{item.deal_name}</span>
                              <span className="text-xs text-bm-muted2">{formatCurrency(item.deal_value)}</span>
                            </div>
                            <div className="mt-2 text-xs text-bm-muted2">{item.issue}</div>
                            <div className="mt-2 text-xs text-bm-text">{item.action}</div>
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
                {attentionGroups.size === 0 ? (
                  <article className="rounded-[26px] border border-bm-border/70 bg-bm-surface/20 p-4 xl:col-span-4">
                    <p className="text-sm text-bm-muted2">No deals need attention right now. Keep the board current to preserve that view.</p>
                  </article>
                ) : null}
              </div>
            </section>

            <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4" data-testid="pds-pipeline-kpis">
              {data.metrics.map((metric) => (
                <article key={metric.key} className={cn("rounded-[24px] border p-4", toneClasses(metric.tone))}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">{metric.label}</p>
                  <div className="mt-2 text-2xl font-semibold">{metricDisplay(metric)}</div>
                  <div className="mt-2 text-xs text-bm-muted2">{metric.context || metric.empty_hint || "—"}</div>
                  {metricDelta(metric) ? (
                    <div className="mt-2 text-xs text-bm-muted2">
                      {metric.delta_label}: <span className="text-bm-text">{metricDelta(metric)}</span>
                    </div>
                  ) : null}
                </article>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Board</p>
                  <h3 className="text-xl font-semibold">Deals in Motion</h3>
                </div>
                {movePendingId ? <p className="text-xs text-bm-muted2">Updating stage…</p> : null}
              </div>
              <DndContext sensors={sensors} onDragEnd={(event) => void handleMoveStage(event)}>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {BOARD_STAGES.map((stage) => (
                    <StageColumn
                      key={stage}
                      stage={stage}
                      summary={stageMap.get(stage)}
                      deals={dealsByStage[stage] || []}
                      onOpen={(dealId) => void openDealDrawer(dealId)}
                    />
                  ))}
                </div>
              </DndContext>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <article className="rounded-[28px] border border-bm-border/70 bg-bm-surface/20 p-5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Stage Diagnostics</p>
                <h3 className="mt-1 text-xl font-semibold">Conversion and Velocity</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {data.stages.map((stage) => (
                    <div key={stage.stage} className={cn("rounded-2xl border p-4", toneClasses(stage.tone))}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{stage.label || stageLabel(stage.stage)}</div>
                          <div className="mt-1 text-xs text-bm-muted2">{stage.count} deal{stage.count === 1 ? "" : "s"}</div>
                        </div>
                        <div className="text-right text-xs text-bm-muted2">
                          <div>{formatCurrency(stage.unweighted_value)}</div>
                          <div className="mt-1">{formatCurrency(stage.weighted_value)} weighted</div>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 text-xs text-bm-muted2 sm:grid-cols-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.14em]">Avg Time</div>
                          <div className="mt-1 text-bm-text">
                            {stage.avg_days_in_stage != null ? `${Math.round(Number(stage.avg_days_in_stage))}d` : "Not enough history yet"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.14em]">To Next</div>
                          <div className="mt-1 text-bm-text">
                            {stage.conversion_to_next_pct != null ? formatPercentRaw(stage.conversion_to_next_pct, 0) : "Not enough history yet"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.14em]">Drop-off</div>
                          <div className="mt-1 text-bm-text">
                            {stage.dropoff_pct != null ? formatPercentRaw(stage.dropoff_pct, 0) : "Not enough history yet"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-[28px] border border-bm-border/70 bg-bm-surface/20 p-5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Expected Revenue</p>
                <h3 className="mt-1 text-xl font-semibold">Close Timeline</h3>
                <p className="mt-1 text-sm text-bm-muted2">Weighted versus unweighted revenue by expected close month.</p>
                <div className="mt-4">
                  <TimelineChart points={data.timeline} />
                </div>
              </article>
            </section>

            <section className="rounded-[28px] border border-bm-border/70 bg-bm-surface/20 p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Deal List</p>
                  <h3 className="text-xl font-semibold">All Pipeline Deals</h3>
                </div>
                <div className="text-xs text-bm-muted2">{sortedDeals.length} deals in scope</div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
                    <tr className="border-b border-bm-border/60">
                      <th className="pb-3 pr-4 font-medium">Deal</th>
                      <th className="pb-3 pr-4 font-medium">Account</th>
                      <th className="pb-3 pr-4 font-medium">Stage</th>
                      <th className="pb-3 pr-4 font-medium">Value</th>
                      <th className="pb-3 pr-4 font-medium">Probability</th>
                      <th className="pb-3 pr-4 font-medium">Expected Close</th>
                      <th className="pb-3 pr-4 font-medium">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDeals.map((deal) => (
                      <tr
                        key={deal.deal_id}
                        className="cursor-pointer border-b border-bm-border/40 last:border-b-0 hover:bg-bm-surface/15"
                        onClick={() => void openDealDrawer(deal.deal_id)}
                      >
                        <td className="py-3 pr-4 font-medium text-bm-text">{deal.deal_name}</td>
                        <td className="py-3 pr-4 text-bm-muted2">{deal.account_name || "—"}</td>
                        <td className="py-3 pr-4">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", stageTone(deal.stage))}>
                            {stageLabel(deal.stage)}
                          </span>
                        </td>
                        <td className="py-3 pr-4">{formatCurrency(deal.deal_value)}</td>
                        <td className="py-3 pr-4">{formatPercentRaw(deal.probability_pct, 0)}</td>
                        <td className="py-3 pr-4 text-bm-muted2">{deal.expected_close_date ? formatDate(deal.expected_close_date) : "—"}</td>
                        <td className="py-3 pr-4 text-bm-muted2">{deal.owner_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {error && data ? (
          <div className="rounded-2xl border border-pds-signalRed/25 bg-pds-signalRed/10 px-4 py-3 text-sm text-pds-signalRed">
            {error}
          </div>
        ) : null}
      </div>

      <SlideOver
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDetail(null);
        }}
        title={drawerMode === "create" ? "Create Deal" : detail?.deal.deal_name || "Deal Detail"}
        subtitle={drawerMode === "create" ? "Add the first move in the pipeline." : detail?.deal.account_name || "Update stage, confidence, and close timing."}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || detailLoading}>
              {saving ? "Saving..." : drawerMode === "create" ? "Create Deal" : "Save Changes"}
            </Button>
          </>
        }
        width="max-w-3xl"
      >
        <div className="space-y-5">
          {detailLoading ? (
            <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/15 p-4 text-sm text-bm-muted2">Loading deal detail...</div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-bm-muted2">Deal Name</span>
              <input
                value={draft.deal_name}
                onChange={(event) => setDraft((current) => ({ ...current, deal_name: event.target.value }))}
                className="w-full rounded-xl border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm"
                placeholder="Northwest Medical Campus Refresh"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-bm-muted2">Account</span>
              <select
                value={draft.account_id}
                onChange={(event) => setDraft((current) => ({ ...current, account_id: event.target.value }))}
                className="w-full rounded-xl border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm"
              >
                <option value="">No linked account</option>
                {(lookups?.accounts || []).map((account) => (
                  <option key={account.value} value={account.value}>
                    {account.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-bm-muted2">Stage</span>
              <select
                value={draft.stage}
                onChange={(event) => setDraft((current) => ({ ...current, stage: event.target.value }))}
                className="w-full rounded-xl border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm"
              >
                {(lookups?.stages || []).map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-bm-muted2">Owner</span>
              <input
                list="pds-pipeline-owner-options"
                value={draft.owner_name}
                onChange={(event) => setDraft((current) => ({ ...current, owner_name: event.target.value }))}
                className="w-full rounded-xl border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm"
                placeholder="Dana Park"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-bm-muted2">Deal Value</span>
              <input
                type="number"
                min="0"
                value={draft.deal_value}
                onChange={(event) => setDraft((current) => ({ ...current, deal_value: event.target.value }))}
                className="w-full rounded-xl border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-bm-muted2">Probability %</span>
              <input
                type="number"
                min="0"
                max="100"
                value={draft.probability_pct}
                onChange={(event) => setDraft((current) => ({ ...current, probability_pct: event.target.value }))}
                className="w-full rounded-xl border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-bm-muted2">Expected Close</span>
              <input
                type="date"
                value={draft.expected_close_date}
                onChange={(event) => setDraft((current) => ({ ...current, expected_close_date: event.target.value }))}
                className="w-full rounded-xl border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-bm-muted2">Lost Reason</span>
              <input
                value={draft.lost_reason}
                onChange={(event) => setDraft((current) => ({ ...current, lost_reason: event.target.value }))}
                className="w-full rounded-xl border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm"
                placeholder="Required only for lost deals"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm">
            <span className="text-bm-muted2">Notes</span>
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              className="min-h-32 w-full rounded-2xl border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm"
              placeholder="Why this deal matters, what is blocking it, and what happens next."
            />
          </label>

          {detail?.deal ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Days In Stage</div>
                <div className="mt-2 text-xl font-semibold">{detail.deal.days_in_stage}d</div>
              </div>
              <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Last Activity</div>
                <div className="mt-2 text-sm text-bm-text">{detail.deal.last_activity_at ? formatDate(detail.deal.last_activity_at) : "No activity yet"}</div>
              </div>
              <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Attention Flags</div>
                <div className="mt-2 text-sm text-bm-text">
                  {detail.deal.attention_reasons.length > 0 ? detail.deal.attention_reasons.join(", ").replace(/_/g, " ") : "No urgent issues"}
                </div>
              </div>
            </div>
          ) : null}

          {detail?.history?.length ? (
            <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Stage History</p>
              <div className="mt-4 space-y-3">
                {detail.history.map((entry) => (
                  <div key={entry.stage_history_id} className="flex items-start justify-between gap-3 border-b border-bm-border/40 pb-3 last:border-b-0 last:pb-0">
                    <div>
                      <div className="text-sm font-medium text-bm-text">
                        {entry.from_stage ? `${stageLabel(entry.from_stage)} → ${stageLabel(entry.to_stage)}` : stageLabel(entry.to_stage)}
                      </div>
                      <div className="mt-1 text-xs text-bm-muted2">{entry.note || "No note recorded"}</div>
                    </div>
                    <div className="text-xs text-bm-muted2">{formatDate(entry.changed_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <datalist id="pds-pipeline-owner-options">
            {(lookups?.owners || []).map((owner) => (
              <option key={owner.value} value={owner.label} />
            ))}
          </datalist>
        </div>
      </SlideOver>
    </>
  );
}

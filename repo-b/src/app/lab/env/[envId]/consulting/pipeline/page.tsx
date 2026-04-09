"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent } from "@/components/ui/Card";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import {
  fetchExecutionBoard,
  advanceOpportunityStage,
  fetchSchemaHealth,
  runExecutionCommand,
  type ExecutionBoard,
  type ExecutionBoardColumn,
  type ExecutionCard,
  type SchemaHealth,
} from "@/lib/cro-api";
import { TodayPanel } from "@/components/consulting/TodayPanel";
import { PipelineActionBar } from "@/components/consulting/PipelineActionBar";
import { DealSidePanel } from "@/components/consulting/DealSidePanel";

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 0) return "future";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function isOverdue(dueDateStr: string | null | undefined): boolean {
  if (!dueDateStr) return false;
  const d = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function formatError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  const msg = err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "");
  if (msg.includes("Network error")) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  return msg || "Consulting API unreachable. Backend service is not available.";
}

function mapExecutionColumnToStage(columnKey: string): string {
  const mapping: Record<string, string> = {
    target_identified: "identified",
    outreach_drafted: "identified",
    outreach_sent: "contacted",
    engaged: "engaged",
    discovery_scheduled: "meeting",
    demo_completed: "qualified",
    proposal_sent: "proposal",
    negotiation: "proposal",
    closed_won: "closed_won",
    closed_lost: "closed_lost",
  };
  return mapping[columnKey] || columnKey;
}

function isSchemaError(msg: string | null): boolean {
  if (!msg) return false;
  return msg.includes("schema not migrated") || msg.includes("SCHEMA_NOT_MIGRATED");
}

function SchemaErrorBanner({ envId, onRetry }: { envId: string; onRetry: () => void }) {
  const [health, setHealth] = useState<SchemaHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    try {
      const h = await fetchSchemaHealth();
      setHealth(h);
      setChecked(new Date().toLocaleTimeString());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkHealth(); }, [checkHealth]);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-amber-400">
            Consulting environment not initialized
          </h3>
          <p className="text-xs text-bm-muted2 mt-1">
            Required database migrations have not been applied. The consulting module cannot load until the schema is ready.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { checkHealth().then(() => onRetry()); }}
            disabled={loading}
            className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Retry"}
          </button>
        </div>
      </div>

      {health ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${health.schema_ready ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-bm-text">
              Schema: {health.total_found}/{health.total_required} tables present
            </span>
            {checked ? (
              <span className="text-bm-muted2 ml-auto">
                Last check: {checked}
              </span>
            ) : null}
          </div>
          {health.migrations_needed.length > 0 ? (
            <div className="rounded-lg bg-bm-surface/20 border border-bm-border/30 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-1">
                Missing Migrations
              </p>
              <ul className="space-y-0.5">
                {health.migrations_needed.map((m, i) => (
                  <li key={i} className="text-xs text-red-400/80 font-mono">{m}</li>
                ))}
              </ul>
              <p className="text-[10px] text-bm-muted2 mt-2">
                Run: <code className="text-bm-accent/80">make db:migrate</code> or <code className="text-bm-accent/80">cd repo-b && node db/schema/apply.js</code>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DraggableCard({
  card,
  onSelect,
}: {
  card: ExecutionCard;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.crm_opportunity_id,
    data: { card },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const hasNoAction = !card.next_action_description;
  const overdue = isOverdue(card.next_action_due);

  let borderClass = "border-bm-border/60";
  let glowClass = "";
  if (hasNoAction) {
    borderClass = "border-red-500/60";
  } else if (overdue) {
    glowClass = "ring-2 ring-orange-400/40";
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div
        onClick={(e) => {
          if (isDragging) return;
          e.stopPropagation();
          onSelect(card.crm_opportunity_id);
        }}
        className="block cursor-pointer"
      >
        <div
          className={`rounded-lg border ${borderClass} ${glowClass} bg-bm-surface/30 hover:border-bm-accent/40 transition-all cursor-grab active:cursor-grabbing px-3 py-2.5`}
        >
          {/* Line 1: Company name (bold) */}
          <p className="text-sm font-semibold truncate text-bm-text">
            {card.account_name || "—"}
          </p>

          {/* Line 2: Deal title + value */}
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-bm-muted truncate flex-1 mr-2">
              {card.name}
            </p>
            <span className="text-xs font-semibold text-bm-text shrink-0">
              {fmtCurrency(card.amount)}
            </span>
          </div>

          {/* Line 3: Next action */}
          {card.next_action_description ? (
            <p className="text-[11px] text-bm-muted2 mt-1.5 truncate">
              <span className="text-bm-accent/80">Next:</span>{" "}
              {card.next_action_description}
            </p>
          ) : (
            <p className="text-[11px] text-red-400/80 mt-1.5">
              No next action defined
            </p>
          )}

          {/* Line 4: Last touch + due date */}
          <div className="flex items-center justify-between mt-1.5 text-[10px] text-bm-muted2">
            <span>
              {card.contact_name || "No contact"} · {relativeTime(card.last_activity_at)}
            </span>
            {card.next_action_due ? (
              <span className={overdue ? "text-orange-400 font-medium" : ""}>
                Due {card.next_action_due}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-bm-muted2">
            <span className={card.execution_pressure === "critical" ? "text-red-400" : card.execution_pressure === "high" ? "text-orange-400" : ""}>
              {card.execution_pressure}
            </span>
            <span>{card.deal_drift_status}</span>
            {card.latest_angle_used ? <span>{card.latest_angle_used}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DroppableColumn({
  column,
  onSelectCard,
}: {
  column: ExecutionBoardColumn;
  onSelectCard: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `column-${column.execution_column_key}`,
    data: { stageKey: column.execution_column_key },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[260px] flex flex-col rounded-lg transition-colors ${
        isOver ? "bg-bm-accent/5 ring-1 ring-bm-accent/30" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-bm-muted2">
          {column.execution_column_label}
        </h3>
        <span className="text-xs text-bm-muted">
          {fmtCurrency(column.weighted_value)} wt
        </span>
      </div>
      <div className="space-y-2 flex-1 min-h-[60px]">
        {column.cards.length === 0 ? (
          <div className="bm-glass rounded-lg p-3 text-xs text-bm-muted2 text-center">
            No deals
          </div>
        ) : (
          column.cards.map((card) => (
            <DraggableCard
              key={card.crm_opportunity_id}
              card={card}
              onSelect={onSelectCard}
            />
          ))
        )}
      </div>
      <div className="mt-2 px-1 text-xs text-bm-muted2">
        {column.cards.length} deal{column.cards.length !== 1 ? "s" : ""} ·{" "}
        {fmtCurrency(column.total_value)}
      </div>
    </div>
  );
}

function CardOverlay({ card }: { card: ExecutionCard }) {
  return (
    <div className="w-[260px]">
      <div className="rounded-lg border border-bm-accent/40 bg-bm-surface/60 shadow-lg px-3 py-2.5">
        <p className="text-sm font-semibold truncate">{card.account_name || "—"}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-bm-muted truncate flex-1 mr-2">{card.name}</p>
          <span className="text-xs font-semibold">{fmtCurrency(card.amount)}</span>
        </div>
      </div>
    </div>
  );
}

export default function PipelinePage({
  params,
}: {
  params: { envId: string };
}) {
  const {
    businessId,
    error: contextError,
    loading: contextLoading,
    ready,
  } = useConsultingEnv();
  const [kanban, setKanban] = useState<ExecutionBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<ExecutionCard | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [closeDialog, setCloseDialog] = useState<{
    opportunityId: string;
    stageKey: string;
  } | null>(null);
  const [closeReason, setCloseReason] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const loadData = useCallback(() => {
    if (!ready || !businessId) {
      if (ready && !businessId) setLoading(false);
      return;
    }
    setLoading(true);
    setDataError(null);
    fetchExecutionBoard(params.envId, businessId)
      .then((result) => {
        setKanban(result);
      })
      .catch((err) => {
        setKanban(null);
        setDataError(formatError(err));
      })
      .finally(() => setLoading(false));
  }, [businessId, params.envId, ready]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derive all cards from kanban for Today Panel and Action Bar
  const allCards = useMemo(() => {
    if (!kanban) return [];
    return kanban.columns
      .filter((c) => !["closed_won", "closed_lost"].includes(c.execution_column_key))
      .flatMap((c) => c.cards);
  }, [kanban]);

  const todayActions = useMemo(() => kanban?.today_queue ?? [], [kanban]);
  const staleCards = useMemo(
    () => allCards.filter((c) => c.risk_flags.includes("stalled_7d") || c.risk_flags.includes("inactive_3d")),
    [allCards],
  );
  const noActionCards = useMemo(
    () => allCards.filter((c) => !c.next_action_description),
    [allCards],
  );
  const revenueAtRisk = useMemo(
    () => staleCards.reduce((sum, c) => sum + (c.amount || 0), 0),
    [staleCards],
  );

  function handleDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as ExecutionCard | undefined;
    if (card) setActiveCard(card);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || !businessId) return;

    const oppId = active.id as string;
    const targetColumnId = over.id as string;
    if (!targetColumnId.startsWith("column-")) return;

    const targetStageKey = targetColumnId.replace("column-", "");

    const currentColumn = kanban?.columns.find((col) =>
      col.cards.some((c) => c.crm_opportunity_id === oppId),
    );
    if (!currentColumn || currentColumn.execution_column_key === targetStageKey) return;

    // Block stage movement if card has no next action — open side panel instead
    const draggedCard = currentColumn.cards.find((c) => c.crm_opportunity_id === oppId);
    if (draggedCard && !draggedCard.next_action_description) {
      setSelectedDealId(oppId);
      setAdvanceError("Define a next action before moving this deal.");
      return;
    }

    if (targetStageKey === "closed_won" || targetStageKey === "closed_lost") {
      setCloseDialog({ opportunityId: oppId, stageKey: targetStageKey });
      return;
    }

    try {
      setAdvanceError(null);
      await advanceOpportunityStage({
        env_id: params.envId,
        business_id: businessId,
        opportunity_id: oppId,
        to_stage_key: mapExecutionColumnToStage(targetStageKey),
      });
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to advance stage";
      setAdvanceError(msg);
    }
  }

  async function handleCloseConfirm() {
    if (!closeDialog || !businessId) return;
    try {
      await advanceOpportunityStage({
        env_id: params.envId,
        business_id: businessId,
        opportunity_id: closeDialog.opportunityId,
        to_stage_key: mapExecutionColumnToStage(closeDialog.stageKey),
        close_reason: closeReason || undefined,
      });
      setCloseDialog(null);
      setCloseReason("");
      loadData();
    } catch (err) {
      console.error("Failed to close deal:", err);
    }
  }

  function handleSelectCard(id: string) {
    setSelectedDealId(id);
  }

  function handleMarkDone(_cardId: string) {
    // Reload data to reflect completion
    loadData();
  }

  async function handleRunCommand(confirm = false) {
    if (!businessId || !command.trim()) return;
    setCommandBusy(true);
    setAdvanceError(null);
    try {
      const result = await runExecutionCommand({
        env_id: params.envId,
        business_id: businessId,
        command,
        confirm,
      });
      if (result.requires_confirmation) {
        setCommandOutput(`Confirm move: ${JSON.stringify(result.result)}`);
      } else {
        setCommandOutput(JSON.stringify(result.result, null, 2));
        loadData();
      }
    } catch (err) {
      setAdvanceError(err instanceof Error ? err.message : "Command failed");
    } finally {
      setCommandBusy(false);
    }
  }

  const bannerMessage = contextError
    ? contextError === "Environment not bound to a business."
      ? "This environment is not bound to a business, so CRM data cannot be loaded."
      : contextError
    : dataError;
  const isLoading = contextLoading || (ready && loading);
  const openDeals = allCards.length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-bm-surface/60 rounded animate-pulse" />
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="min-w-[260px] h-64 bg-bm-surface/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bannerMessage ? (
        isSchemaError(bannerMessage) ? (
          <SchemaErrorBanner envId={params.envId} onRetry={loadData} />
        ) : (
          <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
            {bannerMessage}
          </div>
        )
      ) : null}

      {advanceError ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          <span>{advanceError}</span>
          <button onClick={() => setAdvanceError(null)} className="text-red-400/60 hover:text-red-400 ml-2 text-xs">dismiss</button>
        </div>
      ) : null}

      {kanban?.critical_deals.length ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {kanban.critical_deals.length} critical deal{kanban.critical_deals.length !== 1 ? "s" : ""} pinned until cleared.
        </div>
      ) : null}

      <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder='Try: "move Baptist to engaged" or "what should I do today"'
            className="flex-1 rounded-lg border border-bm-border bg-bm-bg px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
          />
          <div className="flex gap-2">
            <button onClick={() => void handleRunCommand(false)} disabled={commandBusy} className="rounded-lg border border-bm-border px-3 py-2 text-xs font-medium text-bm-text hover:bg-bm-surface/30 disabled:opacity-50">
              {commandBusy ? "Running..." : "Run Command"}
            </button>
            <button onClick={() => void handleRunCommand(true)} disabled={commandBusy} className="rounded-lg border border-bm-accent/40 px-3 py-2 text-xs font-medium text-bm-accent hover:bg-bm-accent/10 disabled:opacity-50">
              Confirm
            </button>
          </div>
        </div>
        {commandOutput ? (
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-bm-bg/70 px-3 py-2 text-[11px] text-bm-muted2">{commandOutput}</pre>
        ) : null}
      </div>

      {/* TODAY PANEL — What do I do RIGHT NOW? */}
      <TodayPanel
        cards={todayActions}
        staleCount={staleCards.length}
        revenueAtRisk={revenueAtRisk}
        envId={params.envId}
        businessId={businessId || ""}
        onSelectCard={handleSelectCard}
        onMarkDone={handleMarkDone}
      />

      {/* ACTION BAR — Counts + Revenue at risk */}
      <PipelineActionBar
        todayCount={todayActions.length}
        staleCount={staleCards.length}
        criticalCount={kanban?.critical_deals.length ?? 0}
        noActionCount={noActionCards.length}
        revenueAtRisk={revenueAtRisk}
        totalPipeline={kanban?.total_pipeline ?? 0}
        weightedPipeline={kanban?.weighted_pipeline ?? 0}
        openDeals={openDeals}
        envId={params.envId}
      />

      {kanban && openDeals === 0 ? (
        <Card>
          <CardContent className="py-5 text-sm text-bm-muted2">
            No opportunities in the pipeline yet.
          </CardContent>
        </Card>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
          {kanban?.columns.map((col) => (
            <div key={col.execution_column_key} className="snap-start">
              <DroppableColumn
                column={col}
                onSelectCard={handleSelectCard}
              />
            </div>
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <CardOverlay card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      {/* DEAL SIDE PANEL */}
      {selectedDealId ? (
        <DealSidePanel
          dealId={selectedDealId}
          envId={params.envId}
          businessId={businessId || ""}
          onClose={() => setSelectedDealId(null)}
          onDataChange={loadData}
        />
      ) : null}

      {/* Close Deal Dialog */}
      {closeDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-bm-border bg-bm-bg p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-bm-text">
              {closeDialog.stageKey === "closed_won" ? "Close as Won" : "Close as Lost"}
            </h3>
            <p className="mt-2 text-sm text-bm-muted2">
              {closeDialog.stageKey === "closed_won"
                ? "Add a reason for closing this deal as won."
                : "Add a reason for losing this deal."}
            </p>
            <textarea
              className="mt-3 w-full rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2 focus:outline-none focus:ring-1 focus:ring-bm-accent"
              placeholder="Reason (optional)"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              rows={3}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setCloseDialog(null);
                  setCloseReason("");
                }}
                className="rounded-lg border border-bm-border px-4 py-2 text-sm text-bm-text hover:bg-bm-surface/30"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCloseConfirm()}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  closeDialog.stageKey === "closed_won"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {closeDialog.stageKey === "closed_won" ? "Mark as Won" : "Mark as Lost"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

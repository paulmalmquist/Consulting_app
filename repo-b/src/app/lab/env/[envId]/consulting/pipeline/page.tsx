"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
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
  fetchLeads,
  fetchPipelineKanban,
  advanceOpportunityStage,
  type Lead,
  type PipelineKanbanResult,
  type PipelineKanbanColumn,
  type PipelineKanbanCard,
} from "@/lib/cro-api";

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
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

function DraggableCard({
  card,
  envId,
}: {
  card: PipelineKanbanCard;
  envId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.crm_opportunity_id,
    data: { card },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Link
        href={`/lab/env/${envId}/consulting/pipeline/${card.crm_opportunity_id}`}
        className="block"
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
      >
        <Card className="hover:border-bm-accent/40 transition-colors cursor-grab active:cursor-grabbing">
          <CardContent className="py-3">
            <p className="text-sm font-medium truncate">{card.name}</p>
            <p className="text-xs text-bm-muted2 mt-0.5">
              {card.account_name || "—"}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-semibold">
                {fmtCurrency(card.amount)}
              </span>
              {card.expected_close_date ? (
                <span className="text-xs text-bm-muted">
                  Close: {card.expected_close_date}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function DroppableColumn({
  column,
  envId,
}: {
  column: PipelineKanbanColumn;
  envId: string;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `column-${column.stage_key}`,
    data: { stageKey: column.stage_key },
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
          {column.stage_label}
        </h3>
        <span className="text-xs text-bm-muted">
          {fmtCurrency(column.weighted_value)} weighted
        </span>
      </div>
      <div className="space-y-2 flex-1 min-h-[60px]">
        {column.cards.length === 0 ? (
          <div className="bm-glass rounded-lg p-3 text-xs text-bm-muted2 text-center">
            No deals
          </div>
        ) : (
          column.cards.map((card) => (
            <DraggableCard key={card.crm_opportunity_id} card={card} envId={envId} />
          ))
        )}
      </div>
      <div className="mt-2 px-1 text-xs text-bm-muted2">
        {column.cards.length} deal{column.cards.length !== 1 ? "s" : ""} ·{" "}
        {fmtCurrency(column.total_value)} total
      </div>
    </div>
  );
}

function CardOverlay({ card }: { card: PipelineKanbanCard }) {
  return (
    <div className="w-[260px]">
      <Card className="border-bm-accent/40 shadow-lg">
        <CardContent className="py-3">
          <p className="text-sm font-medium truncate">{card.name}</p>
          <p className="text-xs text-bm-muted2 mt-0.5">{card.account_name || "—"}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-semibold">{fmtCurrency(card.amount)}</span>
          </div>
        </CardContent>
      </Card>
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
  const [kanban, setKanban] = useState<PipelineKanbanResult | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<PipelineKanbanCard | null>(null);
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
    Promise.allSettled([
      fetchPipelineKanban(params.envId, businessId),
      fetchLeads(params.envId, businessId),
    ])
      .then(([kanbanResult, leadsResult]) => {
        if (leadsResult.status !== "fulfilled") {
          throw leadsResult.reason;
        }
        setKanban(
          kanbanResult.status === "fulfilled"
            ? kanbanResult.value
            : { columns: [], total_pipeline: 0, weighted_pipeline: 0 },
        );
        setLeads(leadsResult.value);
      })
      .catch((err) => {
        setKanban(null);
        setLeads([]);
        setDataError(formatError(err));
      })
      .finally(() => setLoading(false));
  }, [businessId, params.envId, ready]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as PipelineKanbanCard | undefined;
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

    // Find the card's current stage
    const currentColumn = kanban?.columns.find((col) =>
      col.cards.some((c) => c.crm_opportunity_id === oppId),
    );
    if (!currentColumn || currentColumn.stage_key === targetStageKey) return;

    // If closing, show dialog
    if (targetStageKey === "closed_won" || targetStageKey === "closed_lost") {
      setCloseDialog({ opportunityId: oppId, stageKey: targetStageKey });
      return;
    }

    try {
      await advanceOpportunityStage({
        env_id: params.envId,
        business_id: businessId,
        opportunity_id: oppId,
        to_stage_key: targetStageKey,
      });
      loadData();
    } catch (err) {
      console.error("Failed to advance stage:", err);
    }
  }

  async function handleCloseConfirm() {
    if (!closeDialog || !businessId) return;
    try {
      await advanceOpportunityStage({
        env_id: params.envId,
        business_id: businessId,
        opportunity_id: closeDialog.opportunityId,
        to_stage_key: closeDialog.stageKey,
        close_reason: closeReason || undefined,
      });
      setCloseDialog(null);
      setCloseReason("");
      loadData();
    } catch (err) {
      console.error("Failed to close deal:", err);
    }
  }

  const bannerMessage = contextError
    ? contextError === "Environment not bound to a business."
      ? "This environment is not bound to a business, so CRM data cannot be loaded."
      : contextError
    : dataError;
  const isLoading = contextLoading || (ready && loading);
  const openDeals =
    kanban?.columns.reduce((total, column) => total + column.cards.length, 0) ?? 0;

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
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      ) : null}

      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/18 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
              Pipeline Kanban
            </h2>
            <p className="mt-2 text-sm text-bm-muted2">
              Drag deals across stages on desktop. On mobile, swipe horizontally across the board and tap into a deal for detail.
            </p>
          </div>
          {kanban ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-bm-border/60 bg-bm-surface/22 px-3 py-3 text-sm text-bm-text">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Open deals</p>
                <p className="mt-2 text-lg font-semibold">{openDeals}</p>
              </div>
              <div className="rounded-xl border border-bm-border/60 bg-bm-surface/22 px-3 py-3 text-sm text-bm-text">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Total pipeline</p>
                <p className="mt-2 text-lg font-semibold">{fmtCurrency(kanban.total_pipeline)}</p>
              </div>
              <div className="rounded-xl border border-bm-border/60 bg-bm-surface/22 px-3 py-3 text-sm text-bm-text">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Weighted</p>
                <p className="mt-2 text-lg font-semibold">{fmtCurrency(kanban.weighted_pipeline)}</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {kanban && openDeals === 0 ? (
        <Card>
          <CardContent className="py-5 text-sm text-bm-muted2">
            {leads.length > 0
              ? "Leads exist, but no opportunities have been converted into the sales pipeline yet."
              : "No opportunities yet. No CRM data is present yet for this environment."}
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
            <div key={col.stage_key} className="snap-start">
              <DroppableColumn
                column={col}
                envId={params.envId}
              />
            </div>
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <CardOverlay card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Close Deal Dialog */}
      {closeDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-bm-border bg-bm-bg p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-bm-text">
              {closeDialog.stageKey === "closed_won" ? "Close as Won" : "Close as Lost"}
            </h3>
            <p className="mt-2 text-sm text-bm-muted2">
              {closeDialog.stageKey === "closed_won"
                ? "Congratulations! Add a reason for closing this deal as won."
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

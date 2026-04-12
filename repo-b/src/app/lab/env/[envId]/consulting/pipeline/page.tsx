"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  fetchExecutionBoard,
  advanceOpportunityStage,
  fetchSchemaHealth,
  type ExecutionBoard,
  type ExecutionBoardColumn,
  type ExecutionCard,
  type SchemaHealth,
} from "@/lib/cro-api";
import { DealSidePanel } from "@/components/consulting/DealSidePanel";
import PipelineLaneView, {
  PipelineCommandBand,
  LaneCardOverlay,
  type LaneMode,
} from "@/components/consulting/PipelineLaneView";
import PipelineActionPanel, {
  type ActiveSlice,
} from "@/components/consulting/PipelineActionPanel";
import {
  computeInsight,
  healthLabel,
  momentumArrow,
  type StageRow,
} from "@/components/consulting/pipeline-insight";


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
      if (h.schema_ready) {
        onRetry();
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [onRetry]);

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
  const [closeDialog, setCloseDialog] = useState<{
    opportunityId: string;
    stageKey: string;
  } | null>(null);
  const [closeReason, setCloseReason] = useState("");

  const [selectedIndustries, setSelectedIndustries] = useState<Set<string>>(
    () => new Set(),
  );
  const [focusedStage, setFocusedStage] = useState<string | null>(null);
  const [activeSlice, setActiveSlice] = useState<ActiveSlice | null>(null);
  const [chartMode, setChartMode] = useState<LaneMode>("count");
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  // Stable industry list (from unfiltered board) so chips don't flicker
  const industries = useMemo(() => {
    const s = new Set<string>();
    allCards.forEach((c) => {
      const key = (c.industry || "Other").trim() || "Other";
      s.add(key);
    });
    return Array.from(s).sort();
  }, [allCards]);

  // Industry-filtered columns — drives BOTH kanban render and chart
  const filteredColumns = useMemo((): ExecutionBoardColumn[] => {
    if (!kanban) return [];
    if (selectedIndustries.size === 0) return kanban.columns;
    return kanban.columns.map((col) => ({
      ...col,
      cards: col.cards.filter((c) => {
        const key = (c.industry || "Other").trim() || "Other";
        return selectedIndustries.has(key);
      }),
    }));
  }, [kanban, selectedIndustries]);

  // Chart rows — one per non-closed stage
  const chartData = useMemo((): StageRow[] => {
    const now = Date.now();
    return filteredColumns
      .filter(
        (c) =>
          !["closed_won", "closed_lost"].includes(c.execution_column_key),
      )
      .map((col) => {
        const row: StageRow = {
          stage_key: col.execution_column_key,
          stage_label: col.execution_column_label,
          _total: 0,
          _noAction: 0,
          _stale: 0,
          _hot: 0,
          _moved24h: 0,
        };
        industries.forEach((ind) => {
          row[ind] = 0;
        });
        for (const c of col.cards) {
          const ind = (c.industry || "Other").trim() || "Other";
          const contrib = chartMode === "count" ? 1 : c.amount || 0;
          row[ind] = (Number(row[ind]) || 0) + contrib;
          row._total += 1;
          if (!c.next_action_description) row._noAction += 1;
          if (
            c.risk_flags.includes("inactive_3d") ||
            c.risk_flags.includes("stalled_7d")
          ) {
            row._stale += 1;
          }
          if (c.momentum_status === "increasing") row._hot += 1;
          if (
            c.last_activity_at &&
            now - new Date(c.last_activity_at).getTime() < 86_400_000
          ) {
            row._moved24h += 1;
          }
        }
        row._healthLabel = healthLabel(row);
        row._momentum = momentumArrow(row);
        return row;
      });
  }, [filteredColumns, industries, chartMode]);

  const insight = useMemo(
    () => computeInsight(filteredColumns),
    [filteredColumns],
  );

  const hasActiveFilters =
    selectedIndustries.size > 0 || focusedStage !== null || activeSlice !== null;

  const handleToggleIndustry = useCallback((industry: string) => {
    setSelectedIndustries((prev) => {
      const next = new Set(prev);
      if (next.has(industry)) next.delete(industry);
      else next.add(industry);
      return next;
    });
  }, []);

  const scrollToColumn = useCallback((stageKey: string) => {
    const el = columnRefs.current[stageKey];
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, []);

  // Toggle stage focus: clicking the same bar twice clears everything.
  // Both focusedStage and activeSlice are cleared together to avoid divergence.
  const handleSelectStage = useCallback(
    (stageKey: string) => {
      setFocusedStage((prev) => {
        const next = prev === stageKey ? null : stageKey;
        setActiveSlice(next === null ? null : { stage: stageKey });
        return next;
      });
      scrollToColumn(stageKey);
    },
    [scrollToColumn],
  );

  // Toggle segment: clicking the same (stage, industry) pair clears filters.
  const handleSelectSegment = useCallback(
    (stageKey: string, industry: string) => {
      if (focusedStage === stageKey && activeSlice?.industry === industry) {
        setSelectedIndustries(new Set());
        setFocusedStage(null);
        setActiveSlice(null);
      } else {
        setSelectedIndustries(new Set([industry]));
        setFocusedStage(stageKey);
        setActiveSlice({ stage: stageKey, industry });
        scrollToColumn(stageKey);
      }
    },
    [focusedStage, activeSlice, scrollToColumn],
  );

  const handleInsightAction = useCallback(() => {
    const rec = insight.recommendation;
    if (rec.focusIndustry) {
      setSelectedIndustries(new Set([rec.focusIndustry]));
    }
    if (rec.focusStage) {
      setFocusedStage(rec.focusStage);
      setActiveSlice({
        stage: rec.focusStage,
        industry: rec.focusIndustry ?? undefined,
      });
      scrollToColumn(rec.focusStage);
    }
  }, [insight, scrollToColumn]);

  const handleClearFilters = useCallback(() => {
    setSelectedIndustries(new Set());
    setFocusedStage(null);
    setActiveSlice(null);
  }, []);

  const handleToggleMode = useCallback(() => {
    setChartMode((m) => (m === "count" ? "value" : "count"));
  }, []);

  // Stable per-key ref callbacks cached so LaneColumn doesn't see new
  // function references on every render (avoids unnecessary dnd-kit re-registration).
  const columnRefCallbackCache = useRef<
    Record<string, (el: HTMLDivElement | null) => void>
  >({});
  const makeColumnRef = useCallback((stageKey: string) => {
    if (!columnRefCallbackCache.current[stageKey]) {
      columnRefCallbackCache.current[stageKey] = (el: HTMLDivElement | null) => {
        columnRefs.current[stageKey] = el;
      };
    }
    return columnRefCallbackCache.current[stageKey];
  }, []);

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

  const bannerMessage = contextError
    ? contextError === "Environment not bound to a business."
      ? "This environment is not bound to a business, so CRM data cannot be loaded."
      : contextError
    : dataError;
  const isLoading = contextLoading || (ready && loading);
  const openDeals = allCards.length;

  if (isLoading) {
    return (
      <div className="flex gap-0.5 overflow-x-auto px-4 pt-4 pb-4">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="shrink-0 w-[206px] h-[480px] bg-bm-surface/40 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div style={{ background: "#05070B", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {bannerMessage ? (
        <div className="mx-4 mt-3">
          {isSchemaError(bannerMessage) ? (
            <SchemaErrorBanner envId={params.envId} onRetry={loadData} />
          ) : (
            <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
              {bannerMessage}
            </div>
          )}
        </div>
      ) : null}

      {advanceError ? (
        <div className="mx-4 mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400 flex items-center justify-between">
          <span>{advanceError}</span>
          <button onClick={() => setAdvanceError(null)} className="text-red-400/60 hover:text-red-400 ml-2 text-xs">dismiss</button>
        </div>
      ) : null}

      {kanban && openDeals === 0 ? (
        <div className="mx-4 mt-3 rounded-lg border border-bm-border/40 bg-bm-surface/20 px-4 py-5 text-sm text-bm-muted2">
          No opportunities in the pipeline yet.
        </div>
      ) : null}

      {/* UNIFIED LANE VIEW — chart bars aligned above kanban columns */}
      {kanban ? (
        <>
          <PipelineCommandBand
            insight={insight}
            industries={industries}
            selectedIndustries={selectedIndustries}
            mode={chartMode}
            hasActiveFilters={hasActiveFilters}
            openDeals={openDeals}
            staleCount={staleCards.length}
            criticalCount={kanban.critical_deals.length}
            noActionCount={noActionCards.length}
            revenueAtRisk={revenueAtRisk}
            totalPipeline={kanban.total_pipeline ?? 0}
            weightedPipeline={kanban.weighted_pipeline ?? 0}
            onToggleIndustry={handleToggleIndustry}
            onInsightAction={handleInsightAction}
            onToggleMode={handleToggleMode}
            onClearFilters={handleClearFilters}
          />
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <PipelineLaneView
              columns={filteredColumns}
              chartData={chartData}
              industries={industries}
              selectedIndustries={selectedIndustries}
              focusedStage={focusedStage}
              activeSlice={activeSlice}
              mode={chartMode}
              onSelectStage={handleSelectStage}
              onSelectSegment={handleSelectSegment}
              onSelectCard={handleSelectCard}
              makeColumnRef={makeColumnRef}
            />
            <DragOverlay>
              {activeCard ? <LaneCardOverlay card={activeCard} /> : null}
            </DragOverlay>
          </DndContext>
        </>
      ) : null}

      {kanban ? (
        <PipelineActionPanel
          slice={activeSlice}
          columns={filteredColumns}
          envId={params.envId}
          businessId={businessId || ""}
          onExecuted={loadData}
          onOpenDeal={handleSelectCard}
          onDismiss={() => setActiveSlice(null)}
        />
      ) : null}

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

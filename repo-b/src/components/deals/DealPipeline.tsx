"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import {
  type Deal,
  type DealStage,
  DEAL_STAGES,
  getDeals,
  addDeal,
  updateDealStage,
  saveDeals,
  getPipelineStats,
} from "@/lib/deals";
import DealCard from "@/components/deals/DealCard";
import StageColumn from "@/components/deals/StageColumn";
import AddDealModal from "@/components/deals/AddDealModal";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DealPipeline() {
  const [deals, setDeals] = useState<Deal[]>(() => getDeals());
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const stats = useMemo(() => getPipelineStats(deals), [deals]);

  const dealsByStage = useMemo(() => {
    const map: Record<DealStage, Deal[]> = {
      origination: [],
      underwriting: [],
      ic_review: [],
      closed_won: [],
      closed_lost: [],
    };
    for (const deal of deals) {
      map[deal.stage].push(deal);
    }
    return map;
  }, [deals]);

  const activeDeal = activeDealId
    ? deals.find((d) => d.id === activeDealId) || null
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDealId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDealId(null);
      const { active, over } = event;
      if (!over) return;

      const dealId = active.id as string;
      const targetStage = over.id as DealStage;

      const deal = deals.find((d) => d.id === dealId);
      if (!deal || deal.stage === targetStage) return;

      // Validate that targetStage is a valid stage key
      if (!DEAL_STAGES.some((s) => s.key === targetStage)) return;

      const updated = deals.map((d) =>
        d.id === dealId ? { ...d, stage: targetStage } : d
      );
      setDeals(updated);
      saveDeals(updated);
    },
    [deals]
  );

  const handleAddDeal = useCallback(
    (deal: Omit<Deal, "id" | "createdAt">) => {
      const newDeal = addDeal(deal);
      setDeals((prev) => [...prev, newDeal]);
      setShowAddModal(false);
    },
    []
  );

  return (
    <div className="space-y-6">
      {/* ── Summary Bar ──────────────────────────────────────── */}
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="pipeline-summary"
      >
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4">
          <p className="text-xs uppercase tracking-wider text-bm-muted2">
            Total Pipeline
          </p>
          <p className="mt-1 text-2xl font-semibold text-bm-text">
            {formatCurrency(stats.totalValue)}
          </p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4">
          <p className="text-xs uppercase tracking-wider text-bm-muted2">
            Weighted Pipeline
          </p>
          <p className="mt-1 text-2xl font-semibold text-bm-text">
            {formatCurrency(stats.weightedValue)}
          </p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4">
          <p className="text-xs uppercase tracking-wider text-bm-muted2">
            Total Deals
          </p>
          <p className="mt-1 text-2xl font-semibold text-bm-text">
            {stats.count}
          </p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4">
          <p className="text-xs uppercase tracking-wider text-bm-muted2">
            Closed Won
          </p>
          <p className="mt-1 text-2xl font-semibold text-bm-success">
            {stats.countByStage.closed_won}
          </p>
        </div>
      </div>

      {/* ── Add Deal button ──────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="add-deal-button"
          onClick={() => setShowAddModal(true)}
          className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-text hover:bg-bm-accent/20 transition"
        >
          + Add Deal
        </button>
      </div>

      {/* ── Kanban Board ─────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 min-h-[400px]"
          data-testid="deal-pipeline"
        >
          {DEAL_STAGES.map((stage) => (
            <StageColumn
              key={stage.key}
              stage={stage}
              deals={dealsByStage[stage.key]}
              isActive={
                activeDeal !== null && activeDeal.stage !== stage.key
              }
            />
          ))}
        </div>

        <DragOverlay>
          {activeDeal ? <DealCard deal={activeDeal} isOverlay /> : null}
        </DragOverlay>
      </DndContext>

      {/* ── Add Deal Modal ───────────────────────────────────── */}
      {showAddModal && (
        <AddDealModal
          onAdd={handleAddDeal}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

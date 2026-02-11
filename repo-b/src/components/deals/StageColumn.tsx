"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import type { Deal, DealStage } from "@/lib/deals";
import DealCard from "@/components/deals/DealCard";

type Props = {
  stage: { key: DealStage; label: string };
  deals: Deal[];
  isActive: boolean;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function StageColumn({ stage, deals, isActive }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });

  const stageTotal = deals.reduce((sum, d) => sum + d.value, 0);

  return (
    <div
      ref={setNodeRef}
      data-testid={`stage-column-${stage.key}`}
      className={cn(
        "flex flex-col rounded-xl border bg-bm-surface/20 p-3 min-h-[200px] transition",
        isOver
          ? "border-bm-accent/60 bg-bm-accent/5 shadow-bm-glow"
          : isActive
          ? "border-bm-border/50 border-dashed"
          : "border-bm-border/40"
      )}
    >
      {/* Column header */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <h3
            className={cn(
              "text-xs font-semibold uppercase tracking-wider",
              stage.key === "closed_won"
                ? "text-bm-success"
                : stage.key === "closed_lost"
                ? "text-bm-danger"
                : "text-bm-muted"
            )}
          >
            {stage.label}
          </h3>
          <span className="rounded-full bg-bm-surface/60 px-2 py-0.5 text-[11px] font-medium text-bm-muted">
            {deals.length}
          </span>
        </div>
        {stageTotal > 0 && (
          <p className="mt-0.5 text-[11px] text-bm-muted2">
            {formatCurrency(stageTotal)}
          </p>
        )}
      </div>

      {/* Deal cards */}
      <div className="flex flex-col gap-2 flex-1">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
        {!deals.length && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-bm-muted2">Drop deals here</p>
          </div>
        )}
      </div>
    </div>
  );
}

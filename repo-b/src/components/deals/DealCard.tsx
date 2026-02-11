"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import type { Deal } from "@/lib/deals";

type Props = {
  deal: Deal;
  isOverlay?: boolean;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DealCard({ deal, isOverlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id, disabled: isOverlay });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : { ...listeners, ...attributes })}
      data-testid={`deal-card-${deal.id}`}
      data-stage={deal.stage}
      className={cn(
        "rounded-lg border bg-bm-surface/60 p-3 cursor-grab transition shadow-sm",
        isDragging
          ? "opacity-30 border-bm-accent/30"
          : "border-bm-border/60 hover:border-bm-accent/30 hover:shadow-bm-glow",
        isOverlay && "shadow-bm-card border-bm-accent/40 opacity-95 rotate-2"
      )}
    >
      <p className="text-sm font-medium text-bm-text truncate">{deal.name}</p>
      <p className="text-xs text-bm-muted truncate">{deal.company}</p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-bm-accent">
          {formatCurrency(deal.value)}
        </span>
        <span className="text-bm-muted">{deal.probability}%</span>
      </div>
      <p className="mt-1 text-[11px] text-bm-muted2 truncate">{deal.owner}</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent } from "@/components/ui/Card";
import {
  fetchPipelineKanban,
  type PipelineKanbanResult,
  type PipelineKanbanColumn,
} from "@/lib/cro-api";

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function StageColumn({
  column,
}: {
  column: PipelineKanbanColumn;
}) {
  return (
    <div className="min-w-[260px] flex flex-col">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-bm-muted2">
          {column.stage_label}
        </h3>
        <span className="text-xs text-bm-muted">
          {fmtCurrency(column.weighted_value)} weighted
        </span>
      </div>
      <div className="space-y-2 flex-1">
        {column.cards.length === 0 ? (
          <div className="bm-glass rounded-lg p-3 text-xs text-bm-muted2 text-center">
            No deals
          </div>
        ) : (
          column.cards.map((card) => (
            <Card key={card.crm_opportunity_id}>
              <CardContent className="py-3">
                <p className="text-sm font-medium truncate">{card.name}</p>
                <p className="text-xs text-bm-muted2 mt-0.5">
                  {card.account_name || "—"}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-semibold">
                    {fmtCurrency(card.amount)}
                  </span>
                  {card.expected_close_date && (
                    <span className="text-xs text-bm-muted">
                      Close: {card.expected_close_date}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
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

export default function PipelinePage({
  params,
}: {
  params: { envId: string };
}) {
  const { businessId } = useConsultingEnv();
  const [kanban, setKanban] = useState<PipelineKanbanResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    fetchPipelineKanban(params.envId, businessId)
      .then(setKanban)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [businessId, params.envId]);

  if (loading) {
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
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
          Pipeline Kanban
        </h2>
        {kanban && (
          <div className="flex gap-4 text-xs text-bm-muted2">
            <span>Total: {fmtCurrency(kanban.total_pipeline)}</span>
            <span>Weighted: {fmtCurrency(kanban.weighted_pipeline)}</span>
          </div>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {kanban?.columns.map((col) => (
          <StageColumn
            key={col.stage_key}
            column={col}
          />
        ))}
      </div>
    </div>
  );
}

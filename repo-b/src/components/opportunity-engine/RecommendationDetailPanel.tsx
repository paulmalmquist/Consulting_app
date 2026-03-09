"use client";

import React from "react";
import TrendLineChart from "@/components/charts/TrendLineChart";
import { Card, CardContent } from "@/components/ui/Card";
import { SlideOver } from "@/components/ui/SlideOver";
import type { OpportunityRecommendationDetail } from "@/lib/bos-api";

function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return `${(value * 100).toFixed(1)}%`;
}

export default function RecommendationDetailPanel({
  detail,
  open,
  loading,
  onClose,
}: {
  detail: OpportunityRecommendationDetail | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={detail?.title || "Recommendation Detail"}
      subtitle={detail?.business_line ? `${detail.business_line} · ${detail.priority}` : "Opportunity drivers"}
      width="max-w-3xl"
    >
      {loading ? (
        <div className="text-sm text-bm-muted2">Loading recommendation detail...</div>
      ) : !detail ? (
        <div className="text-sm text-bm-muted2">Select a recommendation to inspect its score drivers.</div>
      ) : (
        <div className="space-y-5">
          <Card className="border border-bm-border/70 bg-bm-surface/20">
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Score</p>
                  <p className="mt-1 text-xl font-semibold">{detail.score?.toFixed(1) ?? "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Probability</p>
                  <p className="mt-1 text-xl font-semibold">{fmtPct(detail.probability)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Suggested Action</p>
                  <p className="mt-1 text-sm text-bm-text">{detail.suggested_action || "\u2014"}</p>
                </div>
              </div>
              {detail.summary ? <p className="text-sm text-bm-muted">{detail.summary}</p> : null}
            </CardContent>
          </Card>

          <Card className="border border-bm-border/70 bg-bm-surface/20">
            <CardContent>
              <div className="mb-3">
                <h3 className="text-sm font-semibold">Score History</h3>
                <p className="text-xs text-bm-muted2">Recent score and probability snapshots for this recommendation target.</p>
              </div>
              {detail.score_history.length ? (
                <TrendLineChart
                  data={detail.score_history.map((point) => ({
                    quarter: point.as_of_date,
                    score: point.score ?? 0,
                    probability: point.probability ?? 0,
                  }))}
                  lines={[
                    { key: "score", label: "Score" },
                    { key: "probability", label: "Probability", dashed: true },
                  ]}
                  format="number"
                  height={240}
                />
              ) : (
                <div className="text-sm text-bm-muted2">No score history has been recorded yet.</div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-[1.15fr,0.85fr]">
            <Card className="border border-bm-border/70 bg-bm-surface/20">
              <CardContent>
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">Why This Is Recommended</h3>
                  <p className="text-xs text-bm-muted2">Top drivers captured for this score and recommendation.</p>
                </div>
                <div className="space-y-3">
                  {detail.drivers.length ? detail.drivers.map((driver) => (
                    <div key={`${driver.driver_key}-${driver.rank_position}`} className="rounded-lg bg-bm-surface/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-bm-text">{driver.driver_label}</p>
                        <span className="text-xs text-bm-muted2">
                          {driver.contribution_score?.toFixed(3) ?? "\u2014"}
                        </span>
                      </div>
                      {driver.explanation_text ? (
                        <p className="mt-1 text-xs text-bm-muted2">{driver.explanation_text}</p>
                      ) : null}
                    </div>
                  )) : (
                    <div className="text-sm text-bm-muted2">No explanation drivers were stored for this item.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-bm-border/70 bg-bm-surface/20">
              <CardContent>
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">Linked Signals</h3>
                  <p className="text-xs text-bm-muted2">Prediction-market signals attached to the recommendation.</p>
                </div>
                <div className="space-y-3">
                  {detail.linked_signals.length ? detail.linked_signals.map((signal) => (
                    <div key={signal.market_signal_id} className="rounded-lg bg-bm-surface/30 px-3 py-2">
                      <p className="text-sm font-medium text-bm-text">{signal.signal_name}</p>
                      <p className="mt-1 text-xs text-bm-muted2">
                        {signal.signal_source} · {fmtPct(signal.probability)}
                      </p>
                    </div>
                  )) : (
                    <div className="text-sm text-bm-muted2">No linked market signals were stored for this recommendation.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </SlideOver>
  );
}

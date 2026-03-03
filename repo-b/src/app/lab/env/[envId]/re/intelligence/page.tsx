"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createCreForecastQuestion,
  listCreForecastQuestions,
  listCreIntelligenceProperties,
  refreshCreForecastSignals,
  type CreForecastQuestion,
  type CreForecastSignalsBundle,
  type CrePropertySummary,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export default function ReIntelligencePage() {
  const { envId, businessId } = useReEnv();
  const [properties, setProperties] = useState<CrePropertySummary[]>([]);
  const [questions, setQuestions] = useState<CreForecastQuestion[]>([]);
  const [activeSignals, setActiveSignals] = useState<CreForecastSignalsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!envId || !businessId) return;
      setLoading(true);
      setError(null);
      try {
        const [propertyRows, questionRows] = await Promise.all([
          listCreIntelligenceProperties({ env_id: envId }),
          listCreForecastQuestions({ env_id: envId, business_id: businessId }),
        ]);
        setProperties(propertyRows);
        if (questionRows.length === 0) {
          const created = await createCreForecastQuestion({
            env_id: envId,
            business_id: businessId,
            text: "Will Miami metro unemployment exceed 5.0% by 2026-12-31?",
            scope: "macro",
            event_date: "2026-12-31",
            resolution_criteria: "Resolved using BLS metro unemployment data for CBSA 33100.",
            resolution_source: "BLS",
          });
          setQuestions([created]);
          setActiveSignals(await refreshCreForecastSignals(created.question_id));
        } else {
          setQuestions(questionRows);
          setActiveSignals(await refreshCreForecastSignals(questionRows[0].question_id));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load CRE intelligence.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [envId, businessId]);

  async function refresh(questionId: string) {
    try {
      const bundle = await refreshCreForecastSignals(questionId);
      setActiveSignals(bundle);
      setQuestions((current) =>
        current.map((row) =>
          row.question_id === bundle.question.question_id ? bundle.question : row
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh signals.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">CRE Intelligence Graph</p>
            <h2 className="mt-1 text-xl font-semibold text-bm-text">Miami Forecast Cockpit</h2>
            <p className="mt-2 max-w-3xl text-sm text-bm-muted">
              Provenance-forward property intelligence, market overlays, and superforecaster signals for the Miami MSA launch slice.
            </p>
          </div>
          <Link
            href={`/lab/env/${envId}/re/pipeline`}
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
          >
            Back To Pipeline
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
        <section className="rounded-2xl border border-bm-border/70 bg-bm-bg p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Property Graph</h3>
              <p className="mt-1 text-xs text-bm-muted">Canonical properties linked to forecasts and geography context.</p>
            </div>
            <span className="rounded-full border border-bm-border px-2.5 py-1 text-xs text-bm-muted2">
              {properties.length} properties
            </span>
          </div>

          {loading ? <div className="text-sm text-bm-muted">Loading intelligence graph…</div> : null}

          {!loading && properties.length === 0 ? (
            <div className="rounded-xl border border-dashed border-bm-border px-4 py-6 text-sm text-bm-muted">
              No canonical properties yet. Run the CRE backfill to seed the Miami slice.
            </div>
          ) : null}

          <div className="space-y-3">
            {properties.map((property) => (
              <Link
                key={property.property_id}
                href={`/lab/env/${envId}/re/intelligence/properties/${property.property_id}`}
                className="block rounded-xl border border-bm-border/70 bg-bm-surface/20 px-4 py-3 transition-colors hover:bg-bm-surface/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-bm-text">{property.property_name}</p>
                    <p className="mt-1 text-xs text-bm-muted">
                      {[property.address, property.city, property.state].filter(Boolean).join(", ") || "Address pending"}
                    </p>
                  </div>
                  <span className="rounded-full border border-bm-border px-2 py-1 text-[11px] text-bm-muted2">
                    {Math.round(property.resolution_confidence * 100)}% resolved
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-bm-surface/30 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Target</p>
                    <p className="mt-1 text-sm text-bm-text">{property.latest_forecast_target || "Not scored"}</p>
                  </div>
                  <div className="rounded-lg bg-bm-surface/30 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Prediction</p>
                    <p className="mt-1 text-sm text-bm-text">{fmtPct(property.latest_prediction)}</p>
                  </div>
                  <div className="rounded-lg bg-bm-surface/30 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Forecasted</p>
                    <p className="mt-1 text-sm text-bm-text">
                      {property.latest_prediction_at ? fmtDate(property.latest_prediction_at) : "—"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-bm-border/70 bg-bm-bg p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Superforecaster</h3>
            <p className="mt-1 text-xs text-bm-muted">Internal model, analyst, and Kalshi market-implied probabilities with Brier-aware weighting.</p>
          </div>

          <div className="space-y-3">
            {questions.map((question) => (
              <button
                key={question.question_id}
                type="button"
                onClick={() => void refresh(question.question_id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                  activeSignals?.question.question_id === question.question_id
                    ? "border-bm-accent bg-bm-surface/35"
                    : "border-bm-border/70 bg-bm-surface/20 hover:bg-bm-surface/35"
                }`}
              >
                <p className="text-sm font-medium text-bm-text">{question.text}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-bm-muted">
                  <span>{fmtDate(question.event_date)}</span>
                  <span>{fmtPct(question.probability)}</span>
                </div>
              </button>
            ))}
          </div>

          {activeSignals ? (
            <div className="mt-5 space-y-3 rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Aggregate Probability</p>
                  <p className="mt-1 text-2xl font-semibold text-bm-text">
                    {fmtPct(activeSignals.aggregate_probability)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh(activeSignals.question.question_id)}
                  className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
                >
                  Refresh Signals
                </button>
              </div>
              <div className="space-y-2">
                {activeSignals.signals.map((signal) => (
                  <div
                    key={`${signal.signal_source}-${signal.observed_at}`}
                    className="flex items-center justify-between rounded-lg bg-bm-surface/30 px-3 py-2 text-sm"
                  >
                    <span className="text-bm-text">{signal.signal_source}</span>
                    <span className="text-bm-muted">
                      {fmtPct(signal.probability)}
                      {signal.weight != null ? ` · w ${signal.weight.toFixed(2)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-bm-border/70 px-3 py-2 text-xs text-bm-muted2">
                Reason codes: {activeSignals.reason_codes.join(", ")}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

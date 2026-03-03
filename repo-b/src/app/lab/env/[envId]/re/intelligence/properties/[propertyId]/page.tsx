"use client";

import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getCreIntelligenceExternalities,
  getCreIntelligenceFeatures,
  getCreIntelligenceProperty,
  materializeCreForecasts,
  type CreExternalitiesBundle,
  type CreFeatureValue,
  type CrePropertyDetail,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNumber(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(2);
}

export default function ReIntelligencePropertyPage({
  params,
}: {
  params: { envId: string; propertyId: string };
}) {
  const { envId } = useReEnv();
  const [detail, setDetail] = useState<CrePropertyDetail | null>(null);
  const [externalities, setExternalities] = useState<CreExternalitiesBundle | null>(null);
  const [features, setFeatures] = useState<CreFeatureValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [property, ext, featureRows] = await Promise.all([
          getCreIntelligenceProperty(params.propertyId),
          getCreIntelligenceExternalities({ property_id: params.propertyId, period: "2025-12-31" }),
          getCreIntelligenceFeatures({ property_id: params.propertyId, version: "miami_mvp_v1", period: "2025-12-31" }),
        ]);
        setDetail(property);
        setExternalities(ext);
        setFeatures(featureRows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load property intelligence.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.propertyId]);

  async function generateForecasts() {
    try {
      await materializeCreForecasts({
        scope: "property",
        entity_ids: [params.propertyId],
        targets: [
          "rent_growth_next_12m",
          "value_change_proxy_next_12m",
          "refi_risk_score",
          "distress_probability",
        ],
      });
      setDetail(await getCreIntelligenceProperty(params.propertyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to materialize forecasts.");
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted">Loading property intelligence…</div>;
  }

  if (error || !detail) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
        {error || "Property intelligence unavailable."}
      </div>
    );
  }

  const topFeatures = features.slice(0, 8);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Property Drilldown</p>
            <h2 className="mt-1 text-xl font-semibold text-bm-text">{detail.property.property_name}</h2>
            <p className="mt-2 text-sm text-bm-muted">
              {[detail.property.address, detail.property.city, detail.property.state].filter(Boolean).join(", ") || "Address pending"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/lab/env/${envId || params.envId}/re/intelligence`}
              className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              Back
            </Link>
            <button
              type="button"
              onClick={() => void generateForecasts()}
              className="rounded-lg bg-bm-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Materialize Forecasts
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr,0.95fr]">
        <section className="space-y-5">
          <div className="rounded-2xl border border-bm-border/70 bg-bm-bg p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Data Card</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-bm-surface/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Resolution Confidence</p>
                <p className="mt-1 text-lg font-semibold text-bm-text">
                  {Math.round(detail.property.resolution_confidence * 100)}%
                </p>
              </div>
              <div className="rounded-xl bg-bm-surface/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Property Type</p>
                <p className="mt-1 text-lg font-semibold text-bm-text">{detail.property.land_use || "—"}</p>
              </div>
              <div className="rounded-xl bg-bm-surface/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Square Feet</p>
                <p className="mt-1 text-lg font-semibold text-bm-text">{fmtNumber(detail.property.size_sqft)}</p>
              </div>
              <div className="rounded-xl bg-bm-surface/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Year Built</p>
                <p className="mt-1 text-lg font-semibold text-bm-text">{detail.property.year_built || "—"}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-bm-border/70 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Provenance</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-bm-muted">
                {JSON.stringify(detail.source_provenance, null, 2)}
              </pre>
            </div>
          </div>

          <div className="rounded-2xl border border-bm-border/70 bg-bm-bg p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Externalities</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(["macro", "housing", "hazard", "policy"] as const).map((bucket) => (
                <div key={bucket} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{bucket}</p>
                  <div className="mt-3 space-y-2">
                    {externalities?.[bucket]?.length ? (
                      externalities?.[bucket]?.map((metric) => (
                        <div key={metric.metric_key} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-bm-text">{metric.label}</span>
                          <span className="text-bm-muted">
                            {metric.units === "pct" || metric.units === "probability" || metric.units === "ratio"
                              ? fmtPct(metric.value)
                              : fmtNumber(metric.value)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-bm-muted">No {bucket} metrics loaded.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-2xl border border-bm-border/70 bg-bm-bg p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Forecasts</h3>
            <div className="mt-4 space-y-3">
              {detail.latest_forecasts.length ? (
                detail.latest_forecasts.map((forecast) => (
                  <div key={forecast.forecast_id} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-bm-text">{forecast.target}</p>
                        <p className="mt-1 text-xs text-bm-muted">{forecast.model_version}</p>
                      </div>
                      <span className="rounded-full border border-bm-border px-2 py-1 text-[11px] text-bm-muted2">
                        {fmtPct(forecast.prediction)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3 text-sm">
                      <div className="rounded-lg bg-bm-surface/30 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Baseline</p>
                        <p className="mt-1 text-bm-text">{fmtPct(forecast.baseline_prediction)}</p>
                      </div>
                      <div className="rounded-lg bg-bm-surface/30 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Lower</p>
                        <p className="mt-1 text-bm-text">{fmtPct(forecast.lower_bound)}</p>
                      </div>
                      <div className="rounded-lg bg-bm-surface/30 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Upper</p>
                        <p className="mt-1 text-bm-text">{fmtPct(forecast.upper_bound)}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg border border-bm-border/70 px-3 py-2 text-xs text-bm-muted2">
                      Drivers: {((forecast.explanation_json.top_drivers as Array<{ feature_key: string }> | undefined) || [])
                        .map((item) => item.feature_key)
                        .join(", ") || "Structured explanation unavailable"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-bm-border px-4 py-6 text-sm text-bm-muted">
                  No forecasts yet. Materialize the baseline forecast set for this property.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-bm-border/70 bg-bm-bg p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Feature Store</h3>
            <div className="mt-4 space-y-2">
              {topFeatures.length ? (
                topFeatures.map((feature) => (
                  <div
                    key={feature.feature_id}
                    className="flex items-center justify-between rounded-lg bg-bm-surface/20 px-3 py-2 text-sm"
                  >
                    <span className="text-bm-text">{feature.feature_key}</span>
                    <span className="text-bm-muted">{fmtNumber(feature.value)}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-bm-border px-4 py-6 text-sm text-bm-muted">
                  No features materialized yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

"use client";

/**
 * Feature Observatory (History Rhymes Episode Feature Store, Phase 0).
 *
 * Flagship learning-layer surface. For a selected episode, shows the five bands:
 *   Raw Inputs -> Derived Features -> Model Outputs -> Analog Matches -> Forecast Performance
 * proving data engineering + feature engineering + (smoke) forecasting + the
 * honest "not yet" placeholders for analog/calibration (Phases 4-5).
 *
 * Standalone full-bleed dark surface (no app shell), Tailwind neutral palette,
 * reusing mlUi primitives. Phase 0 displays an explicit model status badge and
 * never implies calibration that has not been measured.
 */

import * as React from "react";

import { HrSubNav } from "@/components/historyrhymes/HrSubNav";
import { ErrorState, Loading, Panel, StatTile, Tag, fmt } from "@/components/historyrhymes/mlUi";
import {
  fetchObservatory,
  fetchObservatoryEpisodes,
  type EpisodeListItem,
  type ObservatoryResponse,
} from "@/lib/historyrhymes/episodeObservatory";

function StatusBadge({ status }: { status?: string }) {
  const tone =
    status === "calibrated" ? "emerald" : status === "experimental" ? "amber" : "neutral";
  const label =
    status === "experimental"
      ? "EXPERIMENTAL · not calibrated"
      : status === "calibrated"
        ? "CALIBRATED"
        : (status || "unknown").toUpperCase();
  return <Tag tone={tone as "amber" | "emerald" | "neutral"}>{label}</Tag>;
}

function ProvenanceBadge({ provenance }: { provenance?: string[] }) {
  if (!provenance || provenance.length === 0) return null;
  const isFixture = provenance.includes("fixture");
  return (
    <Tag tone={isFixture ? "violet" : "sky"}>
      {isFixture ? "SYNTHETIC FIXTURE" : provenance.join(", ").toUpperCase()}
    </Tag>
  );
}

function PlannedBand({ title, reason }: { title: string; reason: string }) {
  const phase = reason.includes("phase_4") ? "Phase 4" : reason.includes("phase_5") ? "Phase 5" : "later";
  const what = reason.includes("phase_4") ? "pgvector analog retrieval" : "calibration (Brier / MAE / hit-rate)";
  return (
    <Panel title={title} right={<Tag tone="neutral">PLANNED · {phase}</Tag>}>
      <div className="text-sm text-neutral-500">
        Not available yet — {what} lands in {phase}. Shown as a placeholder rather than fabricated numbers.
      </div>
    </Panel>
  );
}

export function FeatureObservatoryClient({ envId }: { envId: string }) {
  const [episodes, setEpisodes] = React.useState<EpisodeListItem[] | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ObservatoryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetchObservatoryEpisodes();
      if (!alive) return;
      if (!res || res.status !== "ok" || res.episodes.length === 0) {
        setError("No episodes have feature-store data yet. Run the Phase 0 backfill.");
        setLoading(false);
        return;
      }
      setEpisodes(res.episodes);
      // Default to the GFC episode if present, else the first.
      const gfc = res.episodes.find((e) => e.name.includes("Global Financial"));
      setSelected((gfc || res.episodes[0]).id);
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!selected) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await fetchObservatory(selected);
      if (!alive) return;
      if (!res || res.status !== "ok" || !res.bands) {
        setError(`Observatory unavailable (${res?.null_reason ?? "fetch failed"}).`);
        setData(null);
      } else {
        setError(null);
        setData(res);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [selected]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-5 lg:px-7">
      <HrSubNav envId={envId} />

      <header className="mb-4">
        <h1 className="text-lg font-semibold">Feature Observatory</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Every historical episode as a training example: raw inputs → derived features → model
          outputs → analog matches → forecast performance. Phase 0 vertical slice.
        </p>
      </header>

      {episodes && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {episodes.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e.id)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                e.id === selected
                  ? "bg-sky-500/20 text-sky-200 border-sky-500/40"
                  : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200"
              }`}
            >
              {e.name}
              {e.is_non_event ? " · non-event" : ""}
            </button>
          ))}
        </div>
      )}

      {loading && <Loading label="Loading observatory…" />}
      {!loading && error && <ErrorState message={error} />}

      {!loading && data && data.bands && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-neutral-200">{data.episode?.name}</span>
            <Tag tone="neutral">as of {data.episode?.as_of}</Tag>
            <StatusBadge status={data.model_status} />
            <ProvenanceBadge provenance={data.data_provenance} />
          </div>

          {/* Band 0 — Data Coverage (missing data as a trust signal) */}
          {data.coverage ? (
            <Panel
              title="Data Coverage"
              right={
                <span className="text-[11px] text-neutral-500">
                  features {data.coverage.features_available}/{data.coverage.features_total} · targets{" "}
                  {data.coverage.targets_available}/{data.coverage.targets_total}
                </span>
              }
            >
              {data.coverage.unavailable.length === 0 ? (
                <div className="text-sm text-emerald-300">All features and targets available.</div>
              ) : (
                <ul className="space-y-1">
                  {data.coverage.unavailable.map((u) => (
                    <li key={`${u.kind}-${u.id}`} className="text-xs text-neutral-400 flex items-center gap-2">
                      <Tag tone="amber">{u.kind}</Tag>
                      <span className="text-neutral-200">{u.id}</span>
                      <span className="text-neutral-500">— {u.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-neutral-600 mt-2">
                Unavailable fields fail closed with a reason — never filled with a fabricated proxy.
              </p>
            </Panel>
          ) : null}

          {/* Band 1 — Raw Inputs */}
          <Panel title="1 · Raw Inputs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {data.bands.raw_inputs.map((ri) => (
                <div key={ri.family} className="bg-neutral-950/60 border border-neutral-800 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500">{ri.family}</div>
                  <div className="text-xs text-neutral-300 mt-1">{ri.raw_sources.join(", ")}</div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Band 2 — Derived Features */}
          <Panel title="2 · Derived Features">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-neutral-500">
                  <tr className="text-left">
                    <th className="py-1 pr-3 font-medium">Feature</th>
                    <th className="py-1 pr-3 font-medium">Family</th>
                    <th className="py-1 pr-3 font-medium">Transform</th>
                    <th className="py-1 pr-3 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bands.derived_features.map((f) => (
                    <tr key={f.feature_id} className="border-t border-neutral-800/60">
                      <td className="py-1.5 pr-3 text-neutral-200">{f.feature_name}</td>
                      <td className="py-1.5 pr-3 text-neutral-500">{f.family}</td>
                      <td className="py-1.5 pr-3 text-neutral-500">{f.transform}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-neutral-100">
                        {f.null_reason ? (
                          <span className="text-amber-300">{f.null_reason}</span>
                        ) : f.value_label ? (
                          <Tag tone="sky">{f.value_label}</Tag>
                        ) : (
                          fmt(f.value)
                        )}
                        {f.unit && !f.null_reason && !f.value_label ? (
                          <span className="text-neutral-600 ml-1">{f.unit}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Band 3 — Model Outputs (with explicit pipeline-smoke-model framing) */}
          <Panel
            title="3 · Model Outputs"
            right={<StatusBadge status={data.bands.model_outputs.status ?? undefined} />}
          >
            {/* Honesty header: this is a pipeline smoke model, not a calibrated forecaster. */}
            <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone="amber">{(data.bands.model_outputs.status_label ?? "pipeline smoke model").toUpperCase()}</Tag>
                <span className="text-[11px] text-neutral-400">
                  basis: {data.bands.model_outputs.training_basis ?? "—"} · calibration:{" "}
                  {data.bands.model_outputs.calibrated ? "calibrated" : "not production-calibrated"}
                </span>
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">
                Purpose: {data.bands.model_outputs.purpose ?? "validate the loop"}.
              </div>
              {data.bands.model_outputs.features_dropped.length > 0 ? (
                <div className="text-[11px] text-neutral-500 mt-1">
                  Trained on {data.bands.model_outputs.features_used.length} features; dropped{" "}
                  {data.bands.model_outputs.features_dropped.join(", ")} (unavailable).
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatTile
                label="Recession probability"
                value={
                  data.bands.model_outputs.recession_probability != null
                    ? `${(data.bands.model_outputs.recession_probability * 100).toFixed(1)}%`
                    : "—"
                }
                sub={`actual flag: ${data.bands.model_outputs.recession_flag ?? "—"}`}
              />
              <StatTile label="Model" value={data.bands.model_outputs.model ?? "—"} sub={data.bands.model_outputs.target ?? ""} />
              <StatTile label="Calibrated" value={data.bands.model_outputs.calibrated ? "yes" : "no"} sub="in-sample" />
            </div>
            {data.bands.model_outputs.note ? (
              <p className="text-[11px] text-neutral-500 mt-3">{data.bands.model_outputs.note}</p>
            ) : null}
          </Panel>

          {/* Band 4 — Analog Matches (planned) */}
          <PlannedBand title="4 · Analog Matches" reason={data.bands.analog_matches.null_reason} />

          {/* Band 5 — Forecast Performance (planned) */}
          <PlannedBand title="5 · Forecast Performance" reason={data.bands.forecast_performance.null_reason} />

          {/* Targets footnote */}
          {data.targets && data.targets.length > 0 ? (
            <Panel title="Training labels (targets)">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {data.targets.map((t) => (
                  <StatTile
                    key={`${t.target_name}-${t.horizon_days}`}
                    label={`${t.target_name} (${t.horizon_days}d)`}
                    value={t.null_reason ? <span className="text-amber-300 text-sm">{t.null_reason}</span> : fmt(t.value)}
                    sub={t.source_lineage ?? ""}
                  />
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );
}

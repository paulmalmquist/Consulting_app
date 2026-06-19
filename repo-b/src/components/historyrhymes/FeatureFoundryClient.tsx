"use client";

import * as React from "react";
import {
  fetchFeatureDetail,
  fetchFeatureOverview,
  fetchFeaturePipelineMap,
  fetchFeatureQualityBoard,
  type FeatureDetail,
  type FeatureOverview,
  type PipelineMap,
  type QualityBoard,
} from "@/lib/historyrhymes/featureStore";
import { fetchCloudConfig, type CloudConfig } from "@/lib/historyrhymes/mlDemo";
import { CloudProviderBadge } from "./CloudProviderBadge";
import { FeatureFamilyGrid } from "./FeatureFamilyGrid";
import { FeatureImportanceAcrossModels } from "./FeatureImportanceAcrossModels";
import { FeaturePipelineMap } from "./FeaturePipelineMap";
import { FeatureQualityBoard } from "./FeatureQualityBoard";
import { FeatureReadinessBadge } from "./FeatureReadinessBadge";
import { FeatureTransformationExample } from "./FeatureTransformationExample";
import { HrSubNav } from "./HrSubNav";
import { MLDetailDrawer, type DrawerPayload } from "./MLDetailDrawer";
import { ErrorState, Loading, Panel, Tag, fmt } from "./mlUi";

function featureDrawerPayload(d: FeatureDetail): DrawerPayload {
  const readiness = (d.readiness as { score?: number }) ?? {};
  return {
    mode: "feature",
    title: d.name,
    subtitle: d.family ? d.family.replace(/_/g, " ") : undefined,
    whyItMatters: d.demo_explanation ?? undefined,
    rows: [
      { label: "Definition", value: d.definition ?? "—" },
      { label: "Formula", value: <code className="text-[11px]">{d.formula ?? "—"}</code> },
      { label: "Source", value: d.source_dependencies.join(", ") || "—" },
      { label: "Cadence", value: d.cadence ?? "—" },
      { label: "Freshness", value: "fresh (synthetic, seed 42)" },
      { label: "Available at prediction time", value: String(d.availability_at_prediction_time) },
      { label: "Leakage risk", value: d.leakage_risk ?? "—" },
      { label: "Imputation policy", value: d.imputation_policy ?? "—" },
      { label: "Current value", value: fmt(d.current_value) },
      { label: "Models using", value: d.models_using.join(", ") || "—" },
      { label: "Readiness", value: fmt(typeof readiness.score === "number" ? readiness.score : null, 2) },
    ],
    links: d.external_links,
    lineage: d.lineage,
    warning:
      d.leakage_risk === "high"
        ? "Leakage risk HIGH — readiness forced to 0; the score is invalid until this feature is removed."
        : undefined,
  };
}

export function FeatureFoundryClient({ envId }: { envId: string }) {
  const [overview, setOverview] = React.useState<FeatureOverview | null>(null);
  const [board, setBoard] = React.useState<QualityBoard | null>(null);
  const [pipeline, setPipeline] = React.useState<PipelineMap | null>(null);
  const [cloud, setCloud] = React.useState<CloudConfig | null>(null);
  const [family, setFamily] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<FeatureDetail | null>(null);
  const [drawer, setDrawer] = React.useState<DrawerPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ov, qb, pm, cc] = await Promise.all([
        fetchFeatureOverview(),
        fetchFeatureQualityBoard(),
        fetchFeaturePipelineMap(),
        fetchCloudConfig(),
      ]);
      if (cancelled) return;
      if (!ov) setError("Could not load the Feature Foundry overview.");
      setOverview(ov);
      setBoard(qb);
      setPipeline(pm);
      setCloud(cc);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openFeature = React.useCallback(async (featureId: string) => {
    const d = await fetchFeatureDetail(featureId);
    if (!d) return;
    setDetail(d);
    setDrawer(featureDrawerPayload(d));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6" data-testid="hr-feature-foundry-page">
        <HrSubNav envId={envId} />
        <Loading label="Loading Feature Foundry…" />
      </div>
    );
  }
  if (error || !overview) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6" data-testid="hr-feature-foundry-page">
        <HrSubNav envId={envId} />
        <ErrorState message={error ?? "Overview unavailable."} />
      </div>
    );
  }

  const features = family ? overview.features.filter((f) => f.family === family) : overview.features;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6" data-testid="hr-feature-foundry-page">
      <div className="max-w-6xl mx-auto">
        <HrSubNav envId={envId} />

        <header className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-neutral-50">{overview.title}</h1>
              <p className="text-sm text-neutral-400 mt-1">{overview.subtitle}</p>
            </div>
            <CloudProviderBadge config={cloud} />
          </div>
          <p className="text-xs text-neutral-400 mt-3 max-w-3xl border-l-2 border-neutral-700 pl-3">{overview.lesson}</p>
        </header>

        <div className="mb-4">
          <FeaturePipelineMap map={pipeline} />
        </div>

        <div className="mb-4">
          <Panel title={`Feature families (${overview.family_count})`}>
            <FeatureFamilyGrid overview={overview} selected={family} onSelect={setFamily} />
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Panel title={`Features${family ? ` — ${family.replace(/_/g, " ")}` : ""}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((f) => (
                <button
                  key={f.feature_id}
                  type="button"
                  data-testid="hr-feature-card"
                  onClick={() => openFeature(f.feature_id)}
                  className={`text-left rounded-md border p-2 transition-colors ${
                    detail?.feature_id === f.feature_id
                      ? "border-sky-500/60"
                      : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
                  }`}
                >
                  <div className="text-xs font-mono text-neutral-100">{f.feature_id}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-neutral-500 capitalize">{f.family.replace(/_/g, " ")}</span>
                    {f.leakage_risk === "high" ? <Tag tone="red">leaky</Tag> : null}
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <div>
            {detail ? (
              <Panel
                title={detail.name}
                right={
                  <button
                    type="button"
                    onClick={() => setDrawer(featureDrawerPayload(detail))}
                    className="text-[10px] text-sky-300 hover:text-sky-200 underline"
                  >
                    Open detail
                  </button>
                }
              >
                <div className="space-y-3">
                  <FeatureReadinessBadge readiness={detail.readiness} />
                  <p className="text-xs text-neutral-300">{detail.demo_explanation}</p>
                  <div className="text-[11px] text-neutral-500">
                    <span className="text-neutral-400">Formula:</span>{" "}
                    <code className="text-neutral-300">{detail.formula}</code>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Transformation</div>
                    <FeatureTransformationExample detail={detail} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Importance across models</div>
                    <FeatureImportanceAcrossModels entries={detail.importance_across_models} />
                  </div>
                </div>
              </Panel>
            ) : (
              <Panel title="Feature detail">
                <div className="text-sm text-neutral-500">Select a feature to see its formula, transformation, readiness, and per-model importance.</div>
              </Panel>
            )}
          </div>
        </div>

        <div className="mb-4">
          <FeatureQualityBoard board={board} onSelect={openFeature} />
        </div>

        <p className="text-xs text-neutral-500 mb-10 border-l-2 border-neutral-700 pl-3">{overview.closer}</p>
      </div>

      <MLDetailDrawer payload={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

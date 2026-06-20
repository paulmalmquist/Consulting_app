"use client";

import * as React from "react";
import {
  fetchCloudConfig,
  fetchCurveballs,
  fetchMlAlgorithms,
  fetchMlCompare,
  fetchMlDataset,
  fetchMlOverview,
  runMlAlgorithm,
  type AlgorithmResult,
  type CloudConfig,
  type CompareRow,
  type Curveball,
  type DatasetProfile,
  type Overview,
  type Scenario,
} from "@/lib/historyrhymes/mlDemo";
import { AlgorithmCardGrid } from "./AlgorithmCardGrid";
import { AlgorithmComparisonMatrix } from "./AlgorithmComparisonMatrix";
import { AlgorithmDetailPanel } from "./AlgorithmDetailPanel";
import { AlgorithmLabHero } from "./AlgorithmLabHero";
import { BusinessQuestionSelector, type QuestionFilter } from "./BusinessQuestionSelector";
import { DatasetProfilePanel } from "./DatasetProfilePanel";
import { DemoScriptPanel, HowToChoosePanel } from "./HowToChoosePanel";
import { HrSubNav } from "./HrSubNav";
import { MLDetailDrawer, type DrawerPayload } from "./MLDetailDrawer";
import { RealityModePanel } from "./RealityModePanel";
import { ErrorState, Loading, Panel, Tag } from "./mlUi";

const EMPTY_SCENARIO: Scenario = { toggles: [] };

export function MLAlgorithmLabClient({ envId }: { envId: string }) {
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [dataset, setDataset] = React.useState<DatasetProfile | null>(null);
  const [algorithms, setAlgorithms] = React.useState<AlgorithmResult[]>([]);
  const [disagreement, setDisagreement] = React.useState<Record<string, unknown> | null>(null);
  const [compare, setCompare] = React.useState<{ dimensions: string[]; rows: CompareRow[] } | null>(null);
  const [curveballs, setCurveballs] = React.useState<Curveball[]>([]);
  const [cloudConfig, setCloudConfig] = React.useState<CloudConfig | null>(null);

  const [filter, setFilter] = React.useState<QuestionFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [scenario, setScenario] = React.useState<Scenario>(EMPTY_SCENARIO);
  const [drawer, setDrawer] = React.useState<DrawerPayload | null>(null);
  const [running, setRunning] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Static content (loaded once).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ov, ds, cb, cc] = await Promise.all([
        fetchMlOverview(),
        fetchMlDataset(),
        fetchCurveballs(),
        fetchCloudConfig(),
      ]);
      if (cancelled) return;
      if (!ov) setError("Could not load the ML demo overview.");
      setOverview(ov);
      setDataset(ds);
      setCurveballs(cb?.curveballs ?? []);
      setCloudConfig(cc);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Scenario-dependent content (re-fetched when Reality Mode changes).
  React.useEffect(() => {
    let cancelled = false;
    const active = scenario.toggles.length > 0 ? scenario : null;
    (async () => {
      const [algos, cmp] = await Promise.all([
        fetchMlAlgorithms(active),
        fetchMlCompare(active),
      ]);
      if (cancelled) return;
      setAlgorithms(algos?.algorithms ?? []);
      setDisagreement(algos?.disagreement ?? null);
      setCompare(cmp);
      if (!selectedId && algos?.algorithms?.length) setSelectedId(algos.algorithms[0].algorithm_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [scenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = algorithms.find((a) => a.algorithm_id === selectedId) ?? null;

  const handleRun = async () => {
    if (!selected) return;
    setRunning(true);
    const active = scenario.toggles.length > 0 ? scenario : null;
    const fresh = await runMlAlgorithm(selected.algorithm_id, active);
    if (fresh) {
      setAlgorithms((prev) => prev.map((a) => (a.algorithm_id === fresh.algorithm_id ? fresh : a)));
    }
    setRunning(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6" data-testid="hr-ml-algorithms-page">
        <HrSubNav envId={envId} />
        <Loading label="Loading ML Algorithm Decision Lab…" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6" data-testid="hr-ml-algorithms-page">
        <HrSubNav envId={envId} />
        <ErrorState message={error ?? "Overview unavailable."} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6" data-testid="hr-ml-algorithms-page">
      <div className="max-w-6xl mx-auto">
        <HrSubNav envId={envId} />
        <AlgorithmLabHero overview={overview} cloudConfig={cloudConfig} />

        <div className="mb-4">
          <BusinessQuestionSelector selected={filter} onSelect={setFilter} />
        </div>

        <div className="mb-4">
          <RealityModePanel curveballs={curveballs} scenario={scenario} onChange={setScenario} />
        </div>

        {disagreement ? (
          <div className="mb-4">
            <Tag tone="violet">
              Model disagreement index: {String((disagreement as { index?: number }).index ?? 0)}
            </Tag>
            <span className="text-[11px] text-neutral-500 ml-2">Disagreement is information, not a bug.</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Panel title="Algorithms">
            <AlgorithmCardGrid
              algorithms={algorithms}
              filter={filter}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Panel>
          <div>
            {selected ? (
              <AlgorithmDetailPanel result={selected} running={running} onRun={handleRun} onDrill={setDrawer} />
            ) : (
              <Panel title="Detail">
                <div className="text-sm text-neutral-500">Select an algorithm to see its model card and charts.</div>
              </Panel>
            )}
          </div>
        </div>

        {compare ? (
          <div className="mb-4">
            <AlgorithmComparisonMatrix dimensions={compare.dimensions} rows={compare.rows} onSelect={setSelectedId} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {dataset ? <DatasetProfilePanel profile={dataset} /> : null}
          <HowToChoosePanel overview={overview} />
        </div>

        <div className="mb-10">
          <DemoScriptPanel overview={overview} />
        </div>
      </div>

      <MLDetailDrawer payload={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

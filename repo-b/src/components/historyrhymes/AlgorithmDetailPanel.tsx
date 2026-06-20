"use client";

import type { AlgorithmResult, ModelCard as ModelCardType } from "@/lib/historyrhymes/mlDemo";
import { AlgorithmChartPanel } from "./AlgorithmChartPanel";
import { ExternalResourceLinks } from "./ExternalResourceLinks";
import { HonestMetricsPanel } from "./HonestMetricsPanel";
import { LineageMiniGraph } from "./LineageMiniGraph";
import { ModelCard } from "./ModelCard";
import type { DrawerPayload } from "./MLDetailDrawer";
import { ErrorState, Panel, Tag } from "./mlUi";

export function AlgorithmDetailPanel({
  result,
  running,
  onRun,
  onDrill,
}: {
  result: AlgorithmResult;
  running: boolean;
  onRun: () => void;
  onDrill: (p: DrawerPayload) => void;
}) {
  if (result.status !== "ok") {
    return (
      <Panel title={result.name}>
        <ErrorState message={`Model unavailable: ${result.null_reason ?? "unknown reason"}`} />
        <div className="mt-3">
          <ModelCard card={result.model_card as ModelCardType} />
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title={result.name}
        right={
          <div className="flex items-center gap-2">
            <Tag tone="neutral">{(result.task_type ?? "").replace(/_/g, " ")}</Tag>
            <button
              type="button"
              onClick={onRun}
              disabled={running}
              className="text-xs px-3 py-1 rounded border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              {running ? "Running…" : "Run"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-neutral-300">{result.business_question}</p>
      </Panel>

      <Panel title="Honest metrics">
        <HonestMetricsPanel result={result} />
      </Panel>

      <Panel title="Charts">
        <AlgorithmChartPanel result={result} onDrill={onDrill} />
      </Panel>

      <Panel title="Model card">
        <ModelCard card={result.model_card as ModelCardType} />
      </Panel>

      <Panel
        title="Evidence & lineage"
        right={
          <button
            type="button"
            onClick={() =>
              onDrill({
                mode: "lineage",
                title: `${result.name} — lineage`,
                subtitle: `${result.evidence.model_version} · seed ${result.evidence.seed}`,
                links: result.external_links,
                lineage: result.lineage,
              })
            }
            className="text-[10px] text-sky-300 hover:text-sky-200 underline"
          >
            Open lineage
          </button>
        }
      >
        <div className="mb-2">
          <ExternalResourceLinks links={result.external_links} />
        </div>
        <LineageMiniGraph lineage={result.lineage} />
      </Panel>
    </div>
  );
}

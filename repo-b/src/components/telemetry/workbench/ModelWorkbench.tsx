"use client";

import { TelemetryPageHeader } from "../TelemetryPageHeader";
import { C, DisclosureFooter, Panel } from "../primitives";
import { ChampionReviewPanel } from "./ChampionReviewPanel";
import { ExperimentReplayButton } from "./ExperimentReplayButton";
import { ExperimentTrackingPanel } from "./ExperimentTrackingPanel";
import { FeatureSetSelector } from "./FeatureSetSelector";
import { LifecycleStepper } from "./LifecycleStepper";
import { DriftPanel, EmbeddingPanel, FactoryShapPanel, ParityPanel } from "./SupportingPanels";
import { WorkbenchDrillButton } from "./WorkbenchDrillButton";
import { WorkbenchHeadlineCard } from "./WorkbenchHeadlineCard";

// Model Workbench landing — composed inside the existing telemetry shell (Models & Intelligence group).
// The thesis sits in the header; the headline card states the experiment without a drawer; the stepper
// is the lifecycle spine; the selector is the feature-tightening entry point. Everything replays
// committed receipts — nothing trains live.
export default function ModelWorkbench() {
  return (
    <>
      <TelemetryPageHeader
        variant="standard"
        eyebrow="Model Workbench"
        title="Inspect, measure, and promote the safest model"
        description="The goal was not to make the fanciest model win — it was to make the safest model inspectable, measurable, and promotable only when it beats a declared baseline under operational metrics. Every result here replays a committed receipt; nothing trains live."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <WorkbenchHeadlineCard />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ExperimentReplayButton />
          <WorkbenchDrillButton />
        </div>
        <Panel title="ML lifecycle">
          <LifecycleStepper activeSlug="workbench" />
        </Panel>
        <Panel title="Feature sets — baseline → temporal → diagnostic">
          <FeatureSetSelector />
        </Panel>
        <Panel title="Champion review — why MAD stayed champion">
          <ChampionReviewPanel />
        </Panel>
        <Panel title="Experiment tracking — Vertex runs & HPO">
          <ExperimentTrackingPanel />
        </Panel>
        <Panel title="Parity — GCP reproduces the champion (no Databricks)">
          <ParityPanel />
        </Panel>
        <Panel title="Supporting evidence — drift · latent · explainability">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <DriftPanel />
            <EmbeddingPanel />
            <FactoryShapPanel />
          </div>
        </Panel>
        <Panel pad={14}>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
            Next in the loop: replay an experiment receipt, study the threshold sweep and the
            false-positive / false-negative review, compare against the MAD champion, and drill any
            prediction to its feature vector, math, run, and gate. Real receipts are produced offline by
            the GCP MLOps pipeline and committed verbatim — the Workbench never triggers live compute.
          </span>
        </Panel>
      </div>
      <DisclosureFooter />
    </>
  );
}

"use client";

// Resume-Claim Evidence — the "click each claim → live proof" surface.
// One page composing the six evidence cards, each binding to real endpoints and
// failing closed independently. Pairs with the repo-root claim_coverage_matrix.md
// (the claim → status → file:symbol → say-live → don't-overclaim matrix) and
// PLAN_DIVERGENCE_REVIEW.md. Nothing here is seeded: every value is fetched or an
// explicit unavailable state; the Stargate capture is labeled recorded.

import { C } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import DataCollectionCard from "./DataCollectionCard";
import ModelEvidenceCard from "./ModelEvidenceCard";
import RulConformalCard from "./RulConformalCard";
import RegimeAnomalyCard from "./RegimeAnomalyCard";
import CompetenceEnvelopeCard from "./CompetenceEnvelopeCard";
import PipelineEvidenceCard from "./PipelineEvidenceCard";
import FeatureContractCard from "./FeatureContractCard";
import KnownAnomalyCard from "./KnownAnomalyCard";
import AiEvidenceCard from "./AiEvidenceCard";
import DeploymentReceiptCard from "./DeploymentReceiptCard";

function Lead() {
  return (
    <TelemetryPageHeader
      variant="evidence"
      eyebrow="Resume-Claim Evidence"
      title="Every claim, mapped to a live proof"
      description="Each card binds to a real endpoint and fails closed when a source is missing — no seeded numbers. Honest by construction: the autoencoder is shown as the judgment artifact it is (the rolling-MAD detector is the champion), RUL is point-prediction until conformal intervals land, and the live stream is labeled recorded capture, not a live printer."
    />
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "30px 0" }} />;
}

export default function EvidenceCards() {
  return (
    <div>
      <Lead />
      <DataCollectionCard />
      <Divider />
      <ModelEvidenceCard />
      <Divider />
      <RulConformalCard />
      <Divider />
      <RegimeAnomalyCard />
      <Divider />
      <CompetenceEnvelopeCard />
      <Divider />
      <PipelineEvidenceCard />
      <Divider />
      <FeatureContractCard />
      <Divider />
      <KnownAnomalyCard />
      <Divider />
      <AiEvidenceCard />
      <Divider />
      <DeploymentReceiptCard />
    </div>
  );
}

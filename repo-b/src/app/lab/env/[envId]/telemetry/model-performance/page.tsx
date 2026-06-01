import ModelPerformance from "@/components/telemetry/ModelPerformance";
import { PageHeader } from "@/components/telemetry/primitives";

export default function TelemetryModelPerformancePage() {
  return (
    <>
      <PageHeader
        eyebrow="Model Performance"
        title="Champions, metrics, and promotion gates"
        blurb="Exact metrics from the registry-backed serving API — no hardcoded numbers. Baseline vs stronger model side by side, with the promotion decision shown honestly."
      />
      <ModelPerformance />
    </>
  );
}

import Monitoring from "@/components/telemetry/Monitoring";
import { PageHeader } from "@/components/telemetry/primitives";

export default function TelemetryMonitoringPage() {
  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Drift, anomaly rate, and serving health"
        blurb="Aggregated from the live prediction log. The panel that says 'operated, not trained once' — and it shows a dash, not a fake zero, when a metric is not yet computed."
      />
      <Monitoring />
    </>
  );
}

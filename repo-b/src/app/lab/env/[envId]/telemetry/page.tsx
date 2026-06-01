import TelemetryOverview from "@/components/telemetry/TelemetryOverview";
import { PageHeader } from "@/components/telemetry/primitives";

export default async function TelemetryHomePage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Telemetry Anomaly Platform"
        title="Turning engine-test telemetry into automated go/no-go"
        blurb="A test-stand console over a real operated loop: public NASA telemetry ingested in Databricks, models trained and gated in MLflow, served behind an API, and monitored for drift. Start with the Replay."
      />
      <TelemetryOverview envId={envId} />
    </>
  );
}

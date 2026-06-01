import RunsExplorer from "@/components/telemetry/RunsExplorer";
import { PageHeader } from "@/components/telemetry/primitives";

export default function TelemetryRunsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Test Run Explorer"
        title="Ingested test runs"
        blurb="Every run ingested into the lakehouse and exposed to the serving layer, with dataset, unit/channel, and row counts."
      />
      <RunsExplorer />
    </>
  );
}

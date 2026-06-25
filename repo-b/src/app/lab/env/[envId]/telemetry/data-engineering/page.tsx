import DataEngineeringOverview from "@/components/telemetry/data-engineering/DataEngineeringOverview";

export default async function DataEngineeringPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <DataEngineeringOverview envId={envId} />;
}

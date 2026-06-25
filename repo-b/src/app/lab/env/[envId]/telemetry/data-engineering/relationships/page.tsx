import RelationshipsLineage from "@/components/telemetry/data-engineering/RelationshipsLineage";

export default async function DataEngineeringRelationshipsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <RelationshipsLineage envId={envId} />;
}

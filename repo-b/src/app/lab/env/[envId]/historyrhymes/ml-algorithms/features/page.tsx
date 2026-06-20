import { FeatureFoundryClient } from "@/components/historyrhymes/FeatureFoundryClient";

export default async function FeatureFoundryPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <FeatureFoundryClient envId={envId} />;
}

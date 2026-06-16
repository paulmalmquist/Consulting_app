import { FeatureObservatoryClient } from "@/components/historyrhymes/FeatureObservatoryClient";

export default async function FeatureObservatoryPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <FeatureObservatoryClient envId={envId} />;
}

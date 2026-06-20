import FunnelClient from "@/components/healthcare-subscription/FunnelClient";

export default async function HealthcareSubscriptionFunnelPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <FunnelClient envId={envId} />;
}

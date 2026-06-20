import CohortsClient from "@/components/healthcare-subscription/CohortsClient";

export default async function HealthcareSubscriptionCohortsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <CohortsClient envId={envId} />;
}

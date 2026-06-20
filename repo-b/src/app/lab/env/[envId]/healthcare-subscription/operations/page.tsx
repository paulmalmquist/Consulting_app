import OperationsClient from "@/components/healthcare-subscription/OperationsClient";

export default async function HealthcareSubscriptionOperationsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <OperationsClient envId={envId} />;
}

import OverviewClient from "@/components/healthcare-subscription/OverviewClient";

// Standalone, no app shell — the component owns its full chrome (see
// docs/plans/healthcare-subscription/design-adaptation.md). SYNTHETIC / NO-PHI.
export default async function HealthcareSubscriptionHomePage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <OverviewClient envId={envId} />;
}

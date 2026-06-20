import HowItWorks from "@/components/telemetry/HowItWorks";

// Thin wrapper. The telemetry layout already yields full-bleed and carries the dark palette;
// forward the env id so the exhibit's deep-links stay scoped to this environment.
export default async function TelemetryHowItWorksPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <HowItWorks envId={envId} />;
}

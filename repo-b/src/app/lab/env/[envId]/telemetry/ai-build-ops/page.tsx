import AiBuildOpsReference from "@/components/telemetry/buildops/AiBuildOpsReference";

// Thin wrapper. The telemetry layout already yields full-bleed and carries the dark palette; forward
// the env id so any future env-scoped deep links stay scoped to this environment. The reference itself
// is a static document — no fetch, no live compute.
export default async function TelemetryAiBuildOpsPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <AiBuildOpsReference envId={envId} />;
}

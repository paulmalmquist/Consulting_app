import SystemHealth from "@/components/telemetry/SystemHealth";

export default async function TelemetrySystemHealthPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <SystemHealth envId={envId} />;
}

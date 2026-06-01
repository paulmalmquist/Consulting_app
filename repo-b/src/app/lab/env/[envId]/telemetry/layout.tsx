import TelemetryShell from "@/components/telemetry/TelemetryShell";

// Full-bleed telemetry workbench. The lab shell yields full-bleed for /telemetry (isDomainRoute),
// and TelemetryShell carries the Option B dark palette inline, so no theme pinning is needed here.
export default async function TelemetryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <TelemetryShell envId={envId}>{children}</TelemetryShell>;
}

import { CopilotWorkbench } from "@/components/telemetry/Copilot";

export default async function TelemetryCopilotPage({ params }: { params: Promise<{ envId: string }> }) {
  const { envId } = await params;
  return <CopilotWorkbench envId={envId} />;
}

import { loadNCFLiveMetrics } from "@/lib/server/ncfMetrics";
import ExecutiveView from "./ExecutiveView";

export default async function NCFExecutivePage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  const liveMetrics = await loadNCFLiveMetrics(envId);
  return <ExecutiveView envId={envId} liveMetrics={liveMetrics} />;
}

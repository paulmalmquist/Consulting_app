import { HistoryRhymesPlanningClient } from "@/components/historyrhymes/HistoryRhymesPlanningClient";

export default async function HistoryRhymesPlanningPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <HistoryRhymesPlanningClient envId={envId} />;
}

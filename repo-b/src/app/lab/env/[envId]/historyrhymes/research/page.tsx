import { ResearchArchiveClient } from "@/components/historyrhymes/ResearchArchiveClient";

export default async function HistoryRhymesResearchPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <ResearchArchiveClient envId={envId} />;
}

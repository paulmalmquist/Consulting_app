import { MorningBookClient } from "@/components/historyrhymes/MorningBookClient";

export default async function HistoryRhymesMorningBookPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <MorningBookClient envId={envId} />;
}
